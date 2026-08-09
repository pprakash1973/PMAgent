import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runAdvisoryEngine, applyBudget, type ProjectState } from "@/lib/advisory-engine";
import { randomUUID } from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "all";
  const includeBacklog = url.searchParams.get("include_backlog") === "1";

  // Load project state
  const [project, tasks, risks, issues, costEntries] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.scheduleTask.findMany({ where: { projectId: id } }),
    prisma.risk.findMany({ where: { projectId: id } }),
    prisma.issue.findMany({ where: { projectId: id } }),
    prisma.costEntry.findMany({ where: { projectId: id } }),
  ]);

  // Actual data counts per tab (separate from advisory counts)
  const [reqCount, assumptionRows, dependencyRows, resourceRows] = await Promise.all([
    prisma.requirement.count({ where: { projectId: id, isActive: true } }),
    (prisma as any).$queryRaw`SELECT COUNT(*)::int AS n FROM assumptions WHERE "projectId" = ${id}`.catch(() => [{ n: 0 }]),
    (prisma as any).$queryRaw`SELECT COUNT(*)::int AS n FROM dependencies WHERE "projectId" = ${id}`.catch(() => [{ n: 0 }]),
    (prisma as any).resource?.count({ where: { projectId: id } }).catch(() => 0) ?? Promise.resolve(0),
  ]);
  const dataCounts: Record<string, number> = {
    scope:     reqCount,
    risk:      risks.length,
    issues:    issues.length,
    cost:      costEntries.length,
    schedule:  tasks.length,
    registers: ((assumptionRows as any[])[0]?.n ?? 0) + ((dependencyRows as any[])[0]?.n ?? 0),
    resources: typeof resourceRows === "number" ? resourceRows : 0,
  };

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const state: ProjectState = {
    projectId: id,
    projectName: project.name,
    tasks,
    risks,
    issues,
    costEntries,
    budget: project.budget,
    currentPhase: project.currentPhase,
  };

  // Run the engine
  const candidates = runAdvisoryEngine(state);

  // Get existing open advisories to count against budget
  const existing = await (prisma as any).advisory.findMany({
    where: { projectId: id, state: "proposed" },
  });
  const existingByTab: Record<string, number> = {};
  for (const a of existing) {
    existingByTab[a.tab] = (existingByTab[a.tab] ?? 0) + 1;
  }

  // Only admit new candidates within budget
  const admitted = applyBudget(candidates, existingByTab);

  // Upsert new advisories (skip ones already existing or dismissed/accepted)
  const existingKeys = new Set(existing.map((a: any) => `${a.ruleId}::${a.objectId ?? ""}`));
  const dismissedKeys = new Set<string>();
  const dismissed = await (prisma as any).advisory.findMany({
    where: { projectId: id, state: { in: ["dismissed", "accepted", "resolved"] } },
  });
  for (const a of dismissed) dismissedKeys.add(`${a.ruleId}::${a.objectId ?? ""}`);

  for (const c of admitted) {
    const key = `${c.ruleId}::${c.objectId ?? ""}`;
    if (existingKeys.has(key) || dismissedKeys.has(key)) continue;
    try {
      await (prisma as any).advisory.create({
        data: {
          id: randomUUID(),
          projectId: id,
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
          mode: "m1",
        },
      });
    } catch {
      // unique constraint — already exists, skip
    }
  }

  // Fetch all proposed advisories for response
  const where: any = {
    projectId: id,
    state: includeBacklog ? { not: "resolved" } : "proposed",
  };
  if (tab !== "all") where.tab = tab;

  const advisories = await (prisma as any).advisory.findMany({
    where,
    orderBy: [{ severity: "asc" }, { rankScore: "desc" }],
  });

  // Parse draftPayload back to object
  const hydrated = advisories.map((a: any) => ({
    ...a,
    draftPayload: a.draftPayload ? (() => { try { return JSON.parse(a.draftPayload); } catch { return null; } })() : null,
  }));

  // Badge counts per tab
  const allOpen = await (prisma as any).advisory.findMany({
    where: { projectId: id, state: "proposed" },
    select: { tab: true, severity: true },
  });
  const badges: Record<string, number> = {};
  for (const a of allOpen) {
    badges[a.tab] = (badges[a.tab] ?? 0) + 1;
  }

  return NextResponse.json({ advisories: hydrated, badges, dataCounts });
}
