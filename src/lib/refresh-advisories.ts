/**
 * M2 event trigger — call fire-and-forget after any risk/issue/task mutation.
 * Re-runs the advisory engine and upserts new findings within budget.
 */
import { prisma } from "@/lib/db";
import { runAdvisoryEngine, applyBudget, type ProjectState } from "@/lib/advisory-engine";
import { randomUUID } from "crypto";

export async function refreshAdvisories(projectId: string): Promise<void> {
  const [project, tasks, risks, issues, costEntries] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.scheduleTask.findMany({ where: { projectId } }),
    prisma.risk.findMany({ where: { projectId } }),
    prisma.issue.findMany({ where: { projectId } }),
    prisma.costEntry.findMany({ where: { projectId } }),
  ]);
  if (!project) return;

  const state: ProjectState = {
    projectId,
    projectName: project.name,
    tasks, risks, issues, costEntries,
    budget: project.budget,
    currentPhase: project.currentPhase,
  };

  const candidates = runAdvisoryEngine(state);

  const existing = await (prisma as any).advisory.findMany({
    where: { projectId, state: "proposed" },
  });
  const existingByTab: Record<string, number> = {};
  for (const a of existing) existingByTab[a.tab] = (existingByTab[a.tab] ?? 0) + 1;

  const admitted = applyBudget(candidates, existingByTab);

  const existingKeys = new Set(existing.map((a: any) => `${a.ruleId}::${a.objectId ?? ""}`));
  const dismissed = await (prisma as any).advisory.findMany({
    where: { projectId, state: { in: ["dismissed", "accepted", "resolved"] } },
    select: { ruleId: true, objectId: true },
  });
  const dismissedKeys = new Set(dismissed.map((a: any) => `${a.ruleId}::${a.objectId ?? ""}`));

  for (const c of admitted) {
    const key = `${c.ruleId}::${c.objectId ?? ""}`;
    if (existingKeys.has(key) || dismissedKeys.has(key)) continue;
    try {
      await (prisma as any).advisory.create({
        data: {
          id: randomUUID(),
          projectId,
          ruleId: c.ruleId,
          pack: c.pack,
          class: c.class,
          severity: c.severity,
          provenance: c.provenance,
          tab: c.tab,
          objectType: c.objectType ?? null,
          objectId: c.objectId ?? null,
          statement: c.statement,
          evidenceSummary: c.evidenceSummary,
          draftPayload: c.draftPayload ? JSON.stringify(c.draftPayload) : null,
          state: "proposed",
          rankScore: c.rankScore,
          mode: "m2",
        },
      });
    } catch { /* unique constraint — already exists */ }
  }
}
