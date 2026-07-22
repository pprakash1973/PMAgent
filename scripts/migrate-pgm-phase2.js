// Phase 3 migration: extend Escalation + ProjectPmAssignment tables
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
    // ── ProjectPmAssignment: add reason + effective dates ─────────────────────
    await pool.query(`ALTER TABLE "ProjectPmAssignment" ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE "ProjectPmAssignment" ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE "ProjectPmAssignment" ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3)`);
    // Drop the unique constraint so we can track history (multiple rows per project)
    await pool.query(`ALTER TABLE "ProjectPmAssignment" DROP CONSTRAINT IF EXISTS "ProjectPmAssignment_projectId_userId_key"`);
    console.log("ProjectPmAssignment extended");

    // ── Escalation: add missing PRD fields ───────────────────────────────────
    const escalationCols = [
      `"targetType"           TEXT NOT NULL DEFAULT 'project'`,
      `"situation"            TEXT NOT NULL DEFAULT ''`,
      `"impact"               TEXT NOT NULL DEFAULT ''`,
      `"supportRequired"      TEXT NOT NULL DEFAULT ''`,
      `"slaBreachedAt"        TIMESTAMP(3)`,
      `"slaDueAt"             TIMESTAMP(3)`,
      `"acknowledgedById"     TEXT REFERENCES "User"("id")`,
      `"acknowledgedAt"       TIMESTAMP(3)`,
      `"resolvedById"         TEXT REFERENCES "User"("id")`,
      `"resolvedAt"           TIMESTAMP(3)`,
      `"resolutionNote"       TEXT`,
      `"withdrawnAt"          TIMESTAMP(3)`,
      `"withdrawalReason"     TEXT`,
      `"targetResolutionDate" TIMESTAMP(3)`,
      `"contextSnapshot"      JSONB`,
    ];
    for (const col of escalationCols) {
      const colName = col.match(/"(\w+)"/)[1];
      await pool.query(`ALTER TABLE "Escalation" ADD COLUMN IF NOT EXISTS ${col}`).catch(e => {
        if (!e.message.includes("already exists")) throw e;
      });
    }
    // Ensure description column exists (was already there but add if not)
    await pool.query(`ALTER TABLE "Escalation" ALTER COLUMN "severity" SET DEFAULT 'high'`).catch(() => {});
    console.log("Escalation table extended");

    console.log("Phase 3 migration complete");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
