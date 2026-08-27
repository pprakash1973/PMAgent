/**
 * Fills the UST test-case template from this release's actually-executed tests.
 *
 * Every row marked "P" corresponds to a test run in this environment with the
 * evidence recorded in the Actual Results column. Rows marked "Not Run" are
 * outstanding and blocked on infrastructure — they are included deliberately so
 * the provisioning reviewer can see what is still open.
 *
 *   node scripts/fill-test-cases.mjs <template.xlsx> <output.xlsx>
 */
import ExcelJS from "exceljs";

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error("usage: node scripts/fill-test-cases.mjs <template.xlsx> <output.xlsx>");
  process.exit(2);
}

const P = "P";
const NR = "Not Run";

const T = [
  ["Build Verification", "BV-01", "TypeScript compiles with no type errors across the workspace",
    "Repo at commit 2344e9a; dependencies installed; Prisma client generated",
    "1. Run: npx prisma generate\n2. Run: npx tsc --noEmit\n3. Inspect exit code and diagnostics",
    "Prakash Palaniswamy", "Zero type errors; exit code 0", "Exit code 0, no diagnostics emitted",
    P, "npx tsc --noEmit", "Release gate; runs in CI before packaging"],

  ["Build Verification", "BV-02", "Production build succeeds and emits a standalone server bundle",
    "BV-01 passed; next.config.ts sets output:'standalone'",
    "1. Run: npx next build\n2. Confirm exit code\n3. Confirm route count and standalone output",
    "Prakash Palaniswamy", "Build exits 0; standalone bundle produced; all routes compiled",
    "Exit code 0; 165 routes emitted; compiled in 23.6s",
    P, "npx next build", "Standalone output is required for Azure App Service"],

  ["Build Verification", "BV-03", "Build introduces no new lint errors against the release baseline",
    "Baseline commit 3566b59 available for comparison",
    "1. Lint every file changed since baseline\n2. Compare per-file counts against the same files at baseline\n3. Lint newly added files separately",
    "Prakash Palaniswamy", "No increase on modified files; zero errors on new files",
    "Modified files identical to baseline (10 / 14 / 2 / 17). All 8 new files: 0 errors, 0 warnings",
    P, "npx eslint (changed files)",
    "Repo carries 936 pre-existing errors, predominantly no-explicit-any, none introduced by this change"],

  ["Build Verification", "BV-04", "Prisma schema validates including the unsupported vector column",
    "Schema declares embedding as Unsupported vector(1536)",
    "1. Run: npx prisma validate",
    "Prakash Palaniswamy", "Schema reported valid", "The schema at prisma/schema.prisma is valid",
    P, "npx prisma validate", ""],

  ["Database Test", "DB-01", "Application connects to the provisioned PostgreSQL instance via Prisma",
    "DATABASE_URL configured; DATABASE_DRIVER set",
    "1. Load environment configuration\n2. Import the application's own database client\n3. Execute counts against four tables",
    "Prakash Palaniswamy", "Client connects and returns row counts without error",
    "Connected in 2.8s; users=10, projects=5, documents=3, chunks=5",
    P, "src/lib/db.ts", "Exercises the real application data-access path, not an ad-hoc client"],

  ["Database Test", "DB-02", "Database server meets the minimum version for pgvector and full-text search",
    "Connectivity established (DB-01)", "1. Execute SELECT version()",
    "Prakash Palaniswamy", "PostgreSQL 14 or later", "PostgreSQL 18.6",
    P, "SELECT version()", ""],

  ["Database Test", "DB-03", "Idempotent migration script completes every step against the target database",
    "DATABASE_URL points at the target instance",
    "1. Run the consolidated migration script\n2. Confirm each step logs success\n3. Confirm the final completion line",
    "Prakash Palaniswamy", "All steps succeed and completion is reported",
    "Every step logged OK, ending with All migrations complete",
    P, "node scripts/migrate-neon-all.js",
    "Every statement uses IF NOT EXISTS, so re-running on each deploy is safe"],

  ["Database Test", "DB-04", "pgvector extension provisions successfully on the target instance",
    "DB-03 executed",
    "1. Run the migration\n2. Query pg_extension for the vector extension",
    "Prakash Palaniswamy", "Extension present and reporting a version", "pgvector 0.8.6 installed",
    P, "SELECT extversion FROM pg_extension",
    "On Azure Database for PostgreSQL the vector extension must first be allowlisted in the azure.extensions server parameter, which requires a server restart"],

  ["Database Test", "DB-05", "Vector column and supporting index are created at the correct dimensionality",
    "DB-04 passed",
    "1. Query information_schema for the chunk table columns\n2. Query pg_indexes for the backfill index",
    "Prakash Palaniswamy", "Vector column at 1536 dimensions, model column, and partial index all present",
    "embedding (vector), embeddingModel (text) and DocumentChunk_embedding_pending_idx all present",
    P, "information_schema.columns", "Dimensionality must match the application constant; asserted by RT-04"],

  ["Database Test", "DB-06", "A database without pgvector does not fail the release",
    "Migration script under review",
    "1. Confirm the extension is created through the non-fatal helper\n2. Confirm a failure is logged and the deploy continues",
    "Prakash Palaniswamy", "Extension failure is non-fatal and the deploy proceeds keyword-only",
    "Guarded by the optional helper; asserted by an automated check that was negative-tested by making it mandatory again",
    P, "npm run test:grounding",
    "Important for Azure, where the extension may not be allowlisted at first deploy"],

  ["Database Test", "DB-07", "Full-text search index exists on the document chunk table",
    "Migration applied", "1. Query pg_indexes for the chunk table",
    "Prakash Palaniswamy", "GIN index present on the text search expression",
    "Index present; expression matches the application query on both sides",
    P, "SELECT indexname FROM pg_indexes",
    "Expression drift would silently downgrade the query to a sequential scan with no error"],

  ["Database Test", "DB-08", "Database is reachable from a network that blocks outbound TCP 5432",
    "Corporate egress restrictions in force",
    "1. Attempt the standard driver over TCP 5432\n2. Observe the failure mode\n3. Retry over the WebSocket transport on 443",
    "Prakash Palaniswamy", "A working transport is available",
    "TCP 5432 fails with ECONNRESET at ~20s on both pooler and direct endpoints. WebSocket over 443 connects in 1.0s",
    P, "DATABASE_DRIVER=neon",
    "INFRA ACTION: if Azure egress restricts 5432, set DATABASE_DRIVER=neon. The failure presents as a timeout rather than a refusal and is easily misdiagnosed as the database being down"],

  ["Security Test", "SEC-01", "Every project-scoped API handler enforces the tenant boundary",
    "Automated security suite available",
    "1. Run the security regression suite\n2. Review the tenant-boundary assertions",
    "Prakash Palaniswamy", "Every handler with an authentication guard also performs a tenant check",
    "All handlers scoped; zero unscoped",
    P, "npm run test:security", "Guards the cross-tenant IDOR class"],

  ["Security Test", "SEC-02", "Cross-tenant object access returns Not Found rather than Forbidden",
    "Tenant access helper implemented",
    "1. Inspect the project lookup filter\n2. Confirm the status code returned on a miss",
    "Prakash Palaniswamy", "Lookup filtered by organisation; 404 returned on a miss",
    "Organisation filter enforced; 404 on miss",
    P, "src/lib/project-access.ts", "404 rather than 403 prevents object-identifier enumeration"],

  ["Security Test", "SEC-03", "Registration cannot join an existing tenant",
    "Registration endpoint present",
    "1. Confirm the validation schema rejects a client-supplied organisation\n2. Confirm the handler never reads it from the request body",
    "Prakash Palaniswamy", "Organisation is assigned server-side only", "Organisation assigned server-side only",
    P, "npm run test:security", ""],

  ["Security Test", "SEC-04", "No unauthenticated destructive administrative endpoint exists",
    "Codebase at the release commit",
    "1. Confirm the bulk-delete route is absent\n2. Scan the source for hardcoded secret comparisons",
    "Prakash Palaniswamy", "Route removed and no hardcoded secret comparisons remain",
    "Route removed; no hardcoded comparisons found",
    P, "npm run test:security",
    "Previously a hardcoded token gated a cascading delete across all organisations"],

  ["Security Test", "SEC-05", "Application refuses to start without a strong authentication secret",
    "Authentication module under review",
    "1. Confirm a startup assertion exists\n2. Confirm a minimum length of 32 characters is enforced",
    "Prakash Palaniswamy", "Startup throws when the secret is missing or weak", "Fails closed at startup",
    P, "npm run test:security", "Build phase is exempt so the production build still succeeds"],

  ["Security Test", "SEC-06", "Database connections verify the server TLS certificate",
    "Database module under review",
    "1. Confirm certificate verification is not disabled\n2. Confirm it is explicitly enabled",
    "Prakash Palaniswamy", "Certificate verification enabled",
    "Verified; a private certificate authority is supported through configuration",
    P, "npm run test:security",
    "Applies to the TCP transport. On the WebSocket transport TLS terminates against the provider's public certificate"],

  ["Security Test", "SEC-07", "Connection pool is bounded per worker process",
    "Database module under review", "1. Confirm a maximum is configured on the pool",
    "Prakash Palaniswamy", "Pool has an explicit maximum", "Bounded by configuration, default 5",
    P, "npm run test:security",
    "App Service runs several workers per instance while the connection ceiling is per-server"],

  ["Security Test", "SEC-08", "Scheduled-job endpoints authenticate and fail closed",
    "Scheduled routes present",
    "1. Confirm the shared secret is checked\n2. Confirm behaviour when the secret is unset\n3. Confirm a constant-time comparison is used",
    "Prakash Palaniswamy", "Secret required; an unset secret refuses all callers; comparison is timing-safe",
    "All scheduled routes gated and failing closed",
    P, "npm run test:security", ""],

  ["Security Test", "SEC-09", "Baseline HTTP security headers are configured",
    "Application configuration under review",
    "1. Confirm content security policy, frame options, content-type options, referrer policy and strict transport security\n2. Confirm framing is denied",
    "Prakash Palaniswamy", "All five headers present and framing denied", "Five headers set",
    P, "npm run test:security", ""],

  ["Security Test", "SEC-10", "Unauthenticated endpoints are rate limited",
    "Registration endpoint present", "1. Confirm rate limiting is applied",
    "Prakash Palaniswamy", "Rate limiting applied", "Limited",
    P, "npm run test:security", ""],

  ["Security Test", "SEC-11", "File upload bounds size and file type",
    "Upload route present", "1. Confirm a maximum byte size\n2. Confirm an extension allowlist",
    "Prakash Palaniswamy", "Both controls present", "Size capped and extensions allowlisted",
    P, "npm run test:security",
    "Also mitigates the unpatched SheetJS regular-expression denial-of-service advisory"],

  ["Security Test", "SEC-12", "AI recommendation input is server-derived rather than client-supplied",
    "Recommendation endpoint present",
    "1. Confirm no prompt fields are read from the request body\n2. Confirm project state is read from the database\n3. Confirm the tenant check and rate limit",
    "Prakash Palaniswamy", "Prompt built only from server-side state, scoped and throttled",
    "Server-derived, scoped and throttled",
    P, "npm run test:security", "Prompt-injection and cost-abuse control"],

  ["Security Test", "SEC-13", "Confidential documents are not sent to an out-of-tenant inference endpoint",
    "Confidentiality gate implemented",
    "1. Confirm the gate special-cases the restricted tier\n2. Confirm it requires an in-tenant endpoint\n3. Confirm the storage path and upload call site both honour it",
    "Prakash Palaniswamy", "Restricted documents are embedded only when inference is in-tenant",
    "Gated at policy, storage path and call site",
    P, "npm run test:grounding",
    "Skipped documents remain fully keyword-searchable; only the semantic arm degrades for them"],

  ["Security Test", "SEC-14", "Retrieval cannot return another project's content",
    "Live database with fixture data",
    "1. Execute the similarity search with a foreign project identifier\n2. Confirm every chunk query filters on project",
    "Prakash Palaniswamy", "Zero rows returned for a foreign project and all queries scoped",
    "Zero rows for a foreign project; both raw queries and all ORM paths are project-scoped",
    P, "npm run verify:sql", "Verified against a live database, not by static inspection alone"],

  ["Security Test", "SEC-15", "No route exceeds the Azure 230-second request ceiling",
    "All API routes under review",
    "1. Scan every route duration declaration\n2. Compare against the platform limit",
    "Prakash Palaniswamy", "No route above 230 seconds", "All within the cap; longest is 220 seconds",
    P, "npm run test:security",
    "App Service enforces a hard 230-second load-balancer timeout that cannot be raised"],

  ["Unit Test", "UT-01", "Retrieval selects the correct arm for each availability combination",
    "Behavioural suite with a stubbed data layer",
    "1. Run the retrieval suite\n2. Review the arm-selection assertions",
    "Prakash Palaniswamy", "Hybrid when both arms return, single-arm when one does, fallback when neither",
    "16 of 16 assertions passed",
    P, "npm run test:retrieval", ""],

  ["Unit Test", "UT-02", "Rank fusion ranks a chunk found by both arms above either arm's top hit",
    "Two arms returning overlapping results",
    "1. Seed the keyword arm with A, B, C and the semantic arm with C, D, E\n2. Fuse and inspect ordering and provenance",
    "Prakash Palaniswamy", "C ranks first and is marked as found by both arms",
    "C ranked first with both-arm provenance; union correctly deduplicated to five",
    P, "npm run test:retrieval", "Reciprocal Rank Fusion with k=60"],

  ["Unit Test", "UT-03", "A failure in one retrieval arm cannot disable the other",
    "Fault injection available in the suite",
    "1. Force the semantic arm to fail and confirm keyword results survive\n2. Force the keyword arm to fail and confirm semantic results survive\n3. Force both and confirm the document-order fallback",
    "Prakash Palaniswamy", "Retrieval always returns evidence and never throws",
    "All three cases pass; both-fail degrades to document order",
    P, "npm run test:retrieval", "A retrieval failure must never fail an artifact generation"],

  ["Unit Test", "UT-04", "Absent vector support incurs no embedding cost",
    "Vector support reported unavailable",
    "1. Run retrieval with vector support disabled\n2. Count vector queries and embedding calls",
    "Prakash Palaniswamy", "Zero vector queries and zero embedding calls", "Zero of each",
    P, "npm run test:retrieval", "Prevents spend and latency on clusters without the extension"],

  ["Unit Test", "UT-05", "Query embeddings are computed once per intent rather than per generation",
    "In-process cache implemented",
    "1. Generate the same artifact type three times\n2. Count embedding calls",
    "Prakash Palaniswamy", "Exactly one embedding call", "One call across three generations",
    P, "npm run test:retrieval",
    "Query-side embedding cost is effectively zero; only document ingestion incurs spend"],

  ["Integration Test", "IT-01", "Full-text search executes correctly against a live database",
    "Live PostgreSQL with fixture data created and rolled back",
    "1. Run the SQL verification harness\n2. Review the keyword-arm assertions",
    "Prakash Palaniswamy", "Query executes and ranks the matching chunk first",
    "One hit returned with the correct chunk ranked first",
    P, "npm run verify:sql", ""],

  ["Integration Test", "IT-02", "Keyword retrieval returns candidates for every artifact type",
    "Live database containing real document chunks",
    "1. Build the search query for all 25 artifact types\n2. Execute each against the corpus\n3. Compare against the previous implementation",
    "Prakash Palaniswamy", "Every artifact type executes without error and returns candidates",
    "25 of 25 execute with zero errors; 24 types improved from zero hits, one unchanged",
    P, "All 25 artifact search term lists",
    "DEFECT FOUND AND FIXED: the previous query joined all search terms with AND, so 24 of 25 artifact types retrieved nothing and silently fell back to document order"],

  ["Integration Test", "IT-03", "Vector similarity search executes and orders by distance",
    "Extension installed and fixture vectors written",
    "1. Write vectors through the batched update path\n2. Execute the similarity query\n3. Verify ordering",
    "Prakash Palaniswamy", "Vectors persist and results are ordered nearest first",
    "Four of four rows written; nearest-first ordering correct",
    P, "npm run verify:sql",
    "Exercises the explicit type casts, which PostgreSQL will not infer and which fail at plan time if omitted"],

  ["Integration Test", "IT-04", "Chunks without a vector are excluded from similarity search",
    "Corpus containing both embedded and unembedded chunks",
    "1. Insert an unembedded chunk\n2. Execute the similarity query\n3. Confirm the unembedded chunk is absent",
    "Prakash Palaniswamy", "Only embedded chunks are returned",
    "Four embedded rows returned; the unembedded chunk is absent",
    P, "npm run verify:sql",
    "Without the filter, null sorts as maximally distant and displaces genuine matches"],

  ["Integration Test", "IT-05", "Backfill progress query reports the correct outstanding count",
    "Corpus with a mix of embedded and unembedded chunks",
    "1. Execute the pending-count query\n2. Compare against known state",
    "Prakash Palaniswamy", "Count matches the number of unembedded chunks", "One pending, as expected",
    P, "npm run verify:sql", ""],

  ["Integration Test", "IT-06", "Verification activity leaves no residue in the database",
    "Harness wraps all work in a transaction",
    "1. Run the harness\n2. Reconnect on a fresh connection\n3. Query for fixture projects, chunks and indexes",
    "Prakash Palaniswamy", "Zero fixture rows and zero fixture indexes remain",
    "Projects, chunks and indexes all zero",
    P, "npm run verify:sql",
    "Uses transactional DDL, so the harness is safe to point at any environment including production"],

  ["Regression Test", "RT-01", "Every artifact generation path retrieves from the document store",
    "Three generation entry points exist",
    "1. Run the grounding suite\n2. Confirm no path passes an undefined evidence context",
    "Prakash Palaniswamy", "All three paths supply retrieved evidence", "All three paths retrieve evidence",
    P, "npm run test:grounding",
    "DEFECT FIXED: the single-artifact path previously read only a summary of the most recently uploaded document"],

  ["Regression Test", "RT-02", "Every artifact generation path supplies industry domain context",
    "Three generation entry points exist",
    "1. Run the grounding suite\n2. Confirm no path passes an undefined domain context",
    "Prakash Palaniswamy", "All three paths supply domain context", "All three paths pass domain context",
    P, "npm run test:grounding", ""],

  ["Regression Test", "RT-03", "Keyword search cannot regress to AND semantics",
    "Grounding suite includes the guard",
    "1. Confirm the AND-joining query builders are rejected\n2. Reintroduce the defect and confirm the check fails",
    "Prakash Palaniswamy", "Check passes on current code and fails when the defect is reintroduced",
    "Passes; negative-tested by reverting to the previous query builder",
    P, "npm run test:grounding", "Guards the highest-impact defect found in this cycle"],

  ["Regression Test", "RT-04", "Vector dimensionality agrees across code, schema and migration",
    "All three sources available",
    "1. Run the grounding suite\n2. Alter one source and confirm the check fails",
    "Prakash Palaniswamy", "All three report the same dimensionality and a mismatch is detected",
    "1536 in all three; negative-tested by changing one to 1024",
    P, "npm run test:grounding", "A mismatch would render every stored vector unsearchable"],

  ["Regression Test", "RT-05", "Embedding failure cannot block artifact generation",
    "Embedding layers under review",
    "1. Confirm request failures convert to an empty result\n2. Confirm the storage layer always returns a result rather than throwing",
    "Prakash Palaniswamy", "Both layers degrade rather than throwing", "Both layers degrade rather than throwing",
    P, "npm run test:grounding", ""],

  ["Regression Test", "RT-06", "Document exports carry the approved corporate typeface",
    "Export modules under review",
    "1. Generate a real Word, Excel and PowerPoint file\n2. Inspect the embedded document XML for font names",
    "Prakash Palaniswamy", "Aptos Display for headings and Aptos for body in all three formats",
    "Three of three formats verified; bold preserved in the spreadsheet pass",
    P, "Generated Office files",
    "Fallbacks are Calibri Light and Calibri for installations predating Microsoft 365"],

  ["System Test", "ST-01", "Embedding provider returns vectors of the expected dimensionality",
    "An embedding endpoint must be provisioned and configured",
    "1. Configure the endpoint\n2. Upload a document\n3. Confirm chunk vectors are written and the model is recorded",
    "", "Vectors written at 1536 dimensions with the model recorded",
    "Not executed. No embedding endpoint is configured in this environment",
    NR, "Azure OpenAI or OpenAI credentials",
    "OUTSTANDING - blocked on infra provisioning the endpoint. Until then retrieval runs keyword-only by design and the application is fully functional"],

  ["System Test", "ST-02", "Existing document chunks are backfilled with vectors",
    "ST-01 passed and the extension installed",
    "1. Run the backfill in dry-run mode\n2. Review count and estimated cost\n3. Re-run without the flag\n4. Confirm the pending count reaches zero",
    "", "All eligible chunks embedded and the pending count reaches zero",
    "Not executed. Depends on ST-01. Five chunks currently pending",
    NR, "npm run embeddings:backfill",
    "OUTSTANDING - idempotent and resumable, safe to run against a live database"],

  ["System Test", "ST-03", "Application deploys and serves traffic on Azure App Service",
    "App Service and database provisioned; application settings configured",
    "1. Deploy the standalone bundle\n2. Confirm the service starts\n3. Sign in\n4. Generate one artifact end to end",
    "", "Service healthy, authentication succeeds and an artifact is generated",
    "Not executed. No Azure resources provisioned and the Azure CLI is not installed on this host",
    NR, "See docs/azure-deployment.md",
    "OUTSTANDING - this is the gate that infra provisioning must clear. Required application settings are listed in the deployment document"],

  ["System Test", "ST-04", "End-to-end artifact generation produces evidence-grounded output",
    "ST-03 passed and a project with uploaded source documents exists",
    "1. Upload a statement of work\n2. Generate a work breakdown structure\n3. Confirm cited content traces to the document\n4. Review the gap count",
    "", "Output reflects document content and gaps are flagged rather than invented",
    "Not executed. Requires a deployed environment",
    NR, "Sample statement of work",
    "OUTSTANDING - expect gap counts to rise against previous behaviour, because the model now declares what the documents do not say instead of filling from a summary"],

  ["System Test", "ST-05", "Hybrid retrieval measurably outperforms keyword-only retrieval",
    "A labelled golden set of documents and expected chunks",
    "1. Label the expected chunks per artifact type\n2. Measure recall at 12 for keyword-only, semantic-only and hybrid\n3. Compare",
    "", "Hybrid recall exceeds keyword-only recall",
    "Not executed. The labelled golden set has not yet been produced",
    NR, "Labelled document corpus",
    "OUTSTANDING - retrieval quality is currently unmeasured. The fusion constant and candidate pool size are conventions, not values tuned against this corpus"],
];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
const ws = wb.getWorksheet("Test Case");
const set = (addr, v) => { ws.getCell(addr).value = v; };

