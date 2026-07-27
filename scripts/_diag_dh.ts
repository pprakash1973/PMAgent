import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

async function main() {
  // Find DH users
  const dhUsers = await prisma.user.findMany({
    where: { role: "dh" },
    select: { id: true, email: true, role: true, orgId: true },
  });
  console.log("DH users:", JSON.stringify(dhUsers, null, 2));

  for (const dh of dhUsers) {
    const assignments = await (prisma as any).clusterAssignment.findMany({
      where: { userId: dh.id },
      include: { cluster: true },
    }).catch(() => []);
    console.log(`\nClusterAssignments for ${dh.email}:`, JSON.stringify(assignments, null, 2));
  }

  // Check all projects — what clusterId do they have?
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, clusterId: true, accountId: true, programId: true },
  });
  console.log("\nAll projects (clusterId):", JSON.stringify(projects, null, 2));

  // Check what clusters exist
  const clusters = await (prisma as any).cluster.findMany({
    select: { id: true, name: true, type: true, orgId: true },
  }).catch(() => []);
  console.log("\nClusters:", JSON.stringify(clusters, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
