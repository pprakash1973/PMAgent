// Adds currentPhase column to Neon PostgreSQL (production)
// Run with: node scripts/migrate-neon-phase.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.error("DATABASE_URL must be a postgresql:// connection string");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currentPhase" TEXT NOT NULL DEFAULT 'initiation'`
    );
    console.log("Migration applied: currentPhase column added (or already existed)");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
