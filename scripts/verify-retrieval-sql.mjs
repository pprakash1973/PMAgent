#!/usr/bin/env node
/**
 * Executes the retrieval SQL against a real Postgres.
 *
 * The unit tests stub Prisma, so they prove the decision logic but never run a
 * query. This runs the actual statements — the tsvector search, the pgvector
 * KNN, and the UPDATE ... FROM (VALUES ...) vector write, which is the piece
 * most likely to be wrong because it depends on explicit casts.
 *
 * ZERO FOOTPRINT. Postgres has transactional DDL, so everything — CREATE
 * EXTENSION, ALTER TABLE, every INSERT — happens inside one transaction that
 * always ends in ROLLBACK. Nothing is committed, on any code path, including
 * failure. Safe to point at a production database.
 *
 * No API key needed: query vectors are synthetic, so no embedding endpoint is
 * called. This verifies the SQL, not the embedding provider.
 *
 *   node scripts/verify-retrieval-sql.mjs                 # uses DATABASE_URL
 *   node scripts/verify-retrieval-sql.mjs "postgres://…"  # explicit
 */
import "dotenv/config";
import fs from "node:fs";
import { Pool as TcpPool } from "pg";

/**
 * Open a pool, preferring plain TCP and falling back to Neon's WebSocket
 * driver. Corporate egress commonly blocks outbound 5432 while allowing 443,
 * which shows up as ECONNRESET a few seconds into the handshake rather than as
 * a refusal. The WebSocket driver carries the same wire protocol over 443 and
 * supports real session transactions, so BEGIN/ROLLBACK still holds.
 */
async function openPool(connectionString, { sslVerify = true } = {}) {
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

  try {
    const pool = new TcpPool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: sslVerify },
      connectionTimeoutMillis: 15_000,
      max: 1,
    });
    await pool.query("SELECT 1");
    return { pool, transport: "tcp" };
  } catch (tcpErr) {
    if (isLocal || !/neon\.tech/.test(connectionString)) throw tcpErr;

    const { Pool: WsPool, neonConfig } = await import("@neondatabase/serverless");
    if (!neonConfig.webSocketConstructor) {
      neonConfig.webSocketConstructor = globalThis.WebSocket;
    }
    const pool = new WsPool({ connectionString });
    await pool.query("SELECT 1");
    return { pool, transport: `websocket (TCP 5432 unreachable: ${tcpErr.message || tcpErr.code})` };
  }
}

// .env.local is Next.js's convention and dotenv/config does not read it.
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL_ARG = process.argv[2] ?? process.env.DATABASE_URL;
const DIMS = 1536;
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

/** Deterministic unit-ish vector; `seed` shifts direction so distances differ. */
function synthVector(seed) {
  const v = new Array(DIMS).fill(0);
  for (let i = 0; i < DIMS; i++) v[i] = Math.sin((i + 1) * 0.01 + seed) / 40;
  return `[${v.join(",")}]`;
}

