// Adds DM-feature tables and Escalation columns to Neon PostgreSQL (production).
// Safe to re-run — all statements use IF NOT EXISTS / IF NOT EXISTS.
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping dm-features migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    // ── New tables ─────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "action_items" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "reference"       TEXT        NOT NULL UNIQUE,
        "projectId"       TEXT        NOT NULL REFERENCES "Project"("id"),
        "title"           TEXT        NOT NULL,
        "description"     TEXT,
        "category"        TEXT        NOT NULL DEFAULT 'schedule',
        "priority"        TEXT        NOT NULL DEFAULT 'p2',
        "status"          TEXT        NOT NULL DEFAULT 'open',
        "expectedOutcome" TEXT,
        "dueDate"         TIMESTAMP(3),
        "originalDueDate" TIMESTAMP(3),
        "assignedToId"    TEXT        NOT NULL REFERENCES "User"("id"),
        "raisedById"      TEXT        NOT NULL REFERENCES "User"("id"),
        "source"          TEXT        NOT NULL DEFAULT 'manual',
        "closedById"      TEXT        REFERENCES "User"("id"),
        "closureNote"     TEXT,
        "acknowledgedAt"  TIMESTAMP(3),
        "submittedAt"     TIMESTAMP(3),
        "closedAt"        TIMESTAMP(3),
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "action_items_projectId_status_idx" ON "action_items"("projectId","status");
      CREATE INDEX IF NOT EXISTS "action_items_assignedToId_status_idx" ON "action_items"("assignedToId","status");
      CREATE INDEX IF NOT EXISTS "action_items_raisedById_idx" ON "action_items"("raisedById");

      CREATE TABLE IF NOT EXISTS "action_item_events" (
        "id"           TEXT        NOT NULL PRIMARY KEY,
        "actionItemId" TEXT        NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE,
        "actorId"      TEXT        NOT NULL REFERENCES "User"("id"),
        "fromStatus"   TEXT        NOT NULL,
        "toStatus"     TEXT        NOT NULL,
        "reason"       TEXT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "action_item_events_actionItemId_idx" ON "action_item_events"("actionItemId");

      CREATE TABLE IF NOT EXISTS "dm_review_notes" (
        "id"         TEXT        NOT NULL PRIMARY KEY,
        "projectId"  TEXT        NOT NULL REFERENCES "Project"("id"),
        "authorId"   TEXT        NOT NULL REFERENCES "User"("id"),
        "reviewType" TEXT        NOT NULL DEFAULT 'ad_hoc',
        "body"       TEXT        NOT NULL,
        "visibility" TEXT        NOT NULL DEFAULT 'shared_with_pm',
        "lockedAt"   TIMESTAMP(3),
        "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "dm_review_notes_projectId_idx" ON "dm_review_notes"("projectId");
    `);
    console.log("✓ action_items, action_item_events, dm_review_notes tables ready");

    // ── Escalation columns (situation, impact, supportRequired) ───────────────
    // These were added to the schema after initial deployment — safe to add IF NOT EXISTS.
    await pool.query(`
      ALTER TABLE "Escalation" ADD COLUMN IF NOT EXISTS "situation"        TEXT NOT NULL DEFAULT '';
      ALTER TABLE "Escalation" ADD COLUMN IF NOT EXISTS "impact"           TEXT NOT NULL DEFAULT '';
      ALTER TABLE "Escalation" ADD COLUMN IF NOT EXISTS "supportRequired"  TEXT NOT NULL DEFAULT '';
    `);
    console.log("✓ Escalation columns (situation, impact, supportRequired) ready");

    // ── ProjectPmAssignment table ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ProjectPmAssignment" (
        "id"            TEXT        NOT NULL PRIMARY KEY,
        "projectId"     TEXT        NOT NULL REFERENCES "Project"("id"),
        "userId"        TEXT        NOT NULL REFERENCES "User"("id"),
        "assignedBy"    TEXT,
        "reason"        TEXT        NOT NULL DEFAULT '',
        "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "effectiveTo"   TIMESTAMP(3),
        "assignedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ ProjectPmAssignment table ready");

    // ── ModelConfig table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ModelConfig" (
        "id"        TEXT        NOT NULL PRIMARY KEY,
        "agent"     TEXT        NOT NULL UNIQUE,
        "model"     TEXT        NOT NULL,
        "maxTokens" INTEGER     NOT NULL DEFAULT 8192,
        "notes"     TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedBy" TEXT
      );
    `);
    console.log("✓ ModelConfig table ready");

  } catch (err) {
    console.error("dm-features migration error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