set("C6", 27); set("D6", "Aug"); set("E6", 2026);
set("C7", 27); set("D7", "Aug"); set("E7", 2026);
set("C8", 27); set("D8", "Aug"); set("E8", 2026);
set("C9", "Prakash Palaniswamy");
set("C10", "Pre-deployment verification. Node 24.18, Next.js 16.3.3, Prisma 7.10; PostgreSQL 18.6 with pgvector 0.8.6. Target environment: Azure App Service under hybrid tenancy.");
set("C11", "PM Agent - PMO artifact generation platform");
set("C12", "Anthropic Claude API (generation); Azure OpenAI or OpenAI (embeddings, pending provisioning); PostgreSQL with pgvector (retrieval); Auth.js (identity)");
set("C13", "Evidence-grounded artifact generation using hybrid keyword and semantic retrieval over uploaded project documents, deployable under Azure hybrid tenancy.");
set("B15", T.length);

const START = 18;
const proto = {};
ws.getRow(START).eachCell({ includeEmpty: true }, (c) => {
  if (c.col <= 11) proto[c.col] = { border: c.border };
});

T.forEach((rec, i) => {
  const row = ws.getRow(START + i);
  rec.forEach((val, j) => {
    const cell = row.getCell(j + 1);
    cell.value = val;
    cell.font = { name: "Arial", size: 9 };
    if (proto[j + 1] && proto[j + 1].border) cell.border = proto[j + 1].border;
    cell.alignment = { vertical: "top", wrapText: true, horizontal: j === 8 ? "center" : "left" };
  });
  const passed = rec[8] === P;
  const res = row.getCell(9);
  res.font = { name: "Arial", size: 9, bold: true, color: { argb: passed ? "FF006100" : "FF9C5700" } };
  res.fill = { type: "pattern", pattern: "solid", fgColor: { argb: passed ? "FFC6EFCE" : "FFFFEB9C" } };
  row.height = 62;
});

await wb.xlsx.writeFile(OUT);

const pass = T.filter((r) => r[8] === P).length;
console.log(`Wrote ${OUT}`);
console.log(`  ${T.length} test cases: ${pass} Pass, ${T.length - pass} Not Run`);
console.log(`  data rows ${START}-${START + T.length - 1}; template footer begins at row 90`);