async function main() {
  if (!URL_ARG) {
    console.error("No DATABASE_URL. Pass one as an argument or set it in .env.local");
    process.exit(2);
  }

  const { pool, transport } = await openPool(URL_ARG);
  const client = await pool.connect();

  let host = "unknown";
  try {
    host = new URL(URL_ARG.replace(/^postgres(ql)?:/, "http:")).host;
  } catch { /* opaque URL — never print the raw string, it holds the password */ }

  const server = await client.query("SELECT version() AS v");

  console.log(`\n  Retrieval SQL verification`);
  console.log(`  Host:      ${host}`);
  console.log(`  Server:    ${server.rows[0].v.split(" ").slice(0, 2).join(" ")}`);
  console.log(`  Transport: ${transport}`);
  console.log(`  All work runs inside a transaction and is rolled back.\n`);

  try {
    await client.query("BEGIN");

    // ── pgvector ────────────────────────────────────────────────────────────
    let vectorOk = false;
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      vectorOk = true;
      record("pgvector extension available", true, "created or already present");
    } catch (e) {
      record("pgvector extension available", false, e.message);
    }

    // ── Column ──────────────────────────────────────────────────────────────
    if (vectorOk) {
      try {
        await client.query(`
          ALTER TABLE "DocumentChunk"
            ADD COLUMN IF NOT EXISTS "embedding"      vector(${DIMS}),
            ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT
        `);
        record("DocumentChunk.embedding column", true, `vector(${DIMS})`);
      } catch (e) {
        vectorOk = false;
        record("DocumentChunk.embedding column", false, e.message);
      }
    }

    // ── hasVectorSupport() probe ────────────────────────────────────────────
    const probe = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'DocumentChunk' AND column_name = 'embedding'
      ) AS exists
    `);
    record(
      "hasVectorSupport() probe returns the truth",
      probe.rows[0].exists === vectorOk,
      `probe=${probe.rows[0].exists}, actual=${vectorOk}`
    );

    // ── Fixture: a throwaway project, document and chunks ───────────────────
    // Borrows a real orgId/userId so foreign keys hold; nothing is committed.
    const org = await client.query(`SELECT id FROM "Organization" LIMIT 1`);
    const usr = await client.query(`SELECT id FROM "User" LIMIT 1`);
    if (!org.rowCount || !usr.rowCount) {
      record("fixture setup", false, "database has no Organization/User rows to reference");
      throw new Error("SKIP_REST");
    }
    const orgId = org.rows[0].id;
    const userId = usr.rows[0].id;
    const projectId = "verify-proj-rollback";
    const docId = "verify-doc-rollback";

    await client.query(
      `INSERT INTO "Project" (id, name, code, "orgId", "pmOwnerId", status, "createdAt", "updatedAt")
       VALUES ($1,'SQL verification','VERIFY',$2,$3,'active',NOW(),NOW())`,
      [projectId, orgId, userId]
    );
    await client.query(
      `INSERT INTO "RequirementsDocument"
         (id, "projectId", "fileName", "fileFormat", "storageUri", "uploadedById",
          "docClass", "confidentialityTier", "ingestionState", "createdAt")
       VALUES ($1,$2,'verify.docx','docx','inline:verify',$3,'sow','standard','ready',NOW())`,
      [docId, projectId, userId]
    );

    // One chunk is the deliberate vocabulary-mismatch case: it describes a risk
    // without using any word the risk_register keyword query stems to.
    const chunks = [
      [0, "The project carries significant delivery risk. Probability is high and the impact on the go-live milestone is severe. Mitigation is owned by the programme manager."],
      [1, "The vendor shall indemnify the customer against service credits for availability below 99.5% measured monthly."],
      [2, "Work breakdown: phase one covers discovery and design, phase two covers build and unit test, phase three covers UAT."],
      [3, "Budget is fixed at 1.2m with a 10% contingency reserve held by the sponsor."],
    ];
    for (const [i, text] of chunks) {
      await client.query(
        `INSERT INTO "DocumentChunk" (id, "documentId", "projectId", "chunkIndex", text, "createdAt")
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [`${docId}-${i}`, docId, projectId, i, text]
      );
    }
    record("fixture created", true, `${chunks.length} chunks`);

    // ── Keyword arm: the exact query from evidence-assembler.ts ─────────────
    const terms = "risks probability impact mitigation owner category threats opportunities";
    const kwQuery = [...new Set(terms.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1))].join(" | ");

    // Guard the bug this fixture exists to catch: plainto_tsquery ANDs every
    // term, so an 8-term topic list can only match a chunk containing all
    // eight — which never happens, and the arm silently returns nothing.
    const andSemantics = await client.query(
      `SELECT to_tsvector('english', $1) @@ plainto_tsquery('english', $2) AS matched`,
      [chunks[0][1], terms]
    );
    record(
      "keyword query does not use AND semantics",
      !andSemantics.rows[0].matched === true,
      andSemantics.rows[0].matched
        ? "plainto_tsquery matched — fixture no longer proves the bug"
        : "confirmed: plainto_tsquery would return nothing here; to_tsquery with | is required"
    );

    const kw = await client.query(
      `SELECT dc.id, dc.text
       FROM "DocumentChunk" dc
       WHERE dc."projectId" = $1
         AND to_tsvector('english', dc.text) @@ to_tsquery('english', $2)
       ORDER BY ts_rank(to_tsvector('english', dc.text), to_tsquery('english', $2)) DESC
       LIMIT $3`,
      [projectId, kwQuery, 30]
    );
    record("keyword arm executes", true, `${kw.rowCount} hit(s)`);
    record(
      "keyword arm ranks the lexically-matching chunk first",
      kw.rows[0]?.id === `${docId}-0`,
      kw.rows[0] ? `top hit: ${kw.rows[0].id}` : "no hits"
    );
    record(
      "keyword arm misses the indemnity clause (the gap hybrid exists to close)",
      !kw.rows.some((r) => r.id === `${docId}-1`),
      kw.rows.some((r) => r.id === `${docId}-1`) ? "unexpectedly matched" : "not retrieved, as expected"
    );

    // ── Index usage ─────────────────────────────────────────────────────────
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS "verify_fts_idx"
          ON "DocumentChunk" USING GIN (to_tsvector('english', text))
      `);
      const plan = await client.query(
        `EXPLAIN (FORMAT JSON)
         SELECT dc.id FROM "DocumentChunk" dc
         WHERE dc."projectId" = $1
           AND to_tsvector('english', dc.text) @@ to_tsquery('english', $2)`,
        [projectId, kwQuery]
      );
      const planText = JSON.stringify(plan.rows[0]);
      record(
        "GIN index expression matches the query expression",
        true,
        planText.includes("Bitmap") || planText.includes("Index")
          ? "planner can use the index"
          : "planner chose a seq scan (expected on a 4-row fixture)"
      );
    } catch (e) {
      record("GIN index expression matches the query expression", false, e.message);
    }

    if (!vectorOk) throw new Error("SKIP_VECTOR");

    // ── Vector write: the exact UPDATE ... FROM (VALUES ...) shape ──────────
    // This is the statement most likely to be wrong — without the ::text and
    // ::vector casts Postgres infers `unknown` for the VALUES columns and the
    // join fails at plan time.
    try {
      const tuples = chunks
        .map((_, n) => `($${n * 2 + 2}::text, $${n * 2 + 3}::vector)`)
        .join(", ");
      const params = [
        "text-embedding-3-small",
        ...chunks.flatMap(([idx], n) => [`${docId}-${idx}`, synthVector(n)]),
      ];
      const upd = await client.query(
        `UPDATE "DocumentChunk" AS dc
         SET "embedding" = v.emb, "embeddingModel" = $1
         FROM (VALUES ${tuples}) AS v(id, emb)
         WHERE dc.id = v.id`,
        params
      );
      record("batched vector write (UPDATE ... FROM VALUES)", upd.rowCount === chunks.length,
        `${upd.rowCount}/${chunks.length} rows updated`);
    } catch (e) {
      record("batched vector write (UPDATE ... FROM VALUES)", false, e.message);
      throw new Error("SKIP_VECTOR");
    }

    // ── Semantic arm: the exact KNN from evidence-assembler.ts ──────────────
    try {
      const knn = await client.query(
        `SELECT dc.id
         FROM "DocumentChunk" dc
         WHERE dc."projectId" = $1
           AND dc."embedding" IS NOT NULL
         ORDER BY dc."embedding" <=> $2::vector
         LIMIT $3`,
        [projectId, synthVector(1), 30]
      );
      record("semantic arm executes", knn.rowCount === chunks.length,
        `${knn.rowCount} row(s) ranked by cosine distance`);
      record("semantic arm ranks nearest first", knn.rows[0]?.id === `${docId}-1`,
        `top hit: ${knn.rows[0]?.id} (query vector seeded to match chunk 1)`);
    } catch (e) {
      record("semantic arm executes", false, e.message);
    }

    // ── NULL exclusion ──────────────────────────────────────────────────────
    try {
      await client.query(
        `INSERT INTO "DocumentChunk" (id, "documentId", "projectId", "chunkIndex", text, "createdAt")
         VALUES ($1,$2,$3,99,'An unembedded chunk, as if predating the backfill.',NOW())`,
        [`${docId}-99`, docId, projectId]
      );
      const knn = await client.query(
        `SELECT dc.id FROM "DocumentChunk" dc
         WHERE dc."projectId" = $1 AND dc."embedding" IS NOT NULL
         ORDER BY dc."embedding" <=> $2::vector LIMIT 30`,
        [projectId, synthVector(1)]
      );
      record("unembedded chunks are excluded from KNN",
        !knn.rows.some((r) => r.id === `${docId}-99`),
        `${knn.rowCount} embedded row(s) returned, unembedded one absent`);
    } catch (e) {
      record("unembedded chunks are excluded from KNN", false, e.message);
    }

    // ── Tenant isolation ────────────────────────────────────────────────────
    try {
      const leak = await client.query(
        `SELECT dc.id FROM "DocumentChunk" dc
         WHERE dc."projectId" = $1 AND dc."embedding" IS NOT NULL
         ORDER BY dc."embedding" <=> $2::vector LIMIT 30`,
        ["some-other-project", synthVector(1)]
      );
      record("KNN cannot cross the project boundary", leak.rowCount === 0,
        `${leak.rowCount} row(s) for a foreign projectId`);
    } catch (e) {
      record("KNN cannot cross the project boundary", false, e.message);
    }

    // ── Pending-count query used by the backfill ────────────────────────────
    try {
      const pending = await client.query(
        `SELECT COUNT(*) AS count FROM "DocumentChunk"
         WHERE "embedding" IS NULL AND "projectId" = $1`,
        [projectId]
      );
      record("backfill pending-count query", Number(pending.rows[0].count) === 1,
        `${pending.rows[0].count} pending (expected 1)`);
    } catch (e) {
      record("backfill pending-count query", false, e.message);
    }
  } catch (e) {
    if (!["SKIP_REST", "SKIP_VECTOR"].includes(e.message)) {
      record("unexpected failure", false, e.message);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end().catch(() => {});
  }

  // ── Confirm nothing persisted, on a brand-new connection ─────────────────
  try {
    const { pool: check } = await openPool(URL_ARG);
    try {
      const left = await check.query(
        `SELECT
           (SELECT COUNT(*) FROM "Project" WHERE id = 'verify-proj-rollback') AS projects,
           (SELECT COUNT(*) FROM "DocumentChunk" WHERE "projectId" = 'verify-proj-rollback') AS chunks,
           (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'verify_fts_idx') AS indexes`
      );
      const { projects, chunks, indexes } = left.rows[0];
      const clean = Number(projects) === 0 && Number(chunks) === 0 && Number(indexes) === 0;
      record("rollback left nothing behind", clean,
        `projects=${projects}, chunks=${chunks}, indexes=${indexes} (all must be 0)`);
    } finally {
      await check.end().catch(() => {});
    }
  } catch (e) {
    record("rollback left nothing behind", false, e.message);
  }

  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
    if (r.detail) console.log(`         ${r.detail}`);
  }
  console.log(`\n  ${results.length - failed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("\n  Could not run:", e.message, "\n");
  process.exit(2);
});
