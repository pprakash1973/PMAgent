import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Organization
  const org = await prisma.organization.upsert({
    where: { id: "seed-org-1" },
    create: { id: "seed-org-1", name: "Acme Delivery Co.", tier: "enterprise" },
    update: {},
  });

  // Users
  const hash = await bcrypt.hash("Password123!", 12);

  const pm = await prisma.user.upsert({
    where: { email: "pm@pmAgent.dev" },
    create: { orgId: org.id, email: "pm@pmAgent.dev", fullName: "Alice PM", passwordHash: hash, role: "pm" },
    update: {},
  });

  const dm = await prisma.user.upsert({
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

  // Sample project
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

  // Milestones
  await prisma.milestone.createMany({
    data: [
      { projectId: project.id, name: "Requirements Sign-off", dueDate: new Date("2026-02-28"), status: "achieved" },
      { projectId: project.id, name: "Design Approval", dueDate: new Date("2026-04-30"), status: "achieved" },
      { projectId: project.id, name: "UAT Start", dueDate: new Date("2026-09-01"), status: "pending" },
      { projectId: project.id, name: "Go-Live", dueDate: new Date("2026-12-01"), status: "pending" },
    ],
    skipDuplicates: true,
  });

  // Risks
  await prisma.risk.createMany({
    data: [
      { projectId: project.id, riskId: "R-001", description: "Key SAP consultant departure risk — single point of failure on integration module", probability: "medium", impact: "high", status: "open", owner: "Alice PM", mitigation: "Cross-train backup consultant and document all integration specs" },
      { projectId: project.id, riskId: "R-002", description: "Data migration from legacy system may exceed 4-week estimate due to data quality issues", probability: "high", impact: "medium", status: "open", owner: "Alice PM", mitigation: "Start data profiling sprint immediately; flag to client" },
      { projectId: project.id, riskId: "R-003", description: "Client stakeholder availability for UAT sessions is at risk during holiday period", probability: "medium", impact: "medium", status: "open", owner: "Alice PM" },
    ],
    skipDuplicates: true,
  });

  // Issues
  await prisma.issue.createMany({
    data: [
      { projectId: project.id, issueId: "I-001", description: "Legacy API not returning complete product catalog — 1,200 SKUs missing", severity: "high", status: "in_progress", owner: "Alice PM" },
    ],
    skipDuplicates: true,
  });

  // Artifact selections
  const { ARTIFACT_CATALOG, DEFAULT_DETAILED_ARTIFACTS } = await import("../src/lib/utils");
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

  console.log("Seed complete!");
  console.log("\nLogin credentials:");
  console.log("  PM:             pm@pmAgent.dev / Password123!");
  console.log("  Delivery Mgr:   dm@pmAgent.dev / Password123!");
  console.log("  Delivery Head:  head@pmAgent.dev / Password123!");
  console.log("  Admin:          admin@pmAgent.dev / Password123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
