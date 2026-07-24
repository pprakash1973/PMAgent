// Grounding PRD Phase 1: document ingestion + evidence store schema
// Run with: node scripts/migrate-grounding-phase1.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping grounding migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      -- Extend RequirementsDocument with grounding metadata
      ALTER TABLE "RequirementsDocument"
        ADD COLUMN IF NOT EXISTS "docClass"            TEXT NOT NULL DEFAULT 'other',
        ADD COLUMN IF NOT EXISTS "effectiveDate"       TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "confidentialityTier" TEXT NOT NULL DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS "ingestionState"      TEXT NOT NULL DEFAULT 'ready',
        ADD COLUMN IF NOT EXISTS "chunkCount"          INT  NOT NULL DEFAULT 0;

      -- Extend Project with evidence readiness
      ALTER TABLE "Project"
        ADD COLUMN IF NOT EXISTS "evidenceReadinessScore" FLOAT,
        ADD COLUMN IF NOT EXISTS "evidenceReadinessBand"  TEXT;

      -- Document chunks (text split with locators for retrieval)
      CREATE TABLE IF NOT EXISTS "DocumentChunk" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "documentId"   TEXT NOT NULL REFERENCES "RequirementsDocument"("id") ON DELETE CASCADE,
        "projectId"    TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "chunkIndex"   INT  NOT NULL,
        "pageNumber"   INT,
        "charStart"    INT,
        "charEnd"      INT,
        "sectionTitle" TEXT,
        "text"         TEXT NOT NULL,
        "tokenCount"   INT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("documentId", "chunkIndex")
      );
      CREATE INDEX IF NOT EXISTS "DocumentChunk_projectId_idx"  ON "DocumentChunk"("projectId");
      CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

      -- Full-text search index on chunk text (Phase 1 retrieval; vectors added in Phase 2)
      CREATE INDEX IF NOT EXISTS "DocumentChunk_text_search_idx"
        ON "DocumentChunk" USING gin(to_tsvector('english', "text"));
    `);
    console.log("Grounding Phase 1 migration applied.");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
