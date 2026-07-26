-- CR-01: Account Hierarchy Migration
-- Renames Client → OrgAccount, adds ClusterAssignment, AccountAssignment,
-- makes Program.program_id optional on Project, adds clusterId to Project.

-- ── Step 1: Rename clients table to org_accounts ────────────────────────────
ALTER TABLE "Client" RENAME TO "org_accounts";
ALTER TABLE "org_accounts" ADD COLUMN IF NOT EXISTS "primaryDmId" TEXT;

-- ── Step 2: Rename FK column clientId → accountId on programs ───────────────
ALTER TABLE "Program" RENAME COLUMN "clientId" TO "accountId";

-- ── Step 3: Rename FK column clientId → accountId on projects ───────────────
ALTER TABLE "Project" RENAME COLUMN "clientId" TO "accountId";

-- ── Step 4: Add clusterId (denormalised) to Project ─────────────────────────
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clusterId" TEXT;

-- Backfill clusterId from account → cluster
UPDATE "Project" p
SET    "clusterId" = a."clusterId"
FROM   "org_accounts" a
WHERE  p."accountId" = a."id"
  AND  p."clusterId" IS NULL;

-- ── Step 5: Add primaryDhId to Cluster ──────────────────────────────────────
ALTER TABLE "Cluster" ADD COLUMN IF NOT EXISTS "primaryDhId" TEXT;

-- ── Step 6: Create cluster_assignments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "cluster_assignments" (
  "id"         TEXT    NOT NULL PRIMARY KEY,
  "clusterId"  TEXT    NOT NULL REFERENCES "Cluster"("id") ON DELETE CASCADE,
  "userId"     TEXT    NOT NULL REFERENCES "User"("id")    ON DELETE CASCADE,
  "isPrimary"  BOOLEAN NOT NULL DEFAULT FALSE,
  "assignedBy" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cluster_assignments_clusterId_userId_key" UNIQUE ("clusterId", "userId")
);
CREATE INDEX IF NOT EXISTS "cluster_assignments_clusterId_isPrimary_idx"
  ON "cluster_assignments"("clusterId", "isPrimary");

-- ── Step 7: Create account_assignments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "account_assignments" (
  "id"         TEXT    NOT NULL PRIMARY KEY,
  "accountId"  TEXT    NOT NULL REFERENCES "org_accounts"("id") ON DELETE CASCADE,
  "userId"     TEXT    NOT NULL REFERENCES "User"("id")         ON DELETE CASCADE,
  "isPrimary"  BOOLEAN NOT NULL DEFAULT FALSE,
  "assignedBy" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_assignments_accountId_userId_key" UNIQUE ("accountId", "userId")
);
CREATE INDEX IF NOT EXISTS "account_assignments_accountId_isPrimary_idx"
  ON "account_assignments"("accountId", "isPrimary");

-- ── Step 8: Migrate ClientAssignment → account_assignments ──────────────────
-- (best-effort: old assignments become non-primary DM assignments)
INSERT INTO "account_assignments" ("id", "accountId", "userId", "isPrimary", "assignedBy", "assignedAt")
SELECT gen_random_uuid()::text, "clientId", "userId", FALSE, "assignedBy", "assignedAt"
FROM   "ClientAssignment"
ON CONFLICT DO NOTHING;

-- ── Step 9: Drop retired ClientAssignment table ──────────────────────────────
DROP TABLE IF EXISTS "ClientAssignment";

-- ── Step 10: Rename FK on Cluster.clients relation ──────────────────────────
-- (Prisma relation name change only; no physical column rename needed)
-- The org_accounts.clusterId column already exists and references Cluster.id.

-- Done — run `npx prisma generate` after applying this migration.
