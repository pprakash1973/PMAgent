import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

// PGM@pmAgent.dev is assigned to "Digital Retail Transformation"
const PROGRAM_ID = "cms2smr3t0009kwl1crcnvjid";

// U25445@ust.com's 2 active projects with no programId
const PROJECT_IDS = [
  "cms2rr12h000004js2u3tkun1", // Ecommerce Portal for AMART
  "cms1yhmdf000004jp5li68drd", // Migration and Modernisation of Legacy OPS
];

async function main() {
  for (const id of PROJECT_IDS) {
    const updated = await prisma.project.update({
      where: { id },
      data: { programId: PROGRAM_ID },
      select: { id: true, name: true, programId: true },
    });
    console.log("Updated:", updated);
  }
  console.log("\nDone — both projects now linked to Digital Retail Transformation program.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
