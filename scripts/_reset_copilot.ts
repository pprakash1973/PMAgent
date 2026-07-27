import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const email = "U25445@ust.com";
  const user = await prisma.user.update({
    where: { email },
    data: { copilotEnabled: false },
    select: { id: true, email: true, copilotEnabled: true, assistantName: true },
  });
  console.log("Reset copilot for:", user);
}

main().catch(console.error).finally(() => prisma.$disconnect());
