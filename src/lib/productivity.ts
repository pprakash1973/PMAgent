import { prisma } from "@/lib/db";

// Estimated PM hours saved per artifact generated, by type.
// Basis: time a PM would spend manually researching, drafting, and formatting
// the equivalent PMBOK-aligned artifact from scratch.
export const HOURS_SAVED_PER_ARTIFACT: Record<string, number> = {
  initiation_deck: 6,
  project_charter: 5,
  business_case: 4,
  stakeholder_register: 2.5,
  assumption_log: 1.5,
  benefits_register: 2,
  scope_statement: 3,
  wbs: 5,
  milestone_plan: 3,
  resource_plan: 3,
  cost_plan: 5,
  raid_register: 3,
  risk_register: 4,
  communication_plan: 2,
  raci_matrix: 3,
  quality_plan: 2.5,
  action_log: 1,
  issue_register: 1.5,
  decision_log: 1,
  weekly_status: 3,
  monthly_status: 4,
  change_log: 2,
  lessons_learned: 3,
  closure_report: 4,
  executive_dashboard: 4,
  dashboard: 4,
};
const DEFAULT_HOURS_SAVED = 2;

export const BLENDED_PM_HOURLY_RATE = 85; // USD, blended PMO rate for ROI framing

export function hoursSavedFor(artifactType: string): number {
  return HOURS_SAVED_PER_ARTIFACT[artifactType] ?? DEFAULT_HOURS_SAVED;
}

export interface ProductivityStats {
  artifactsGenerated: number;
  hoursSaved: number;
  dollarsSaved: number;
  byType: { type: string; count: number; hoursSaved: number }[];
}

export function computeProductivityStats(
  artifactCounts: { artifactType: string; _count: { _all: number } }[]
): ProductivityStats {
  let artifactsGenerated = 0;
  let hoursSaved = 0;
  const byType = artifactCounts.map((row) => {
    const count = row._count._all;
    const hrs = hoursSavedFor(row.artifactType) * count;
    artifactsGenerated += count;
    hoursSaved += hrs;
    return { type: row.artifactType, count, hoursSaved: hrs };
  }).sort((a, b) => b.hoursSaved - a.hoursSaved);

  return {
    artifactsGenerated,
    hoursSaved: Math.round(hoursSaved * 10) / 10,
    dollarsSaved: Math.round(hoursSaved * BLENDED_PM_HOURLY_RATE),
    byType,
  };
}

export async function getProductivityStatsForUser(user: { orgId: string; role: string; id: string }): Promise<ProductivityStats & { projectCount: number }> {
  const projects = await prisma.project.findMany({
    where: {
      orgId: user.orgId,
      deletedAt: null,
      ...(user.role === "pm" ? { pmOwnerId: user.id } : {}),
    },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  const grouped = await prisma.artifact.groupBy({
    by: ["artifactType"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });

  return { ...computeProductivityStats(grouped as any), projectCount: projectIds.length };
}
