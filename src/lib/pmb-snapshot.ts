/**
 * BL-P3: PMB Snapshot helpers.
 * Defines dimension mapping and provides the core createSnapshot function.
 */
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

function newId(): string {
  return randomBytes(12).toString("hex");
}

// Map each artifact type to its PMB dimension
export const ARTIFACT_DIMENSION: Record<string, "scope" | "schedule" | "cost" | "context"> = {
  scope_statement: "scope",
  wbs: "scope",
  traceability_matrix: "scope",
  requirements_traceability_matrix: "scope",
  project_charter: "scope",
  milestone_plan: "schedule",
  work_plan: "schedule",
  schedule: "schedule",
  budget_estimate: "cost",
  cost_plan: "cost",
  evm_analysis: "cost",
  resource_plan: "cost",
  risk_register: "context",
  stakeholder_register: "context",
  change_log: "context",
  raid_register: "context",
  communication_plan: "context",
};

// Required artifact types for a baseline to be "ready"
export const REQUIRED_BASELINE_TYPES: string[] = [
  "scope_statement",
  "milestone_plan",
  "cost_plan",
];

export type ReadinessResult = {
  ready: boolean;
  requiredMet: number;
  requiredTotal: number;
  checks: {
    artifactType: string;
    dimension: string;
    isRequired: boolean;
    hasApproved: boolean;
    latestVersion: { id: string; versionNumber: number; approvalStatus: string } | null;
  }[];
};

export async function checkBaselineReadiness(projectId: string): Promise<ReadinessResult> {
  const db = prisma as any;

  // Get all artifact versions with their approval status for this project
  const artifacts = await db.artifact.findMany({
    where: { projectId },
    select: {
      artifactType: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true, approvalStatus: true },
      },
    },
  });

  const APPROVED_STATUSES = new Set(["pm_confirmed", "gate_approved"]);

  const checks = Object.entries(ARTIFACT_DIMENSION).map(([type, dimension]) => {
    const artifact = artifacts.find((a: any) => a.artifactType === type);
    const latestVersion = (artifact?.versions?.[0]) ?? null;
    const hasApproved = latestVersion
      ? APPROVED_STATUSES.has(latestVersion.approvalStatus)
      : false;

    return {
      artifactType: type,
      dimension,
      isRequired: REQUIRED_BASELINE_TYPES.includes(type),
      hasApproved,
      latestVersion: latestVersion
        ? { id: latestVersion.id, versionNumber: latestVersion.versionNumber, approvalStatus: latestVersion.approvalStatus }
        : null,
    };
  });

  const requiredChecks = checks.filter((c) => c.isRequired);
  const requiredMet = requiredChecks.filter((c) => c.hasApproved).length;

  return {
    ready: requiredMet === requiredChecks.length,
    requiredMet,
    requiredTotal: requiredChecks.length,
    checks,
  };
}

export async function createSnapshot(
  projectId: string,
  label: string,
  trigger: "gate_approved" | "ad_hoc" | "auto_eom",
  createdById: string | null,
  notes?: string
): Promise<{ snapshot: any; memberCount: number }> {
  const db = prisma as any;

  // Determine next snapshot number
  const last = await db.pmbSnapshot.findFirst({
    where: { projectId },
    orderBy: { snapshotNumber: "desc" },
    select: { snapshotNumber: true },
  });
  const snapshotNumber = (last?.snapshotNumber ?? 0) + 1;

  // Collect all current artifact versions for this project
  const artifacts = await db.artifact.findMany({
    where: { projectId },
    select: {
      artifactType: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const members = artifacts
    .filter((a: any) => a.versions.length > 0)
    .map((a: any) => ({
      id: newId(),
      snapshotId: "", // filled after create
      artifactVersionId: a.versions[0].id,
      artifactType: a.artifactType,
      dimension: ARTIFACT_DIMENSION[a.artifactType] ?? "context",
      isRequired: REQUIRED_BASELINE_TYPES.includes(a.artifactType),
      createdAt: new Date(),
    }));

  // Clear isCurrent on prior snapshots, create new one
  const snapshotId = newId();
  await db.pmbSnapshot.updateMany({ where: { projectId, isCurrent: true }, data: { isCurrent: false } });

  const snapshot = await db.pmbSnapshot.create({
    data: {
      id: snapshotId,
      projectId,
      snapshotNumber,
      label,
      trigger,
      isCurrent: true,
      notes: notes ?? null,
      createdById,
      baselinedAt: new Date(),
      createdAt: new Date(),
    },
  });

  if (members.length > 0) {
    await db.pmbSnapshotMember.createMany({
      data: members.map((m: any) => ({ ...m, snapshotId })),
    });
  }

  return { snapshot, memberCount: members.length };
}
