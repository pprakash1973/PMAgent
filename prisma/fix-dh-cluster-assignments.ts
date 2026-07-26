/**
 * One-time fix: migrate DH users' account_assignments → cluster_assignments.
 *
 * Run with:  npx ts-node --project tsconfig.seed.json prisma/fix-dh-cluster-assignments.ts
 * Or via:    npx prisma db seed   (called automatically from seed.ts)
 *
 * Safe to run multiple times — all operations are idempotent.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "file:./dev.db";

function createClient() {
  if (url.startsWith("file:")) {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }
  const { Pool } = require("pg");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

const prisma = createClient();

async function fixDhAssignments() {
  console.log("\n🔧  Fixing DH cluster assignments…");

  // Find all DH users
  const dhUsers = await prisma.user.findMany({ where: { role: "dh" } });
  if (dhUsers.length === 0) { console.log("  No DH users found — nothing to do."); return; }
  console.log(`  Found ${dhUsers.length} DH user(s): ${dhUsers.map((u) => u.fullName).join(", ")}`);

  for (const user of dhUsers) {
    // Find their rows in account_assignments (migrated from old ClientAssignment)
    const accountAssignments = await (prisma as any).accountAssignment.findMany({
      where: { userId: user.id },
      include: { account: { select: { id: true, name: true, clusterId: true } } },
    });

    if (accountAssignments.length === 0) {
      console.log(`  ${user.fullName}: no account_assignments to migrate`);
      continue;
    }

    // Group by clusterId to avoid duplicates
    const clusterIds = [...new Set(
      accountAssignments
        .map((a: any) => a.account?.clusterId)
        .filter(Boolean) as string[]
    )];

    console.log(`  ${user.fullName}: migrating ${accountAssignments.length} account assignment(s) → ${clusterIds.length} cluster(s)`);

    for (const clusterId of clusterIds) {
      // Upsert cluster assignment (idempotent)
      try {
        await (prisma as any).clusterAssignment.upsert({
          where: { clusterId_userId: { clusterId, userId: user.id } },
          create: { id: randomUUID(), clusterId, userId: user.id, isPrimary: false, assignedBy: "migration-fix" },
          update: {},
        });
      } catch (err: any) {
        console.warn(`    ⚠ Could not upsert ClusterAssignment (${clusterId}, ${user.id}):`, err.message);
      }
    }

    // Remove DH user from account_assignments (they don't belong there)
    const deleted = await (prisma as any).accountAssignment.deleteMany({
      where: { userId: user.id },
    });
    if (deleted.count > 0) {
      console.log(`  ${user.fullName}: removed ${deleted.count} stale account_assignment(s)`);
    }
  }

  // Auto-promote primary DH per cluster where none is set
  const clusters = await (prisma as any).cluster.findMany({
    where: { deletedAt: null },
    include: { clusterAssignments: { orderBy: { assignedAt: "asc" } } },
  });

  for (const cluster of clusters) {
    if (!cluster.clusterAssignments.length) continue;
    const hasPrimary = cluster.clusterAssignments.some((a: any) => a.isPrimary);
    if (!hasPrimary) {
      const first = cluster.clusterAssignments[0];
      await (prisma as any).clusterAssignment.update({
        where: { clusterId_userId: { clusterId: cluster.id, userId: first.userId } },
        data: { isPrimary: true },
      });
      await (prisma as any).cluster.update({
        where: { id: cluster.id },
        data: { primaryDhId: first.userId },
      });
      const user = await prisma.user.findUnique({ where: { id: first.userId } });
      console.log(`  Auto-promoted ${user?.fullName ?? first.userId} as Primary DH for cluster "${cluster.name}"`);
    }
  }

  console.log("  ✅ DH assignment fix complete\n");
}

fixDhAssignments()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
