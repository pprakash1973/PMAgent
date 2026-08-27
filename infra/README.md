# Azure provisioning runbook — PM Agent

Green-field provisioning. Nothing exists yet; this creates it.

> **Not yet executed.** No Azure resources have been provisioned and the Azure CLI
> is not installed on the machine these templates were authored on, so
> `main.bicep` has **not** been compiled, linted or deployed. Run
> `az bicep build --file infra/main.bicep` and a `--what-if` deployment before
> trusting it. Test case **ST-03** in the test workbook is the gate this runbook
> exists to clear, and it is marked Not Run for this reason.

## What the template creates

| Resource | Purpose |
|---|---|
| App Service plan (Linux) | Compute. B1 is the smallest SKU supporting `alwaysOn` |
| Web app | The application, running the Next.js standalone bundle |
| Key vault | Secret storage, RBAC-authorised, referenced by the app's managed identity |
| Log Analytics workspace | Log sink |
| Application Insights | Telemetry, workspace-based |

**It deliberately does not create the database.** PM Agent needs PostgreSQL with
`pgvector`, and the choice between Azure Database for PostgreSQL Flexible Server
and a managed provider like Neon has residency and networking consequences that
belong to your infra team, not to a template. See *Database* below.

**It deliberately does not set any secret value.** A secret passed as a Bicep
parameter is written to the deployment history in plain text and readable by
anyone with reader access to the resource group.

## Two settings that are load-bearing

**`alwaysOn: true`.** Artifact generation is detached from the HTTP request using
`after()` from `next/server`. That requires a process which outlives the
response. On a plan that idles out or scales to zero, generation is killed
mid-flight and the artifact is left stuck in `generating`. Any SKU below Basic
cannot set this. If you later move to Container Apps with scale-to-zero, the
generation path must be converted to a queue worker first.

**`linuxFxVersion` must match the Node major the bundle was built with.** A
mismatch surfaces as native module load failures at boot, not at deploy time.
`package.json` declares `engines.node >= 20`; the template defaults to Node 22.

## Sequence

### 1. Resource group

```bash
az group create --name rg-pmagent-dev --location southeastasia
```

Choose the region deliberately. UK and EU customer data carry residency
obligations that other regions do not satisfy.

### 2. Validate before deploying

```bash
az deployment group what-if --resource-group rg-pmagent-dev --template-file infra/main.bicep --parameters infra/main.parameters.json
```

### 3. Deploy the infrastructure

```bash
az deployment group create --resource-group rg-pmagent-dev --template-file infra/main.bicep --parameters infra/main.parameters.json
```

Note the `keyVaultName` and `webAppName` outputs.

### 4. Database

PM Agent requires PostgreSQL 14+ with the `pgvector` extension.

**On Azure Database for PostgreSQL Flexible Server**, `vector` must be
allowlisted in the `azure.extensions` server parameter *before* the app runs its
migration. **This requires a server restart**, so schedule it ahead of the
release rather than discovering it during one:

```bash
az postgres flexible-server parameter set --resource-group rg-pmagent-dev --server-name <server> --name azure.extensions --value vector
```

If the extension is unavailable the deploy still succeeds — `migrate-neon-all.js`
creates it best-effort and logs a warning. The app then runs keyword-only
retrieval, which is fully functional. This is verified by test case **DB-06**.

**Outbound port 5432.** If your Azure egress policy blocks it, set
`useWebSocketDbDriver: true` so the app routes Prisma over WSS/443 instead. The
failure mode when it is blocked is an `ECONNRESET` roughly 20 seconds into the
handshake, which reads as a timeout and is easily misdiagnosed as the database
being down. Verified by test case **DB-08**.

### 5. Populate secrets

```bash
az keyvault secret set --vault-name <kv> --name auth-secret --value "$(openssl rand -base64 32)"
az keyvault secret set --vault-name <kv> --name cron-secret --value "$(openssl rand -base64 32)"
az keyvault secret set --vault-name <kv> --name database-url --value "<connection string>"
az keyvault secret set --vault-name <kv> --name anthropic-api-key --value "<key>"
```

`auth-secret` must be at least 32 characters — the app throws at startup
otherwise, by design (test case **SEC-05**).

### 6. Build and deploy the application

```bash
npm ci && npx prisma generate && npx next build
```

The standalone bundle needs three parts assembled — `next build` does not do
this for you:

```bash
mkdir -p deploy && cp -r .next/standalone/. deploy/ && mkdir -p deploy/.next && cp -r .next/static deploy/.next/static && cp -r public deploy/public 2>/dev/null; cd deploy && zip -r ../app.zip . && cd ..
```

