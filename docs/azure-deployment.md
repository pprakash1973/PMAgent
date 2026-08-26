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

## Known unpatched dependency

`xlsx` (SheetJS) has an open ReDoS advisory with **no published fix** on the npm
registry. It is reachable from artifact upload. Mitigated by the 15 MB size cap and
extension allowlist in the upload route (M2). To close it properly, move to the
vendor-distributed build (`https://cdn.sheetjs.com/`) or replace the parser.
