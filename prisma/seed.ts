import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
console.log("Connecting to:", url.startsWith("postgresql") ? url.split("@")[1] : url);

function createClient() {
  if (url.startsWith("file:")) {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }
  const { Pool } = require("pg");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}
const prisma = createClient();

/**
 * Migrate DH users whose old ClientAssignment rows were moved into
 * account_assignments by the CR-01 migration. DH must live in
 * cluster_assignments instead.  Safe to run multiple times.
 */
async function fixDhAssignments() {
  const dhUsers = await prisma.user.findMany({ where: { role: "dh" } });
  if (dhUsers.length === 0) return;

  for (const user of dhUsers) {
    const accountAssignments = await (prisma as any).accountAssignment.findMany({
      where: { userId: user.id },
      include: { account: { select: { id: true, clusterId: true } } },
    });
    if (accountAssignments.length === 0) continue;

    const clusterIds = [...new Set(
      accountAssignments.map((a: any) => a.account?.clusterId).filter(Boolean) as string[]
    )];

    for (const clusterId of clusterIds) {
      await (prisma as any).clusterAssignment.upsert({
        where: { clusterId_userId: { clusterId, userId: user.id } },
        create: { id: randomUUID(), clusterId, userId: user.id, isPrimary: false, assignedBy: "migration-fix" },
        update: {},
      }).catch(() => {});
    }

    await (prisma as any).accountAssignment.deleteMany({ where: { userId: user.id } });
    console.log(`  Fixed DH "${user.fullName}": moved to ${clusterIds.length} cluster assignment(s)`);
  }

  // Auto-promote primary DH per cluster if none set
  const clusters = await (prisma as any).cluster.findMany({
    where: { deletedAt: null },
    include: { clusterAssignments: { orderBy: { assignedAt: "asc" } } },
  });
  for (const cluster of clusters) {
    if (!cluster.clusterAssignments.length) continue;
    const hasPrimary = cluster.clusterAssignments.some((a: any) => a.isPrimary);
    if (!hasPrimary) {
      const first = cluster.clusterAssignments[0];
      await (prisma as any).clusterAssignment.update({
        where: { clusterId_userId: { clusterId: cluster.id, userId: first.userId } },
        data: { isPrimary: true },
      });
      await (prisma as any).cluster.update({
        where: { id: cluster.id },
        data: { primaryDhId: first.userId },
      });
    }
  }
}

