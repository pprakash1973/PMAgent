// Phase C2: AssistantAction table (Action Ledger)
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping phase-c2 migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "AssistantAction" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL REFERENCES "AssistantConversation"("id") ON DELETE CASCADE,
        "actionType"     TEXT NOT NULL,
        "tier"           TEXT NOT NULL,
        "payload"        JSONB NOT NULL DEFAULT '{}',
        "status"         TEXT NOT NULL DEFAULT 'proposed',
        "confirmedAt"    TIMESTAMP(3),
        "undoneAt"       TIMESTAMP(3),
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AssistantAction_conversationId_idx" ON "AssistantAction"("conversationId");
    `);
    console.log("✓ Phase C2 migration complete (AssistantAction table)");
  } catch (err) {
    console.error("Phase C2 migration error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
