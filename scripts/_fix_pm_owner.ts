import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const ERP_PROJECT_ID = "cms2smsda000bkwl16ucnrvn7";
const PRAKASH_ID     = "cms1t7q6g000004l51fjuhztd";  // U25445@ust.com

async function main() {
  // Fix project pmOwner
  const p = await prisma.project.update({
    where: { id: ERP_PROJECT_ID },
    data: { pmOwnerId: PRAKASH_ID },
    select: { name: true, pmOwnerId: true },
  });
  console.log("Project updated:", p);

  // Fix existing action item assignedToId
  const updated = await prisma.actionItem.updateMany({
    where: { projectId: ERP_PROJECT_ID, assignedToId: { not: PRAKASH_ID } },
    data: { assignedToId: PRAKASH_ID },
  });
  console.log("Action items reassigned:", updated.count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
