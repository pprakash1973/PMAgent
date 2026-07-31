// Creates the SystemSetting table in Neon PostgreSQL (production).
// Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping system-settings migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key"       TEXT        NOT NULL PRIMARY KEY,
        "value"     TEXT        NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedBy" TEXT
      )
    `);
    console.log("Migration applied: SystemSetting table ready");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
