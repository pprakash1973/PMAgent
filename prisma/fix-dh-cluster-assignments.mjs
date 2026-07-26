/**
 * One-time fix: migrate DH users' account_assignments → cluster_assignments.
 * Run with: node prisma/fix-dh-cluster-assignments.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
console.log("Connecting to:", url.startsWith("postgresql") ? url.split("@")[1] : url);

let prisma;
if (url.startsWith("file:")) {
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3({ url });
  prisma = new PrismaClient({ adapter });
} else {
  const { Pool } = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
}

async function fixDhAssignments() {
  console.log("\n🔧  Fixing DH cluster assignments…");

  const dhUsers = await prisma.user.findMany({ where: { role: "dh" } });
  if (dhUsers.length === 0) { console.log("  No DH users found — nothing to do."); return; }
  console.log(`  Found ${dhUsers.length} DH user(s): ${dhUsers.map(u => u.fullName).join(", ")}`);

  for (const user of dhUsers) {
    const accountAssignments = await prisma.accountAssignment.findMany({
      where: { userId: user.id },
      include: { account: { select: { id: true, name: true, clusterId: true } } },
    });

    if (accountAssignments.length === 0) {
      console.log(`  ${user.fullName}: no stale account_assignments to migrate`);
      continue;
    }

    const clusterIds = [...new Set(
      accountAssignments.map(a => a.account?.clusterId).filter(Boolean)
    )];

    console.log(`  ${user.fullName}: migrating ${accountAssignments.length} account assignment(s) → ${clusterIds.length} cluster(s)`);

    for (const clusterId of clusterIds) {
      try {
        await prisma.clusterAssignment.upsert({
          where: { clusterId_userId: { clusterId, userId: user.id } },
          create: { id: randomUUID(), clusterId, userId: user.id, isPrimary: false, assignedBy: "migration-fix" },
          update: {},
        });
      } catch (err) {
        console.warn(`    ⚠ Could not upsert ClusterAssignment (${clusterId}, ${user.id}):`, err.message);
      }
    }

    const deleted = await prisma.accountAssignment.deleteMany({ where: { userId: user.id } });
    if (deleted.count > 0) {
      console.log(`  ${user.fullName}: removed ${deleted.count} stale account_assignment(s)`);
    }
  }

  // Auto-promote primary DH per cluster where none is set
  const clusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    include: { clusterAssignments: { orderBy: { assignedAt: "asc" } } },
  });

  for (const cluster of clusters) {
    if (!cluster.clusterAssignments.length) continue;
    const hasPrimary = cluster.clusterAssignments.some(a => a.isPrimary);
    if (!hasPrimary) {
      const first = cluster.clusterAssignments[0];
      await prisma.clusterAssignment.update({
        where: { clusterId_userId: { clusterId: cluster.id, userId: first.userId } },
        data: { isPrimary: true },
      });
      await prisma.cluster.update({
        where: { id: cluster.id },
        data: { primaryDhId: first.userId },
      });
      const user = await prisma.user.findUnique({ where: { id: first.userId } });
      console.log(`  Auto-promoted ${user?.fullName ?? first.userId} as Primary DH for cluster "${cluster.name}"`);
    }
  }

  console.log("  ✅ DH assignment fix complete\n");
}

await fixDhAssignments().catch(console.error).finally(() => prisma.$disconnect());
