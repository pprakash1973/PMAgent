// Creates missing tables in the local SQLite dev.db.
// Run with: node scripts/migrate-sqlite-local.js
// Only runs when DATABASE_URL starts with "file:" (local dev).
require("dotenv/config");

const url = process.env.DATABASE_URL ?? "file:./dev.db";
if (!url.startsWith("file:")) {
  console.log("Skipping sqlite-local migration — not a file:// URL");
  process.exit(0);
}

const path = require("path");
const dbPath = url.replace(/^file:/, "");
const absPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

const Database = require("better-sqlite3");
const db = new Database(absPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  -- ── action_items ────────────────────────────────────────────────────────────
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
    "dueDate"         DATETIME,
    "originalDueDate" DATETIME,
    "assignedToId"    TEXT        NOT NULL REFERENCES "User"("id"),
    "raisedById"      TEXT        NOT NULL REFERENCES "User"("id"),
    "source"          TEXT        NOT NULL DEFAULT 'manual',
    "closedById"      TEXT        REFERENCES "User"("id"),
    "closureNote"     TEXT,
    "acknowledgedAt"  DATETIME,
    "submittedAt"     DATETIME,
    "closedAt"        DATETIME,
    "createdAt"       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "action_items_projectId_status" ON "action_items"("projectId","status");
  CREATE INDEX IF NOT EXISTS "action_items_assignedToId_status" ON "action_items"("assignedToId","status");
  CREATE INDEX IF NOT EXISTS "action_items_raisedById" ON "action_items"("raisedById");

  -- ── action_item_events ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS "action_item_events" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "actionItemId" TEXT     NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE,
    "actorId"      TEXT     NOT NULL REFERENCES "User"("id"),
    "fromStatus"   TEXT     NOT NULL,
    "toStatus"     TEXT     NOT NULL,
    "reason"       TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "action_item_events_actionItemId" ON "action_item_events"("actionItemId");

  -- ── dm_review_notes ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS "dm_review_notes" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "projectId"  TEXT     NOT NULL REFERENCES "Project"("id"),
    "authorId"   TEXT     NOT NULL REFERENCES "User"("id"),
    "reviewType" TEXT     NOT NULL DEFAULT 'ad_hoc',
    "body"       TEXT     NOT NULL,
    "visibility" TEXT     NOT NULL DEFAULT 'shared_with_pm',
    "lockedAt"   DATETIME,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "dm_review_notes_projectId" ON "dm_review_notes"("projectId");

  -- ── Escalation columns added in DM persona plan ──────────────────────────────
  -- SQLite doesn't support ADD COLUMN IF NOT EXISTS before 3.37, so we use a try block
  -- via separate statements. Using SELECT to check first.
`);

// Add columns to Escalation only if the table exists and columns are missing
function addColIfMissing(table, col, def) {
  try {
    const cols = db.pragma(`table_info("${table}")`).map(r => r.name);
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${def}`);
      console.log(`  + ${table}.${col}`);
    }
  } catch {
    // Table may not exist — skip
  }
}

addColIfMissing("Escalation", "situation",       "TEXT NOT NULL DEFAULT ''");
addColIfMissing("Escalation", "impact",           "TEXT NOT NULL DEFAULT ''");
addColIfMissing("Escalation", "supportRequired",  "TEXT NOT NULL DEFAULT ''");

// ── ProjectPmAssignment ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS "ProjectPmAssignment" (
    "id"            TEXT     NOT NULL PRIMARY KEY,
    "projectId"     TEXT     NOT NULL REFERENCES "Project"("id"),
    "userId"        TEXT     NOT NULL REFERENCES "User"("id"),
    "assignedBy"    TEXT,
    "reason"        TEXT     NOT NULL DEFAULT '',
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo"   DATETIME,
    "assignedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- ── ModelConfig ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS "ModelConfig" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "agent"     TEXT     NOT NULL UNIQUE,
    "model"     TEXT     NOT NULL,
    "maxTokens" INTEGER  NOT NULL DEFAULT 8192,
    "notes"     TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT
  );
`);

db.close();
console.log("✓ SQLite local migration complete");
