import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: "cms2smsda000bkwl16ucnrvn7" },
    select: { id: true, name: true, accountId: true, programId: true, pmOwnerId: true },
  });
  console.log("Project:", JSON.stringify(project, null, 2));

  const programs = await prisma.program.findMany({ select: { id: true, name: true, accountId: true } });
  console.log("Programs:", JSON.stringify(programs, null, 2));

  const adam = await prisma.user.findFirst({ where: { email: "Adam.Casey@ust.com" }, select: { id: true, fullName: true, role: true, email: true } });
  console.log("Adam Casey:", JSON.stringify(adam, null, 2));

  const u25 = await prisma.user.findFirst({ where: { email: "U25445@ust.com" }, select: { id: true, fullName: true, role: true, email: true } });
  console.log("U25445:", JSON.stringify(u25, null, 2));

  // Who is the pmOwner of the project?
  if (project?.pmOwnerId) {
    const pmOwner = await prisma.user.findUnique({ where: { id: project.pmOwnerId }, select: { id: true, fullName: true, email: true } });
    console.log("PM Owner of ERP project:", JSON.stringify(pmOwner, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