async function main() {
  console.log("Seeding database...");

  // Fix DH assignments before seeding seed data
  await fixDhAssignments();

  const org = await prisma.organization.upsert({
    where: { id: "seed-org-1" },
    create: { id: "seed-org-1", name: "Acme Delivery Co.", tier: "enterprise" },
    update: {},
  });

  const hash = await bcrypt.hash("Password123!", 10);

  const pm = await prisma.user.upsert({
    where: { email: "pm@pmAgent.dev" },
    create: { orgId: org.id, email: "pm@pmAgent.dev", fullName: "Alice PM", passwordHash: hash, role: "pm" },
    update: {},
  });

  const dm = await prisma.user.upsert({
    where: { email: "dm@pmAgent.dev" },
    create: { orgId: org.id, email: "dm@pmAgent.dev", fullName: "Bob DM", passwordHash: hash, role: "dm" },
    update: { role: "dm", fullName: "Bob DM" },
  });

  const dh = await prisma.user.upsert({
    where: { email: "head@pmAgent.dev" },
    create: { orgId: org.id, email: "head@pmAgent.dev", fullName: "Carol Head", passwordHash: hash, role: "dh" },
    update: { role: "dh" },
  });

  await prisma.user.upsert({
    where: { email: "admin@pmAgent.dev" },
    create: { orgId: org.id, email: "admin@pmAgent.dev", fullName: "Dave Admin", passwordHash: hash, role: "admin", status: "active" },
    update: { role: "admin", status: "active" },
  });

  // Canonical admin account as specified in PRD
  await prisma.user.upsert({
    where: { email: "Admin@pmAgent.dev" },
    create: { orgId: org.id, email: "Admin@pmAgent.dev", fullName: "Platform Admin", passwordHash: hash, role: "admin", status: "active" },
    update: { role: "admin", status: "active" },
  });

  // ── Cluster + Account hierarchy (CR-01) ───────────────────────────────────
  const cluster = await (prisma as any).cluster.upsert({
    where: { code: "ANZ" },
    create: { orgId: org.id, name: "Australia & New Zealand", code: "ANZ", type: "geography", status: "active" },
    update: {},
  });

  const account = await (prisma as any).orgAccount.upsert({
    where: { code: "MEGA-RETAIL" },
    create: {
      orgId: org.id, clusterId: cluster.id,
      name: "Mega Retail Corp", code: "MEGA-RETAIL",
      industry: "Retail", region: "ANZ", status: "active",
    },
    update: {},
  });

  // ClusterAssignment: Carol Head is Primary DH for ANZ
  await (prisma as any).clusterAssignment.upsert({
    where: { clusterId_userId: { clusterId: cluster.id, userId: dh.id } },
    create: { clusterId: cluster.id, userId: dh.id, isPrimary: true, assignedBy: "seed" },
    update: { isPrimary: true },
  });
  await (prisma as any).cluster.update({
    where: { id: cluster.id },
    data: { primaryDhId: dh.id },
  });

  // AccountAssignment: Bob DM is Primary DM for Mega Retail Corp
  await (prisma as any).accountAssignment.upsert({
    where: { accountId_userId: { accountId: account.id, userId: dm.id } },
    create: { accountId: account.id, userId: dm.id, isPrimary: true, assignedBy: "seed" },
    update: { isPrimary: true },
  });
  await (prisma as any).orgAccount.update({
    where: { id: account.id },
    data: { primaryDmId: dm.id },
  });

  // PGM user and program assignment
  const pgm = await prisma.user.upsert({
    where: { email: "PGM@pmAgent.dev" },
    create: { orgId: org.id, email: "PGM@pmAgent.dev", fullName: "Eve PGM", passwordHash: hash, role: "pgm" },
    update: { role: "pgm", fullName: "Eve PGM" },
  });

  const program = await prisma.program.upsert({
    where: { code: "PRG-DIGITAL-RETAIL" },
    create: {
      orgId: org.id,
      accountId: account.id,
      name: "Digital Retail Transformation",
      code: "PRG-DIGITAL-RETAIL",
      description: "Mega Retail Corp digital transformation programme",
      status: "active",
      createdBy: pgm.id,
    },
    update: {},
  });

  await prisma.programAssignment.upsert({
    where: { programId_userId: { programId: program.id, userId: pgm.id } },
    create: { programId: program.id, userId: pgm.id, assignedBy: "seed" },
    update: {},
  });

  const bu = await prisma.businessUnit.upsert({
    where: { id: "seed-bu-1" },
    create: { id: "seed-bu-1", orgId: org.id, name: "Digital Transformation" },
    update: {},
  });

  const project = await prisma.project.upsert({
    where: { orgId_code: { orgId: org.id, code: "ERP-RETAIL-001" } },
    create: {
      orgId: org.id,
      buId: bu.id,
      clusterId: cluster.id,
      accountId: account.id,
      programId: program.id,
      pmOwnerId: pm.id,
      name: "ERP Implementation — Retail",
      code: "ERP-RETAIL-001",
      customer: "Mega Retail Corp",
      projectType: "fixed_price",
      methodology: "waterfall",
      engagementMode: "detailed",
      industry: "Retail",
      projectSize: "large",
      budget: 2000000,
      currency: "USD",
      teamSize: 25,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      status: "execution",
      healthStatus: "amber",
      description: "Full SAP ERP implementation replacing legacy systems across 12 retail stores and HQ. Includes finance, inventory, and HR modules.",
    },
    update: {},
  });

  for (const m of [
    { name: "Requirements Sign-off", dueDate: new Date("2026-02-28"), status: "achieved" },
    { name: "Design Approval", dueDate: new Date("2026-04-30"), status: "achieved" },
    { name: "UAT Start", dueDate: new Date("2026-09-01"), status: "pending" },
    { name: "Go-Live", dueDate: new Date("2026-12-01"), status: "pending" },
  ]) {
    await prisma.milestone.create({ data: { projectId: project.id, ...m } }).catch(() => {});
  }

  for (const r of [
    { riskId: "R-001", description: "Key SAP consultant departure risk — single point of failure on integration module", probability: "medium", impact: "high", owner: "Alice PM", mitigation: "Cross-train backup consultant and document all integration specs" },
    { riskId: "R-002", description: "Data migration from legacy system may exceed 4-week estimate due to data quality issues", probability: "high", impact: "medium", owner: "Alice PM", mitigation: "Start data profiling sprint immediately; flag to client" },
    { riskId: "R-003", description: "Client stakeholder availability for UAT sessions is at risk during holiday period", probability: "medium", impact: "medium", owner: "Alice PM" },
  ]) {
    await prisma.risk.create({ data: { projectId: project.id, ...r } }).catch(() => {});
  }

  await prisma.issue.create({
    data: { projectId: project.id, issueId: "I-001", description: "Legacy API not returning complete product catalog — 1,200 SKUs missing", severity: "high", status: "in_progress", owner: "Alice PM" },
  }).catch(() => {});

  const { ARTIFACT_CATALOG, DEFAULT_DETAILED_ARTIFACTS } = await import("../src/lib/utils.js");
  for (const entry of ARTIFACT_CATALOG) {
    await prisma.artifactSelection.upsert({
      where: { projectId_artifactType: { projectId: project.id, artifactType: entry.type } },
      create: {
        projectId: project.id,
        artifactType: entry.type,
        selectionStatus: DEFAULT_DETAILED_ARTIFACTS.includes(entry.type) ? "active" : "available",
      },
      update: {},
    });
  }

  console.log("\n✅ Seed complete!");
  console.log("  pm@pmAgent.dev / dm@pmAgent.dev / PGM@pmAgent.dev / head@pmAgent.dev / admin@pmAgent.dev");
  console.log("  Password: Password123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
