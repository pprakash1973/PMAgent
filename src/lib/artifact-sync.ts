/**
 * Syncs artifact content into live DB tables that power project tabs.
 * Called after both AI generation and manual upload.
 */
import { prisma } from "@/lib/db";

export async function syncArtifactToTables(
  projectId: string,
  artifactType: string,
  content: any
): Promise<void> {
  switch (artifactType) {

    case "resource_plan": {
      const team: any[] = content.teamDirectory ?? [];
      if (team.length === 0) return;
      await prisma.projectResource.deleteMany({ where: { projectId } });
      await prisma.projectResource.createMany({
        data: team.map((m: any) => ({
          projectId,
          name: String(m.name ?? "Unknown"),
          role: String(m.role ?? "Team Member"),
          email: m.email ? String(m.email) : null,
          allocationPct: Number(m.allocationPercent ?? m.allocationPct ?? 100),
          startDate: m.startDate ? new Date(m.startDate) : null,
          endDate: m.endDate ? new Date(m.endDate) : null,
          ratePerDay: m.dailyRate ? Number(m.dailyRate) : null,
          skills: Array.isArray(m.skills) ? m.skills.join(", ") : (m.skills ?? null),
          notes: m.notes ?? null,
        })),
      });
      break;
    }

    case "risk_register": {
      const risks: any[] = content.risks ?? [];
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
      const milestones: any[] = content.milestones ?? [];
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
