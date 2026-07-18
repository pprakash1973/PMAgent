/**
 * Syncs artifact content into live DB tables that power project tabs.
 * Called after both AI generation and manual upload.
 */
import { prisma } from "@/lib/db";

/** Parse a number from any value — strips %, $, commas, spaces before parsing. */
function parseNum(val: any, fallback = 0): number {
  if (val == null) return fallback;
  if (typeof val === "number") return isNaN(val) ? fallback : val;
  const cleaned = String(val).replace(/[%$,\s]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? fallback : n;
}

/** Parse a nullable number (returns null when absent/invalid). */
function parseNumOrNull(val: any): number | null {
  if (val == null) return null;
  const n = parseNum(val, NaN);
  return isNaN(n) ? null : n;
}

/**
 * Find a team/resource array in content regardless of where the AI put it.
 * Tries known top-level keys first, then scans one level deep for any array
 * whose items have both a 'name' and a 'role' field.
 */
function extractTeamArray(content: any): any[] {
  const direct =
    content.teamDirectory ??
    content.team ??
    content.resources ??
    content.members ??
    content.teamMembers ??
    content.roster ??
    null;
  if (Array.isArray(direct) && direct.length > 0) return direct;

  // Scan one level deep for nested arrays that look like team member lists
  for (const val of Object.values(content)) {
    if (!val || typeof val !== "object") continue;
    // Check if val itself is an object with an array key
    for (const nested of Object.values(val as object)) {
      if (Array.isArray(nested) && nested.length > 0) {
        const first = nested[0];
        if (first && typeof first === "object" && ("name" in first || "role" in first)) {
          return nested as any[];
        }
      }
    }
    // val might be the array itself
    if (Array.isArray(val) && val.length > 0) {
      const first = (val as any[])[0];
      if (first && typeof first === "object" && ("name" in first || "role" in first)) {
        return val as any[];
      }
    }
  }
  return [];
}

export async function syncArtifactToTables(
  projectId: string,
  artifactType: string,
  content: any
): Promise<void> {
  switch (artifactType) {

    case "resource_plan": {
      const team = extractTeamArray(content);
      if (team.length === 0) return;
      await prisma.projectResource.deleteMany({ where: { projectId } });
      await prisma.projectResource.createMany({
        data: team.map((m: any) => ({
          projectId,
          name: String(m.name ?? m.resourceName ?? m.fullName ?? "Unknown"),
          role: String(m.role ?? m.title ?? m.position ?? m.jobTitle ?? "Team Member"),
          email: m.email ? String(m.email) : null,
          allocationPct: Math.round(parseNum(m.allocationPercent ?? m.allocationPct ?? m.allocation, 100)),
          startDate: m.startDate ? new Date(m.startDate) : null,
          endDate: m.endDate ? new Date(m.endDate) : null,
          ratePerDay: parseNumOrNull(m.dailyRate ?? m.ratePerDay ?? m.rate ?? m.dayRate),
          skills: Array.isArray(m.skills) ? m.skills.join(", ") : (m.skills ? String(m.skills) : null),
          notes: m.notes ?? m.comments ?? m.remarks ?? null,
        })),
      });
      break;
    }

    case "risk_register": {
      const risks: any[] = (content.risks ?? content.riskRegister ?? content.riskItems ?? []) as any[];
      if (risks.length === 0) return;
      await prisma.risk.deleteMany({ where: { projectId } });
      await prisma.risk.createMany({
        data: risks.map((r: any) => ({
          projectId,
          riskId: r.id ?? null,
          description: String(r.statement ?? r.description ?? r.title ?? ""),
          category: r.category ?? null,
          probability: normaliseProbImpact(r.probability),
          impact: normaliseProbImpact(r.impact),
          status: normaliseStatus(r.status),
          owner: r.owner ?? null,
          mitigation: Array.isArray(r.responseActions)
            ? r.responseActions.join("; ")
            : (r.mitigation ?? r.strategy ?? null),
          dueDate: r.dueDate ? new Date(r.dueDate) : null,
        })),
      });
      break;
    }

    case "raid_register": {
      // Sync risks
      const risks: any[] = content.risks ?? [];
      if (risks.length > 0) {
        await prisma.risk.deleteMany({ where: { projectId } });
        await prisma.risk.createMany({
          data: risks.map((r: any) => ({
            projectId,
            riskId: r.id ?? null,
            description: String(r.description ?? r.statement ?? r.title ?? ""),
            category: r.category ?? null,
            probability: normaliseProbImpact(r.probability),
            impact: normaliseProbImpact(r.impact),
            status: normaliseStatus(r.status),
            owner: r.owner ?? null,
            mitigation: r.mitigation ?? r.responseActions ?? null,
            dueDate: r.dueDate ? new Date(r.dueDate) : null,
          })),
        });
      }
      // Sync issues
      const issues: any[] = content.issues ?? [];
      if (issues.length > 0) {
        await prisma.issue.deleteMany({ where: { projectId } });
        await prisma.issue.createMany({
          data: issues.map((iss: any) => ({
            projectId,
            issueId: iss.id ?? null,
            description: String(iss.description ?? iss.title ?? ""),
            severity: normaliseSeverity(iss.severity),
            status: normaliseStatus(iss.status),
            owner: iss.owner ?? null,
            resolution: iss.resolutionPlan ?? iss.resolution ?? null,
            dueDate: iss.targetResolutionDate ? new Date(iss.targetResolutionDate) : null,
          })),
        });
      }
      break;
    }

    case "milestone_plan": {
      const milestones: any[] = (content.milestones ?? content.milestoneList ?? content.milestoneRegister ?? []) as any[];
      if (milestones.length === 0) return;
      await prisma.milestone.deleteMany({ where: { projectId } });
      await prisma.milestone.createMany({
        data: milestones.map((m: any) => ({
          projectId,
          name: String(m.name ?? "Milestone"),
          dueDate: new Date(m.plannedDate ?? m.forecastDate ?? m.targetDate ?? new Date()),
          status: normaliseMilestoneStatus(m.status),
          notes: m.description ?? m.notes ?? null,
        })),
      });
      break;
    }
  }
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

function normaliseProbImpact(val: any): string {
  if (!val) return "medium";
  const v = String(val).toLowerCase();
  if (v.includes("very high") || v.includes("critical")) return "very_high";
  if (v.includes("high")) return "high";
  if (v.includes("very low")) return "very_low";
  if (v.includes("low")) return "low";
  return "medium";
}

function normaliseSeverity(val: any): string {
  if (!val) return "medium";
  const v = String(val).toLowerCase();
  if (v.includes("critical")) return "critical";
  if (v.includes("high")) return "high";
  if (v.includes("low")) return "low";
  return "medium";
}

function normaliseStatus(val: any): string {
  if (!val) return "open";
  const v = String(val).toLowerCase();
  if (v.includes("close") || v.includes("resolved") || v.includes("complete")) return "closed";
  if (v.includes("progress") || v.includes("active")) return "in_progress";
  return "open";
}

function normaliseMilestoneStatus(val: any): string {
  if (!val) return "pending";
  const v = String(val).toLowerCase();
  if (v.includes("complete") || v.includes("done")) return "complete";
  if (v.includes("risk") || v.includes("slipped") || v.includes("delayed")) return "at_risk";
  return "pending";
}
