/**
 * Migration: add engagementType column to Project table
 * Run once against Neon: node --env-file=.env.local scripts/migrate-engagement-type.js
 */
require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Adding engagementType column to Project table...");

  await prisma.$executeRaw`
    ALTER TABLE "Project"
    ADD COLUMN IF NOT EXISTS "engagementType" TEXT NOT NULL DEFAULT 'application_development'
  `;

  const result = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Project"`;
  console.log(`✓ Done. ${result[0].count} existing projects defaulted to 'application_development'.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
