export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * Applies the Scope Control schema additions idempotently against Neon.
 * All statements use IF NOT EXISTS so re-running is safe.
 * POST /api/admin/maintenance/migrate-scope-control
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

  // Requirement.isActive — soft-delete flag for scope control remove/restore
  await run("Requirement.isActive column",
    `ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true`);

  // Requirement.sourceDocId — links a requirement to the source document
  await run("Requirement.sourceDocId column",
    `ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "sourceDocId" TEXT`);

  // scope_baselines table — tracks scope baseline snapshots
  await run("scope_baselines table",
    `CREATE TABLE IF NOT EXISTS scope_baselines (
      "id"               TEXT        NOT NULL PRIMARY KEY,
      "projectId"        TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
      "version"          INT         NOT NULL,
      "label"            TEXT        NOT NULL,
      "snapshot"         JSONB       NOT NULL DEFAULT '[]',
      "removedSnapshot"  JSONB       NOT NULL DEFAULT '[]',
      "impactSummary"    JSONB,
      "requirementCount" INT         NOT NULL DEFAULT 0,
      "deltaReviewed"    BOOLEAN     NOT NULL DEFAULT false,
      "createdById"      TEXT,
      "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("projectId","version")
    );
    CREATE INDEX IF NOT EXISTS "scope_baselines_projectId_idx" ON scope_baselines("projectId")`);

  // Artifact.scopeBaselineId FK (used by scope-delta apply)
  await run("Artifact.scopeBaselineId column",
    `ALTER TABLE "Artifact" ADD COLUMN IF NOT EXISTS "scopeBaselineId" TEXT REFERENCES scope_baselines("id")`);

  log.push("Migration complete.");
  return NextResponse.json({ ok: true, log });
}
