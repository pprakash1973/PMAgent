# Azure deployment — hybrid tenancy

Constraints and required configuration for running PM Agent on Azure. Derived from
the security and compatibility review; each item references its finding ID.

## Supported hosting targets

| Target | Supported | Why |
|---|---|---|
| **App Service (Linux, Node 20/22)** | ✅ Recommended | Long-lived process — background generation completes |
| **Container Apps, `minReplicas: 1`** | ✅ | Same, provided it never scales to zero |
| **Container Apps, scale-to-zero** | ❌ | KEDA terminates the container once the HTTP response is sent |
| **Static Web Apps / Functions (consumption)** | ❌ | The worker is frozen after the response; background work is killed |

### Why (A3)

Artifact generation returns `202 Accepted` immediately and continues in the
background via `after()` from `next/server` — see
`src/app/api/projects/[id]/artifacts/route.ts`. That work only survives if the
host keeps the process alive after the response is flushed.

On a scale-to-zero or consumption host the request succeeds, the model call is
killed mid-flight, and the artifact is stranded in `status: "generating"` until
the 10-minute stale sweep in the `GET` handler marks it `failed`. The UI recovers,
but no artifact is ever produced.

**If you must deploy to a scale-to-zero host**, move generation to a durable queue
(Service Bus + a worker container) rather than relying on `after()`.

## Required application settings

| Setting | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | **Yes** | ≥ 32 chars. The app **refuses to boot** without it (C4) — `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | Set in code | `trustHost: true` is set in `src/lib/auth.ts` (A2). Auth.js only auto-trusts the host on Vercel; without this every sign-in fails `UntrustedHost` |
| `NEXTAUTH_URL` | **Yes** | Public origin. Used to build invitation links — a wrong value sends users to `localhost` |
| `DATABASE_URL` | **Yes** | Postgres connection string |
| `DATABASE_CA_CERT` | If private CA | PEM. Certificate verification is **on** (H2); supply this when the server uses an enterprise/private CA |
| `DATABASE_POOL_MAX` | Recommended | Default `5`. This is **per worker process**, and App Service runs several per instance — size it against the server's connection ceiling |
| `CRON_SECRET` | **Yes** | Bearer token for `/api/cron/*` (H3). Unset means the endpoint refuses all callers |
| `ANTHROPIC_API_KEY` | **Yes** | Or configure it through the admin API-keys screen |

## Semantic retrieval (embeddings)

Optional. Without it, evidence retrieval runs keyword-only — the app deploys and
works normally, it just loses the semantic arm of hybrid search.

Every setting below can also be stored in the `SystemSetting` table under the
`embedding.*` key shown; the database value wins over the environment variable.

### Choosing an endpoint

**This is the only step that transmits raw client document text** (SOW, MSA, BRD)
to an inference endpoint. In a hybrid tenancy that choice is a data-residency
decision, not just a cost one.

| Setting | Key | Notes |
|---|---|---|
| `EMBEDDING_PROVIDER` | `embedding.provider` | `azure`, `openai`, or `off`. Omit to auto-detect: Azure if its endpoint is set, else OpenAI if a key exists, else off |
| `AZURE_OPENAI_ENDPOINT` | `embedding.azure.endpoint` | e.g. `https://<resource>.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | `embedding.azure.apiKey` | |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | `embedding.azure.deployment` | Deployment name. **Must be `text-embedding-3-small`** — see below |
| `AZURE_OPENAI_API_VERSION` | `embedding.azure.apiVersion` | Defaults to `2024-10-21` |
| `OPENAI_API_KEY` | `api_key.openai` | Only for the external endpoint |

**Azure (in-tenant)** keeps document text inside your boundary and is the only
configuration under which `restricted`-tier documents are embedded at all.
**OpenAI direct** needs no setup but sends chunk text to `api.openai.com` —
confirm that is covered by your client DPAs before enabling it.

### The model is fixed, not configurable

`text-embedding-3-small` at **1536 dimensions**, asserted in
`src/lib/embeddings.ts`. Vectors from different models are not comparable, so a
corpus embedded by one cannot be searched by another. If the Azure deployment
points at a different model the app detects the dimension mismatch and disables
the semantic arm rather than storing unusable vectors.

Switching endpoints between Azure and OpenAI is safe — same model, same
dimensionality, so existing vectors stay valid.

### pgvector

`scripts/migrate-neon-all.js` runs `CREATE EXTENSION IF NOT EXISTS vector`
**best-effort**: a failure is logged and the deploy continues. Two things
commonly make it fail, neither of which should block a release:

- the deploy role lacks `CREATE EXTENSION`
- on **Azure Database for PostgreSQL Flexible Server**, `vector` must first be
  allowlisted in the `azure.extensions` server parameter — this is a server
  restart, so plan it ahead of the release rather than during it

There is deliberately **no HNSW/IVFFlat index**. Every semantic query filters by
`projectId` first, and approximate indexes are traversed globally then
post-filtered, so a project holding a small share of the corpus can silently get
far fewer than *k* results. Exact KNN over one project's chunks is single-digit
milliseconds at this scale. Revisit only if a single project exceeds ~50k chunks.

### Backfilling existing documents

New uploads embed automatically in the background. Documents ingested before
this feature need one pass:

```bash
npx tsx scripts/backfill-embeddings.ts --dry-run
```

Dry run reports chunk count and estimated cost. Drop the flag to run it. It is
idempotent and resumable — it only selects `WHERE embedding IS NULL` — and safe
against a live database, since retrieval treats a partially embedded corpus as
normal. Roughly **$0.001 per 100-page document**.

## Build and release

`output: "standalone"` is set in `next.config.ts` (A1). Deploy `.next/standalone`
plus `.next/static` and `public/`.

**Move migrations out of the build.** `package.json` currently runs
`node scripts/migrate-neon-all.js` inside `npm run build`. That requires the build
agent to have network line-of-sight to the database, which it will not have when
the database sits behind a private endpoint — the normal hybrid pattern. Run
migrations as a separate release step from an agent inside the VNet, and drop them
from the build command.

Pin the Node version — there is no `engines` field, so App Service will pick its
own default.

## Request timeout (A4)

App Service enforces a **230-second** load-balancer timeout that cannot be raised.
All `maxDuration` exports are capped at `220`. `maxDuration` itself is a Vercel
directive and is ignored by Azure; the cap exists so behaviour matches on both.

## Data residency

`vercel.json` pins `regions: ["iad1"]` (US East) and is ignored on Azure. Choose
the Azure region deliberately — UK/EU customer data carries residency obligations
that US East does not satisfy.

Two paths send customer content off-box, and they are governed separately:

| Path | Content | Control |
|---|---|---|
| Artifact generation | Project metadata + retrieved chunks | `ANTHROPIC_API_KEY` — always external |
| Embedding | Raw chunk text at ingestion | Endpoint choice above; in-tenant when Azure |

Documents marked `confidentialityTier = "restricted"` are embedded **only** when
the endpoint is in-tenant. On an external endpoint they are skipped and stay
keyword-searchable — hybrid retrieval degrades to lexical for those chunks and
nothing else changes. This is enforced in `canEmbedTier()` and covered by
`npm run test:grounding`.

## Known unpatched dependency

`xlsx` (SheetJS) has an open ReDoS advisory with **no published fix** on the npm
registry. It is reachable from artifact upload. Mitigated by the 15 MB size cap and
extension allowlist in the upload route (M2). To close it properly, move to the
vendor-distributed build (`https://cdn.sheetjs.com/`) or replace the parser.
