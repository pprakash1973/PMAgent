import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
console.log("Connecting to:", url);
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

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

  await prisma.user.upsert({
    where: { email: "dm@pmAgent.dev" },
    create: { orgId: org.id, email: "dm@pmAgent.dev", fullName: "Bob Delivery", passwordHash: hash, role: "delivery_manager" },
    update: {},
  });

  await prisma.user.upsert({
    where: { email: "head@pmAgent.dev" },
    create: { orgId: org.id, email: "head@pmAgent.dev", fullName: "Carol Head", passwordHash: hash, role: "delivery_head" },
    update: {},
  });

  await prisma.user.upsert({
    where: { email: "admin@pmAgent.dev" },
    create: { orgId: org.id, email: "admin@pmAgent.dev", fullName: "Dave Admin", passwordHash: hash, role: "admin" },
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
  console.log("  pm@pmAgent.dev / dm@pmAgent.dev / head@pmAgent.dev / admin@pmAgent.dev");
  console.log("  Password: Password123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
