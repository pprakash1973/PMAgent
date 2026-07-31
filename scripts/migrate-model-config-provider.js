// Adds the `provider` column to ModelConfig in Neon PostgreSQL.
// Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS.
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping model-config-provider migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      ALTER TABLE "ModelConfig"
        ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'anthropic'
    `);
    console.log("Migration applied: ModelConfig.provider column ready");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
