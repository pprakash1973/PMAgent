// Grounding PRD Phase 2: Requirement and Gap tables
// Run with: node scripts/migrate-grounding-phase2.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping grounding phase 2 migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      -- Structured requirements extracted from source documents
      CREATE TABLE IF NOT EXISTS "Requirement" (
        "id"                TEXT NOT NULL PRIMARY KEY,
        "projectId"         TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "requirementKey"    TEXT NOT NULL,   -- REQ-001, REQ-002, …
        "statement"         TEXT NOT NULL,
        "type"              TEXT NOT NULL DEFAULT 'functional',
        "category"          TEXT,
        "source"            TEXT NOT NULL DEFAULT 'extracted',
        "status"            TEXT NOT NULL DEFAULT 'proposed',
        "confidence"        FLOAT,
        "sourceChunkId"     TEXT,
        "sourceQuote"       TEXT,
        "confirmedById"     TEXT,
        "confirmedAt"       TIMESTAMP(3),
        "amendedStatement"  TEXT,
        "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("projectId", "requirementKey")
      );
      CREATE INDEX IF NOT EXISTS "Requirement_projectId_idx" ON "Requirement"("projectId");
      CREATE INDEX IF NOT EXISTS "Requirement_status_idx"    ON "Requirement"("status");

      -- Gaps: fields the AI couldn't ground in source documents
      CREATE TABLE IF NOT EXISTS "Gap" (
        "id"          TEXT NOT NULL PRIMARY KEY,
        "projectId"   TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "artifactId"  TEXT,
        "artifactType" TEXT,
        "fieldId"     TEXT NOT NULL,
        "question"    TEXT NOT NULL,
        "material"    BOOLEAN NOT NULL DEFAULT true,
        "status"      TEXT NOT NULL DEFAULT 'open',
        "answer"      TEXT,
        "answeredBy"  TEXT,
        "answeredAt"  TIMESTAMP(3),
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Gap_projectId_idx"   ON "Gap"("projectId");
      CREATE INDEX IF NOT EXISTS "Gap_artifactId_idx"  ON "Gap"("artifactId");
      CREATE INDEX IF NOT EXISTS "Gap_status_idx"      ON "Gap"("status");

      -- Track gap count on Artifact
      ALTER TABLE "Artifact"
        ADD COLUMN IF NOT EXISTS "gapCount"    INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "groundingScore" FLOAT;
    `);
    console.log("Grounding Phase 2 migration applied.");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
