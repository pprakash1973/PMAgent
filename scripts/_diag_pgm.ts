import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

async function main() {
  const pgmUser = await prisma.user.findUnique({
    where: { email: "PGM@pmAgent.dev" },
    select: { id: true, email: true, role: true, orgId: true },
  });
  console.log("PGM user:", pgmUser);

  if (!pgmUser) return;

  const [accountAssignments, programAssignments] = await Promise.all([
    (prisma as any).accountAssignment.findMany({
      where: { userId: pgmUser.id },
      include: { account: { select: { id: true, name: true } } },
    }).catch(() => []),
    (prisma as any).programAssignment.findMany({
      where: { userId: pgmUser.id },
      include: { program: { select: { id: true, name: true } } },
    }).catch(() => []),
  ]);
  console.log("\nAccountAssignments:", JSON.stringify(accountAssignments, null, 2));
  console.log("\nProgramAssignments:", JSON.stringify(programAssignments, null, 2));

  const pm = await prisma.user.findUnique({
    where: { email: "U25445@ust.com" },
    select: { id: true, email: true },
  });
  console.log("\nPM user:", pm);

  if (!pm) return;

  const projects = await prisma.project.findMany({
    where: { pmOwnerId: pm.id },
    select: { id: true, name: true, accountId: true, programId: true, status: true, deletedAt: true },
  });
  console.log("\nProjects owned by PM:", JSON.stringify(projects, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
