// Creates new tables for Program Manager phase (pgm role + escalations)
// Run with: node scripts/migrate-pgm-phase.js
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ProjectPmAssignment" (
        "id"         TEXT NOT NULL PRIMARY KEY,
        "projectId"  TEXT NOT NULL REFERENCES "Project"("id"),
        "userId"     TEXT NOT NULL REFERENCES "User"("id"),
        "assignedBy" TEXT,
        "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("projectId", "userId")
      )
    `);
    console.log("ProjectPmAssignment table ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "Escalation" (
        "id"          TEXT NOT NULL PRIMARY KEY,
        "orgId"       TEXT NOT NULL,
        "projectId"   TEXT REFERENCES "Project"("id"),
        "riskId"      TEXT REFERENCES "Risk"("id"),
        "raisedById"  TEXT NOT NULL REFERENCES "User"("id"),
        "ownerId"     TEXT REFERENCES "User"("id"),
        "title"       TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "severity"    TEXT NOT NULL DEFAULT 'medium',
        "status"      TEXT NOT NULL DEFAULT 'open',
        "resolvedAt"  TIMESTAMP(3),
        "dueDate"     TIMESTAMP(3),
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Escalation table ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "EscalationComment" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "escalationId" TEXT NOT NULL REFERENCES "Escalation"("id"),
        "userId"       TEXT NOT NULL REFERENCES "User"("id"),
        "body"         TEXT NOT NULL,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("EscalationComment table ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "NotificationPreference" (
        "id"                TEXT NOT NULL PRIMARY KEY,
        "userId"            TEXT NOT NULL UNIQUE REFERENCES "User"("id"),
        "escalationEmail"   BOOLEAN NOT NULL DEFAULT true,
        "escalationInApp"   BOOLEAN NOT NULL DEFAULT true,
        "statusReportEmail" BOOLEAN NOT NULL DEFAULT false,
        "statusReportInApp" BOOLEAN NOT NULL DEFAULT true
      )
    `);
    console.log("NotificationPreference table ready");

    // Update Bob Delivery's role from dm to pgm if still dm
    await pool.query(`
      UPDATE "User" SET "role" = 'pgm' WHERE "email" = 'dm@pmAgent.dev' AND "role" = 'dm'
    `);
    console.log("Seed user role updated: dm@pmAgent.dev -> pgm");

  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
