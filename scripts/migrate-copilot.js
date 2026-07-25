// Adds AI Copilot tables to Neon PostgreSQL (production)
// Run with: node scripts/migrate-copilot.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping copilot migration — not a postgres URL");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      -- Add copilot fields to User
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "copilotEnabled" BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assistantName" TEXT NOT NULL DEFAULT 'Copilot';

      -- AssistantConversation table
      CREATE TABLE IF NOT EXISTS "AssistantConversation" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "userId"       TEXT NOT NULL REFERENCES "User"("id"),
        "projectId"    TEXT REFERENCES "Project"("id"),
        "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status"       TEXT NOT NULL DEFAULT 'active'
      );
      CREATE INDEX IF NOT EXISTS "AssistantConversation_userId_idx" ON "AssistantConversation"("userId");
      CREATE INDEX IF NOT EXISTS "AssistantConversation_projectId_idx" ON "AssistantConversation"("projectId");

      -- AssistantMessage table
      CREATE TABLE IF NOT EXISTS "AssistantMessage" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL REFERENCES "AssistantConversation"("id") ON DELETE CASCADE,
        "role"           TEXT NOT NULL,
        "content"        TEXT NOT NULL,
        "tabContext"     TEXT,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AssistantMessage_conversationId_idx" ON "AssistantMessage"("conversationId");
    `);
    console.log("✓ Copilot migration complete");

    // Seed prakash@pmAgent.dev as PM — upsert so it works on re-runs
    const bcrypt = require("bcryptjs");
    const { randomBytes } = require("crypto");
    const hash = await bcrypt.hash("Password123!", 10);
    const id = randomBytes(12).toString("hex");
    await pool.query(`
      INSERT INTO "User" ("id","orgId","email","fullName","passwordHash","role","status","approved","mfaEnabled","createdAt","updatedAt")
      VALUES ($1, 'seed-org-1', 'prakash@pmAgent.dev', 'Prakash PM', $2, 'pm', 'active', true, false, NOW(), NOW())
      ON CONFLICT ("email") DO UPDATE SET "role"='pm', "status"='active', "passwordHash"=$2
    `, [id, hash]);
    console.log("✓ prakash@pmAgent.dev seeded/updated");
  } catch (err) {
    console.error("Copilot migration error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