```bash
az webapp deploy --resource-group rg-pmagent-dev --name <app> --src-path app.zip --type zip
```

### 7. Verify

```bash
az webapp log tail --resource-group rg-pmagent-dev --name <app>
```

Then work through test cases **ST-03** and **ST-04** in the test workbook.

## Migrations: two approaches

`npm run build` currently runs `node scripts/migrate-neon-all.js` before
`next build`. Both options below are viable; the right one depends on whether
the database is publicly reachable.

### Option A — keep migrations in the build

**Works when** the database is publicly reachable, as Neon is today.

Nothing to change. Simpler, one step, and the schema can never lag the code
because they ship together.

**Breaks when** the database moves behind a private endpoint. The build agent
will not have network line-of-sight to it, and the build fails with a connection
error that looks like an outage. It also means every build — including one that
is never deployed — mutates the database.

### Option B — migrations as a separate release stage

**Required when** the database is behind a private endpoint or otherwise
restricted to a VNet.

Split the script:

```json
"build": "prisma generate && next build",
"migrate": "node scripts/migrate-neon-all.js"
```

Then run `npm run migrate` as its own pipeline stage, from an agent inside the
VNet, gated between build and deploy. Every statement is `IF NOT EXISTS`, so the
stage is safe to re-run and safe to run concurrently with the old version still
serving (test case **DB-03**).

**Costs** an extra pipeline stage and introduces a window where migrated schema
and un-deployed code coexist. The migrations are additive only, so that window
is safe — but it stops being safe the first time someone writes a destructive
migration, and nothing currently enforces that.

### Recommendation

Start with **A** while the database is public, and switch to **B** before any
private-endpoint work. Switching later is a two-line change to `package.json`
plus a pipeline stage; the script itself needs no modification.

## Application settings reference

Set by the template:

| Setting | Source |
|---|---|
| `AUTH_SECRET` | Key vault reference |
| `DATABASE_URL` | Key vault reference |
| `ANTHROPIC_API_KEY` | Key vault reference |
| `CRON_SECRET` | Key vault reference |
| `NEXTAUTH_URL` | Parameter, defaults to the app's own hostname |
| `DATABASE_POOL_MAX` | `5` — per worker process, not per instance |
| `DATABASE_DRIVER` | `neon` when `useWebSocketDbDriver` is true |
| `EMBEDDING_PROVIDER` | `off` until an embedding endpoint exists |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` — the bundle is built in CI |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | From the created component |

Add manually when the relevant feature is enabled:

| Setting | When |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | Enabling semantic retrieval in-tenant |
| `AZURE_OPENAI_API_KEY` | As above — store in key vault |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | As above. Must be `text-embedding-3-small` |
| `OPENAI_API_KEY` | Only for the external embedding endpoint |
| `DATABASE_CA_CERT` | Database uses a private or enterprise CA |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enabling Google sign-in |

`AUTH_TRUST_HOST` is not needed — `trustHost: true` is set in code. Without it
Auth.js rejects every sign-in on Azure with `UntrustedHost`, since it only
auto-trusts the host on Vercel.

## Enabling semantic retrieval

Optional. Without it, retrieval is keyword-only and the app is fully functional.

1. Deploy `text-embedding-3-small` to an Azure OpenAI resource in your tenant.
2. Store the key in key vault; add the three `AZURE_OPENAI_*` settings.
3. Set `EMBEDDING_PROVIDER=azure`.
4. Backfill existing documents: `npm run embeddings:backfill -- --dry-run` first
   to see count and cost, then without the flag.

The model is fixed at `text-embedding-3-small` / 1536 dimensions in code, not
configurable. Vectors from different models are not comparable, so a corpus
embedded by one cannot be searched by another. A mismatched deployment is
detected and disables the semantic arm rather than storing unusable vectors.

Documents tagged `confidentialityTier = "restricted"` are embedded **only** when
the endpoint is in-tenant. On an external endpoint they are skipped and remain
keyword-searchable (test case **SEC-13**).

## Not covered here

- **VNet integration and private endpoints.** Add `Microsoft.Network` resources
  and set `virtualNetworkSubnetId` on the web app. Requires Option B migrations.
- **Custom domain and managed certificate.** Set `publicOrigin` to the real
  origin when you add one, or invitation links point at `azurewebsites.net`.
- **Autoscale rules.** The plan is fixed-instance as written.
- **CI/CD pipeline.** Section 6 gives the commands; wiring them into GitHub
  Actions or Azure DevOps is a separate piece of work.
- **The `xlsx` (SheetJS) ReDoS advisory**, which has no published npm fix. It is
  reachable from artifact upload and mitigated by the size cap and extension
  allowlist. To close it properly, move to the vendor-distributed build.
