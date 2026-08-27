#!/usr/bin/env node
/**
 * Applies the phase-1 DDL against a real database twice, then rolls back.
 *
 * Running it twice is the point: migrate-neon-all.js executes on every deploy,
 * so a statement that succeeds once and fails the second time is a broken
 * release, not a working one.
 *
 * WARNING — the rollback is NOT reliable here. Both passes run inside a
 * transaction that ends in ROLLBACK, and PostgreSQL does have transactional
 * DDL, but on one real run against Neon the DML rolled back while all 9 CREATE
 * TABLEs persisted. The cause was not identified: plain CREATE TABLE,
 * CREATE TABLE IF NOT EXISTS, and DO-block constraints each roll back correctly
 * in isolation on both the pooled and direct endpoints.
 *
 * The final check below is what caught it, and it is the reason that check
 * exists — treat a FAIL there as authoritative. Until the cause is understood,
 * do NOT point this script at a database whose schema you are unwilling to
 * change. scripts/verify-retrieval-sql.mjs has no such caveat; its rollback was
 * confirmed clean on a fresh connection.
 *
 *   node scripts/verify-phase1-ddl.mjs <ddl.sql>
 */
import fs from "node:fs";
import { Pool as TcpPool } from "pg";

const DDL_PATH = process.argv[2];
if (!DDL_PATH) {
  console.error("usage: node scripts/verify-phase1-ddl.mjs <ddl.sql>");
  process.exit(2);
}

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const raw of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.DATABASE_URL;
if (!URL) { console.error("DATABASE_URL not set"); process.exit(2); }

async function openPool(connectionString) {
  try {
    const pool = new TcpPool({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 12_000, max: 1 });
    await pool.query("SELECT 1");
    return { pool, transport: "tcp" };
  } catch (err) {
    if (!/neon\.tech/.test(connectionString)) throw err;
    const { Pool: WsPool, neonConfig } = await import("@neondatabase/serverless");
    if (!neonConfig.webSocketConstructor) neonConfig.webSocketConstructor = globalThis.WebSocket;
    const pool = new WsPool({ connectionString });
    await pool.query("SELECT 1");
    return { pool, transport: "websocket" };
  }
}

// Split on the DO-block boundary too, so $$ bodies are not cut in half.
function splitStatements(sql) {
  const out = [];
  let buf = "", inDollar = false;
  for (const line of sql.split("\n")) {
    if (/DO \$\$/.test(line)) inDollar = true;
    buf += line + "\n";
    if (inDollar) {
      if (/END \$\$;/.test(line)) { out.push(buf.trim()); buf = ""; inDollar = false; }
      continue;
    }
    if (/;\s*$/.test(line)) { out.push(buf.trim()); buf = ""; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

const TABLES = [
  "assumptions", "budget_revisions", "CollectionCycle", "CollectionToken",
  "decisions", "dependencies", "scope_baselines", "TaskActualsLedger", "TaskAssignment",
];

const results = [];
const rec = (name, pass, detail) => results.push({ name, pass, detail });

const ddl = fs.readFileSync(DDL_PATH, "utf8");
const statements = splitStatements(ddl);

const { pool, transport } = await openPool(URL);
const client = await pool.connect();

console.log(`\n  Phase 1 DDL verification`);
console.log(`  Statements: ${statements.length}   Transport: ${transport}`);
console.log(`  Applied twice inside a transaction, then rolled back.\n`);

try {
  await client.query("BEGIN");

  // ── Pass 1 ────────────────────────────────────────────────────────────────
  let failed = null;
  for (const [i, s] of statements.entries()) {
    try { await client.query(s); }
    catch (e) { failed = `stmt ${i + 1}: ${e.message} :: ${s.slice(0, 90)}`; break; }
  }
  rec("first application succeeds", !failed, failed ?? `${statements.length} statements applied`);
  if (failed) throw new Error("SKIP");

  // ── Tables exist ──────────────────────────────────────────────────────────
  const found = (await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`, [TABLES]
  )).rows.map((r) => r.table_name);
  const missing = TABLES.filter((t) => !found.includes(t));
  rec("all 9 tables created", missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : found.sort().join(", "));

  // ── Artifact column ───────────────────────────────────────────────────────
  const col = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='Artifact' AND column_name='scopeBaselineId'`
  );
  rec("Artifact.scopeBaselineId added", col.rowCount === 1, col.rowCount ? "present" : "absent");

  // ── Foreign keys wired ────────────────────────────────────────────────────
  const fks = await client.query(
    `SELECT COUNT(*)::int c FROM information_schema.table_constraints
     WHERE constraint_type='FOREIGN KEY' AND table_name = ANY($1)`, [TABLES]
  );
  rec("foreign keys created", fks.rows[0].c >= 15, `${fks.rows[0].c} FK constraint(s)`);

  // ── Pass 2: the actual idempotency test ───────────────────────────────────
  let failed2 = null;
  for (const [i, s] of statements.entries()) {
    try { await client.query(s); }
    catch (e) { failed2 = `stmt ${i + 1}: ${e.message} :: ${s.slice(0, 90)}`; break; }
  }
  rec("second application is a no-op (deploy re-run safe)", !failed2,
    failed2 ?? "all statements tolerated already-applied state");

  // ── No duplicate constraints from the second pass ─────────────────────────
  const fks2 = await client.query(
    `SELECT COUNT(*)::int c FROM information_schema.table_constraints
     WHERE constraint_type='FOREIGN KEY' AND table_name = ANY($1)`, [TABLES]
  );
  rec("second pass did not duplicate constraints", fks2.rows[0].c === fks.rows[0].c,
    `${fks.rows[0].c} before, ${fks2.rows[0].c} after`);

  // ── Insert against a real ported table ────────────────────────────────────
  const proj = await client.query(`SELECT id FROM "Project" LIMIT 1`);
  if (proj.rowCount) {
    await client.query(
      `INSERT INTO decisions (id, "projectId", title, "madeAt", status, "createdAt", "updatedAt")
       VALUES ('ph1-probe', $1, 'probe', NOW(), 'open', NOW(), NOW())`, [proj.rows[0].id]
    );
    const back = await client.query(`SELECT title FROM decisions WHERE id='ph1-probe'`);
    rec("ported table accepts a real row", back.rows[0]?.title === "probe", "insert + read back OK");
  } else {
    rec("ported table accepts a real row", false, "no Project row to reference");
  }
} catch (e) {
  if (e.message !== "SKIP") rec("unexpected failure", false, e.message);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end().catch(() => {});
}

// ── Confirm clean rollback on a fresh connection ────────────────────────────
try {
  const { pool: check } = await openPool(URL);
  const left = await check.query(
    `SELECT COUNT(*)::int c FROM information_schema.tables WHERE table_name = ANY($1)`, [TABLES]
  );
  rec("rollback left no tables behind", left.rows[0].c === 0, `${left.rows[0].c} of 9 present (must be 0)`);
  await check.end().catch(() => {});
} catch (e) {
  rec("rollback left no tables behind", false, e.message);
}

let bad = 0;
for (const r of results) {
  if (!r.pass) bad++;
  console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
  if (r.detail) console.log(`         ${r.detail}`);
}
console.log(`\n  ${results.length - bad} passed, ${bad} failed\n`);
process.exit(bad ? 1 : 0);
