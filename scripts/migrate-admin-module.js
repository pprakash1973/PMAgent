// Adds Admin Module tables to Neon PostgreSQL (production)
// Run with: node scripts/migrate-admin-module.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping admin migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      -- User status field
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

      -- Cluster table
      CREATE TABLE IF NOT EXISTS "Cluster" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL UNIQUE,
        "type" TEXT NOT NULL DEFAULT 'geography',
        "clusterLead" TEXT,
        "description" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Cluster_orgId_name_key" ON "Cluster"("orgId","name");

      -- Client table
      CREATE TABLE IF NOT EXISTS "Client" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "clusterId" TEXT NOT NULL REFERENCES "Cluster"("id"),
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL UNIQUE,
        "industry" TEXT,
        "region" TEXT NOT NULL DEFAULT 'other',
        "accountOwner" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Client_orgId_name_key" ON "Client"("orgId","name");

      -- Program table
      CREATE TABLE IF NOT EXISTS "Program" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL UNIQUE,
        "description" TEXT,
        "sponsor" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Program_orgId_name_key" ON "Program"("orgId","name");

      -- ProgramAssignment table
      CREATE TABLE IF NOT EXISTS "ProgramAssignment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "programId" TEXT NOT NULL REFERENCES "Program"("id"),
        "userId" TEXT NOT NULL REFERENCES "User"("id"),
        "assignedBy" TEXT,
        "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("programId","userId")
      );

      -- Invitation table
      CREATE TABLE IF NOT EXISTS "Invitation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id"),
        "tokenHash" TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "acceptedAt" TIMESTAMP(3),
        "invalidatedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Project: add clientId and programId columns
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientId" TEXT REFERENCES "Client"("id");
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "programId" TEXT REFERENCES "Program"("id");
    `);
    console.log("Admin module migration applied successfully.");

    // Seed Admin@pmAgent.dev if not exists
    const bcrypt = require("bcryptjs");
    const { randomBytes } = require("crypto");
    const hash = await bcrypt.hash("Password123!", 10);
    const id = randomBytes(12).toString("hex");
    await pool.query(`
      INSERT INTO "User" ("id","orgId","email","fullName","passwordHash","role","status","approved","mfaEnabled","createdAt","updatedAt")
      VALUES ($1, (SELECT id FROM "Organization" LIMIT 1), 'Admin@pmAgent.dev', 'Platform Admin', $2, 'admin', 'active', true, false, NOW(), NOW())
      ON CONFLICT ("email") DO UPDATE SET "role"='admin', "status"='active'
    `, [id, hash]);
    console.log("Admin@pmAgent.dev seeded/updated.");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
