export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Applies the CR-01 migration SQL idempotently against the live database.
 * All statements use IF NOT EXISTS / IF EXISTS so re-running is safe.
 * POST /api/admin/maintenance/migrate-cr01
 */
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const log: string[] = [];

  async function run(label: string, sql: string) {
    try {
      await prisma.$executeRawUnsafe(sql);
      log.push(`✅ ${label}`);
    } catch (err: any) {
      log.push(`⚠  ${label}: ${err.message}`);
    }
  }

  // Step 1: Rename Client → org_accounts (only if Client still exists)
  await run("Rename Client → org_accounts",
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='Client') THEN
         ALTER TABLE "Client" RENAME TO "org_accounts";
       END IF;
     END $$;`);

  await run("Add primaryDmId to org_accounts",
    `ALTER TABLE "org_accounts" ADD COLUMN IF NOT EXISTS "primaryDmId" TEXT;`);

  // Step 2: clientId → accountId on Program
  await run("Rename Program.clientId → accountId",
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Program' AND column_name='clientId') THEN
         ALTER TABLE "Program" RENAME COLUMN "clientId" TO "accountId";
       END IF;
     END $$;`);

  // Step 3: clientId → accountId on Project
  await run("Rename Project.clientId → accountId",
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Project' AND column_name='clientId') THEN
         ALTER TABLE "Project" RENAME COLUMN "clientId" TO "accountId";
       END IF;
     END $$;`);

  // Step 4: clusterId on Project
  await run("Add Project.clusterId",
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clusterId" TEXT;`);

  await run("Backfill Project.clusterId",
    `UPDATE "Project" p SET "clusterId" = a."clusterId"
     FROM "org_accounts" a WHERE p."accountId" = a."id" AND p."clusterId" IS NULL;`);

  // Step 5: primaryDhId on Cluster
  await run("Add Cluster.primaryDhId",
    `ALTER TABLE "Cluster" ADD COLUMN IF NOT EXISTS "primaryDhId" TEXT;`);

  // Step 6: cluster_assignments
  await run("Create cluster_assignments table",
    `CREATE TABLE IF NOT EXISTS "cluster_assignments" (
       "id"         TEXT    NOT NULL PRIMARY KEY,
       "clusterId"  TEXT    NOT NULL REFERENCES "Cluster"("id") ON DELETE CASCADE,
       "userId"     TEXT    NOT NULL REFERENCES "User"("id")    ON DELETE CASCADE,
       "isPrimary"  BOOLEAN NOT NULL DEFAULT FALSE,
       "assignedBy" TEXT,
       "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "cluster_assignments_clusterId_userId_key" UNIQUE ("clusterId","userId")
     );`);

  await run("Index cluster_assignments",
    `CREATE INDEX IF NOT EXISTS "cluster_assignments_clusterId_isPrimary_idx"
       ON "cluster_assignments"("clusterId","isPrimary");`);

  // Step 7: account_assignments
  await run("Create account_assignments table",
    `CREATE TABLE IF NOT EXISTS "account_assignments" (
       "id"         TEXT    NOT NULL PRIMARY KEY,
       "accountId"  TEXT    NOT NULL REFERENCES "org_accounts"("id") ON DELETE CASCADE,
       "userId"     TEXT    NOT NULL REFERENCES "User"("id")         ON DELETE CASCADE,
       "isPrimary"  BOOLEAN NOT NULL DEFAULT FALSE,
       "assignedBy" TEXT,
       "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "account_assignments_accountId_userId_key" UNIQUE ("accountId","userId")
     );`);

  await run("Index account_assignments",
    `CREATE INDEX IF NOT EXISTS "account_assignments_accountId_isPrimary_idx"
       ON "account_assignments"("accountId","isPrimary");`);

  // Step 8: Migrate ClientAssignment → account_assignments
  await run("Migrate ClientAssignment rows → account_assignments",
    `INSERT INTO "account_assignments" ("id","accountId","userId","isPrimary","assignedBy","assignedAt")
     SELECT gen_random_uuid()::text,"clientId","userId",FALSE,"assignedBy","assignedAt"
     FROM   "ClientAssignment"
     ON CONFLICT DO NOTHING;`);

  // Step 9: Drop ClientAssignment
  await run("Drop ClientAssignment table",
    `DROP TABLE IF EXISTS "ClientAssignment";`);

  // Step 10: DH fix — move DH rows from account_assignments → cluster_assignments
  await run("Migrate DH account_assignments → cluster_assignments",
    `INSERT INTO "cluster_assignments" ("id","clusterId","userId","isPrimary","assignedBy","assignedAt")
     SELECT gen_random_uuid()::text, a."clusterId", aa."userId", FALSE, aa."assignedBy", aa."assignedAt"
     FROM   "account_assignments" aa
     JOIN   "User" u   ON u."id"  = aa."userId" AND u."role" = 'dh'
     JOIN   "org_accounts" a ON a."id" = aa."accountId"
     WHERE  NOT EXISTS (
       SELECT 1 FROM "cluster_assignments" ca
       WHERE ca."userId" = aa."userId" AND ca."clusterId" = a."clusterId"
     )
     ON CONFLICT DO NOTHING;`);

  await run("Remove DH rows from account_assignments",
    `DELETE FROM "account_assignments"
     WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'dh');`);

  // Step 11: Auto-promote primary DH per cluster
  await run("Auto-promote primary DH per cluster",
    `UPDATE "cluster_assignments" ca SET "isPrimary" = TRUE
     WHERE ca."id" = (
       SELECT ca2."id" FROM "cluster_assignments" ca2
       WHERE ca2."clusterId" = ca."clusterId"
       ORDER BY ca2."assignedAt" ASC LIMIT 1
     )
     AND NOT EXISTS (
       SELECT 1 FROM "cluster_assignments" ca3
       WHERE ca3."clusterId" = ca."clusterId" AND ca3."isPrimary" = TRUE
     );`);

  await run("Backfill Cluster.primaryDhId",
    `UPDATE "Cluster" c SET "primaryDhId" = (
       SELECT ca."userId" FROM "cluster_assignments" ca
       WHERE ca."clusterId" = c."id" AND ca."isPrimary" = TRUE LIMIT 1
     ) WHERE c."primaryDhId" IS NULL;`);

  log.push("Migration complete.");
  return NextResponse.json({ ok: true, log });
}
