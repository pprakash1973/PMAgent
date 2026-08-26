import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runAdvisoryEngine, type ProjectState } from "@/lib/advisory-engine";
import { requireProjectAccess } from "@/lib/project-access";

// ── Interpretation bands (§12.5) ───────────────────────────────────────────────

function interpretSPI(spi: number | null): string {
  if (spi == null) return "SPI cannot be computed — no baseline or cost data.";
  if (spi >= 0.95) return `SPI ${spi.toFixed(2)} — within tolerance.`;
  if (spi >= 0.85) return `SPI ${spi.toFixed(2)} — underperforming; recoverable with intervention.`;
  return `SPI ${spi.toFixed(2)} — baseline credibility at risk; recovery plan expected.`;
}

function interpretCPI(cpi: number | null): string {
  if (cpi == null) return "CPI cannot be computed — no actual costs logged.";
  if (cpi >= 0.95) return `CPI ${cpi.toFixed(2)} — within tolerance.`;
  if (cpi >= 0.85) return `CPI ${cpi.toFixed(2)} — underperforming; intervention recommended.`;
  return `CPI ${cpi.toFixed(2)} — over budget; re-baseline or scope intervention may be needed.`;
}

function interpretTCPI(tcpi: number | null, cpi: number | null): string | null {
  if (tcpi == null || cpi == null) return null;
  const gap = tcpi - cpi;
  if (gap > 0.10) return `TCPI ${tcpi.toFixed(2)} vs CPI ${cpi.toFixed(2)}: remaining scope requires ${(gap * 100).toFixed(0)}% efficiency improvement over current performance — re-baseline may be realistic.`;
  if (gap > 0.05) return `TCPI ${tcpi.toFixed(2)} vs CPI ${cpi.toFixed(2)}: remaining work requires efficiency not yet demonstrated.`;
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id } = await params;

  const [project, tasks, risks, issues, costEntries] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.scheduleTask.findMany({ where: { projectId: id } }),
    prisma.risk.findMany({ where: { projectId: id } }),
    prisma.issue.findMany({ where: { projectId: id } }),
    prisma.costEntry.findMany({ where: { projectId: id } }),
  ]);

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // ── Position ───────────────────────────────────────────────────────────────

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.percentComplete === 100).length;
  const schedPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

  const totalAC = costEntries.reduce((s, e) => s + e.amount, 0);
  const totalBAC = tasks.reduce((s, t) => s + (t.plannedCost ?? 0), 0);
  const today = Date.now();

  let totalPV = 0;
  let totalEV = 0;
  for (const t of tasks) {
    const w = t.baselineDays ?? 0;
    if (!w || !t.baselineStart || !t.baselineFinish) continue;
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    if (isNaN(s) || isNaN(f) || f <= s) continue;
    const pct = today <= s ? 0 : today >= f ? 1 : (today - s) / (f - s);
    totalPV += w * pct;
    totalEV += t.percentComplete === 100 ? w : 0;
  }

  const spi = totalPV > 0 ? Math.round((totalEV / totalPV) * 100) / 100 : null;
  const cpi = totalAC > 0 ? Math.round((totalEV / totalAC) * 100) / 100 : null;
  const eac = cpi != null && cpi > 0 ? Math.round(totalBAC / cpi) : null;
  const tcpi = totalAC > 0 && totalBAC > 0 ? Math.round(((totalBAC - totalEV) / (totalBAC - totalAC)) * 100) / 100 : null;

  const openRisks = risks.filter(r => r.status === "open" || r.status === "in_progress").length;
  const highRisks = risks.filter(r => {
    const PI: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return (PI[r.probability] ?? 3) * (PI[r.impact] ?? 3) >= 12;
  }).length;
  const openIssues = issues.filter(i => i.status === "open" || i.status === "in_progress").length;

  const position = {
    phase: project.currentPhase,
    scheduleCompletePct: schedPct,
    totalTasks,
    completedTasks,
    spi,
    cpi,
    eac,
    tcpi,
    totalAC: Math.round(totalAC),
    totalBAC: Math.round(totalBAC),
    openRisks,
    highRisks,
    openIssues,
    asOf: new Date().toISOString(),
  };

  // ── Diagnosis ──────────────────────────────────────────────────────────────

  const diagnosisLines: string[] = [];

  diagnosisLines.push(interpretSPI(spi));
  diagnosisLines.push(interpretCPI(cpi));

  const tcpiNote = interpretTCPI(tcpi, cpi);
  if (tcpiNote) diagnosisLines.push(tcpiNote);

  const overdueCount = tasks.filter(t =>
    t.baselineFinish && new Date(t.baselineFinish).getTime() < today && t.percentComplete < 100
  ).length;
  if (overdueCount > 0) {
    diagnosisLines.push(`${overdueCount} task(s) are past their baseline finish date and not yet complete — schedule variance is accumulating.`);
  }

  if (openRisks === 0 && totalTasks > 3) {
    diagnosisLines.push("Risk register is empty while the project has active tasks — risk exposure is unregistered.");
  } else if (highRisks > 0) {
    diagnosisLines.push(`${highRisks} high-exposure risk(s) require active response — verify mitigation plans are current.`);
  }

  if (openIssues > 3) {
    diagnosisLines.push(`${openIssues} open issues indicate active delivery problems — confirm each has an owner and resolution plan.`);
  }

  if (diagnosisLines.length === 0) {
    diagnosisLines.push("No material concerns detected from available data. Continue maintaining register hygiene and cost tracking.");
  }

  // ── Run full advisory sweep ────────────────────────────────────────────────

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

  const candidates = runAdvisoryEngine(state);

  // For a Review Brief (M1), return all findings regardless of budget cap
  const findings = candidates.map(c => ({
    ruleId: c.ruleId,
    severity: c.severity,
    class: c.class,
    tab: c.tab,
    statement: c.statement,
    evidenceSummary: c.evidenceSummary,
  }));

  // ── Sequence ───────────────────────────────────────────────────────────────

  const sequence: string[] = [];
  const s1s2 = findings.filter(f => f.severity === "s1" || f.severity === "s2");

  if (s1s2.length > 0) {
    sequence.push(`Address ${s1s2.length} S1/S2 finding(s) before the next reporting cycle or gate.`);
  }
  if (openRisks === 0) {
    sequence.push("Register risks — the project cannot be governed without a live risk register.");
  }
  if (totalAC === 0 && totalTasks > 0) {
    sequence.push("Begin logging actual costs to enable EVM tracking.");
  }
  if (spi != null && spi < 0.85) {
    sequence.push("Prepare a schedule recovery position — SPI below 0.85 will be questioned at the next gate.");
  }

  const watch: string[] = [];
  if (spi != null && spi >= 0.85 && spi < 0.95) watch.push("SPI approaching the underperforming threshold — monitor next period.");
  if (highRisks > 0) watch.push(`${highRisks} high-score risk(s) — confirm triggers are defined.`);
  if (openIssues > 0) watch.push("Open issues — check none are approaching escalation threshold.");

  return NextResponse.json({
    review: {
      position,
      diagnosis: diagnosisLines,
      findings,
      sequence,
      watch,
      findingCount: findings.length,
      generatedAt: new Date().toISOString(),
    },
  });
}
