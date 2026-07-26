-- CR-01 Fix: Migrate DH users' account_assignments → cluster_assignments
--
-- Problem: The previous migration (20260726_cr01_account_hierarchy) moved ALL
-- ClientAssignment rows into account_assignments. That table is now only for
-- DM↔Account. DH users need rows in cluster_assignments instead, one per
-- cluster that each of their old client accounts belonged to.
--
-- This migration:
--   1. Creates cluster_assignments for all DH users based on the accounts
--      they were previously assigned to (now sitting in account_assignments).
--   2. Removes DH users from account_assignments (they don't belong there).
--   3. Promotes a primary DH per cluster if none already set.

-- ── Step 1: Create cluster_assignments for DH users ─────────────────────────
-- For each DH user's account_assignment row, look up the account's clusterId
-- and insert a cluster_assignment. DISTINCT ensures one row per (cluster, user)
-- even if the DH was assigned to multiple accounts in the same cluster.

INSERT INTO "cluster_assignments"
  ("id", "clusterId", "userId", "isPrimary", "assignedBy", "assignedAt")
SELECT
  gen_random_uuid()::text,
  a."clusterId",
  aa."userId",
  FALSE,
  aa."assignedBy",
  aa."assignedAt"
FROM "account_assignments" aa
JOIN "User" u   ON u."id"  = aa."userId"  AND u."role" = 'dh'
JOIN "org_accounts" a ON a."id"  = aa."accountId"
WHERE NOT EXISTS (
  SELECT 1 FROM "cluster_assignments" ca
  WHERE ca."userId"    = aa."userId"
    AND ca."clusterId" = a."clusterId"
)
ON CONFLICT DO NOTHING;

-- ── Step 2: Auto-promote primary DH per cluster where none is set ────────────
-- If a cluster has DH assignments but no primary, make the earliest-assigned
-- DH the primary.

UPDATE "cluster_assignments" ca
SET    "isPrimary" = TRUE
WHERE  ca."id" = (
  SELECT ca2."id"
  FROM   "cluster_assignments" ca2
  WHERE  ca2."clusterId" = ca."clusterId"
  ORDER  BY ca2."assignedAt" ASC
  LIMIT  1
)
AND NOT EXISTS (
  SELECT 1 FROM "cluster_assignments" ca3
  WHERE  ca3."clusterId" = ca."clusterId" AND ca3."isPrimary" = TRUE
);

-- ── Step 3: Backfill Cluster.primaryDhId where still NULL ───────────────────

UPDATE "Cluster" c
SET    "primaryDhId" = (
  SELECT ca."userId"
  FROM   "cluster_assignments" ca
  WHERE  ca."clusterId" = c."id" AND ca."isPrimary" = TRUE
  LIMIT  1
)
WHERE  c."primaryDhId" IS NULL
AND    EXISTS (
  SELECT 1 FROM "cluster_assignments" ca WHERE ca."clusterId" = c."id"
);

-- ── Step 4: Remove DH users from account_assignments ────────────────────────
-- Those rows were DH→client assignments in the old model and have no meaning
-- in the new model. DM→account assignments for actual DMs remain untouched.

DELETE FROM "account_assignments"
WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "role" = 'dh'
);

-- Done. Run `npx prisma generate` if schema was regenerated.
