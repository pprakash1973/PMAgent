import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeEvm } from "@/lib/evm";

export const dynamic = "force-dynamic";

// ── Methodology helpers ─────────────────────────────────────────────────────────
function isAgileProject(p: { deliveryMethod?: string; methodology?: string }): boolean {
  return p.deliveryMethod === "agile_scrum" || p.methodology === "agile_scrum";
}

function methodologyKey(p: { deliveryMethod?: string; methodology?: string }): string {
  if (p.deliveryMethod === "agile_scrum" || p.methodology === "agile_scrum") return "agile_scrum";
  if (p.deliveryMethod === "hybrid" || p.methodology === "hybrid") return "hybrid";
  return "predictive";
}

// ── Agile metrics ───────────────────────────────────────────────────────────────
function computeAgileMetrics(
  sprints: Array<{ state: string; sprintNumber: number; label: string | null; committedPoints: number | null; acceptedPoints: number | null }>,
  budget: number | null,
  baselinePoints: number,
  acceptedBaselinePoints: number,
  ac: number,
) {
  const closed = sprints.filter(s => s.state === "closed");
  const active = sprints.find(s => s.state === "active") ?? null;

  const velocities = closed.map(s => s.acceptedPoints ?? 0);
  const avgVelocity = velocities.length > 0
    ? velocities.reduce((a, b) => a + b, 0) / velocities.length
    : null;

  const reliabilities = closed
    .filter(s => (s.committedPoints ?? 0) > 0)
    .map(s => Math.min(100, ((s.acceptedPoints ?? 0) / (s.committedPoints!)) * 100));
  const avgReliability = reliabilities.length > 0
    ? reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length
    : null;

  // Velocity trend: last 3 closed sprints (oldest→newest)
  const recent = closed.slice(-3).map(s => s.acceptedPoints ?? 0);
  const velTrend: "up" | "down" | null = recent.length >= 2
    ? (recent[recent.length - 1] >= recent[0] ? "up" : "down")
    : null;

  // AgileEVM CPI
  let cpi: number | null = null;
  if (budget && baselinePoints > 0) {
    const costPerPoint = budget / baselinePoints;
    const ev = acceptedBaselinePoints * costPerPoint;
    cpi = ac > 0 ? ev / ac : null;
  }

  return {
    avgVelocity,
    avgReliability,
    velTrend,
    cpi,
    activeSprint: active ? { id: active.state, label: active.label, sprintNumber: active.sprintNumber } : null,
    closedSprints: closed.length,
    totalSprints: sprints.length,
  };
}

// ── Agile band ──────────────────────────────────────────────────────────────────
function agileRagBand(
  avgVelocity: number | null,
  avgReliability: number | null,
  velTrend: "up" | "down" | null,
  cpi: number | null,
  criticalIssues: number,
  highRisks: number,
  closedSprints: number,
): "red" | "amber" | "no_data" | "green" {
  if (closedSprints === 0) return "no_data";
  if (criticalIssues > 2 || (avgReliability !== null && avgReliability < 50) || (cpi !== null && cpi < 0.75)) return "red";
  if ((avgReliability !== null && avgReliability < 75) || velTrend === "down" || highRisks >= 3 || (cpi !== null && cpi < 0.9)) return "amber";
  return "green";
}

// ── Agile attention score ───────────────────────────────────────────────────────
function computeAgileAttentionScore(m: {
  avgReliability: number | null;
  velTrend: "up" | "down" | null;
  cpi: number | null;
  openActionItems: number;
  highRisks: number;
  criticalIssues: number;
}): number {
  let totalWeight = 0;
  let weightedSum = 0;

  if (m.avgReliability !== null) {
    const reliDef = Math.min(1, Math.max(0, (100 - m.avgReliability) / 50));
    weightedSum += reliDef * 25;
    totalWeight += 25;
  }

  const velDef = m.velTrend === "down" ? 0.6 : 0;
  weightedSum += velDef * 20;
  totalWeight += 20;

  if (m.cpi !== null) {
    const costDef = Math.min(1, Math.max(0, (1 - m.cpi) / 0.4));
    weightedSum += costDef * 15;
    totalWeight += 15;
  }

  const unaddressed = Math.min(1, m.openActionItems / 4);
  weightedSum += unaddressed * 10;
  totalWeight += 10;

  const riskProxy = Math.min(1, (m.highRisks + m.criticalIssues) / 5);
  weightedSum += riskProxy * 30;
  totalWeight += 30;

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
}

// ── Agile why-diagnosis ─────────────────────────────────────────────────────────
function agileWhyDiagnosis(m: {
  band: string;
  avgVelocity: number | null;
  avgReliability: number | null;
  velTrend: "up" | "down" | null;
  cpi: number | null;
  closedSprints: number;
  highRisks: number;
  criticalIssues: number;
  openActionItems: number;
}): string {
  if (m.band === "no_data") return "No closed sprints yet — velocity and commitment data unavailable.";
  const flags: string[] = [];
  if (m.avgReliability !== null && m.avgReliability < 60)
    flags.push(`commitment reliability at ${Math.round(m.avgReliability)}% — team consistently over-commits`);
  if (m.velTrend === "down" && m.avgVelocity !== null)
    flags.push(`velocity declining over last 3 sprints (avg ${m.avgVelocity.toFixed(0)} pts)`);
  if (m.cpi !== null && m.cpi < 0.85)
    flags.push(`cost performance adverse (AgileEVM CPI ${m.cpi.toFixed(2)})`);
  if (m.criticalIssues > 0)
    flags.push(`${m.criticalIssues} critical issue${m.criticalIssues > 1 ? "s" : ""} open`);
  if (m.highRisks >= 3)
    flags.push(`${m.highRisks} high risks unmitigated`);
  if (m.avgReliability !== null && m.avgReliability >= 60 && m.avgReliability < 80)
    flags.push(`commitment reliability at ${Math.round(m.avgReliability)}% — some carry-over`);
  if (m.openActionItems > 3)
    flags.push(`${m.openActionItems} PM actions unresolved`);
  if (flags.length === 0)
    return m.band === "green"
      ? "Velocity stable, commitment on track — no exceptions this sprint."
      : "Watch: marginal agile signals. Review velocity trend.";
  return flags.slice(0, 3).join("; ") + ".";
}

// ── Waterfall attention score ───────────────────────────────────────────────────
function computeAttentionScore(p: {
  healthStatus: string;
  spi: number | null;
  cpi: number | null;
  compositeScore: number | null;
  openActionItems: number;
  highRisks: number;
  criticalIssues: number;
}): number {
  const composite = p.compositeScore ?? (p.healthStatus === "red" ? 40 : p.healthStatus === "amber" ? 65 : 85);
  let totalWeight = 0;
  let weightedSum = 0;
  const healthDeficit = (100 - composite) / 100;
  weightedSum += healthDeficit * 30;
  totalWeight += 30;
  if (p.spi !== null) {
    weightedSum += Math.min(1, Math.max(0, (1 - p.spi) / 0.4)) * 15;
    totalWeight += 15;
  }
  if (p.cpi !== null) {
    weightedSum += Math.min(1, Math.max(0, (1 - p.cpi) / 0.4)) * 15;
    totalWeight += 15;
  }
  weightedSum += Math.min(1, p.openActionItems / 4) * 10;
  totalWeight += 10;
  weightedSum += Math.min(1, (p.highRisks + p.criticalIssues) / 5) * 30;
  totalWeight += 30;
  return Math.round((weightedSum / totalWeight) * 100);
}

// ── Waterfall why-diagnosis ─────────────────────────────────────────────────────
function whyDiagnosis(p: {
  band: string;
  spi: number | null;
  cpi: number | null;
  burnPct: number | null;
  daysSinceReport: number | null;
  highRisks: number;
  criticalIssues: number;
  openActionItems: number;
  nextMilestoneDays: number | null;
}): string {
  if (p.band === "no_data") {
    return `No status report in ${p.daysSinceReport ?? "?"} days — health cannot be assessed.`;
  }
  const flags: string[] = [];
  if (p.spi !== null && p.spi < 0.75) flags.push(`schedule slipping (SPI ${p.spi.toFixed(2)})`);
  if (p.cpi !== null && p.cpi < 0.85) flags.push(`cost running adverse (CPI ${p.cpi.toFixed(2)})`);
  if (p.burnPct !== null && p.burnPct > 80 && (p.spi === null || p.spi < 0.90))
    flags.push(`burn at ${Math.round(p.burnPct)}% with schedule risk`);
  if (p.criticalIssues > 0) flags.push(`${p.criticalIssues} critical issue${p.criticalIssues > 1 ? "s" : ""} open`);
  if (p.highRisks >= 3) flags.push(`${p.highRisks} high risks unmitigated`);
  if (p.spi !== null && p.spi >= 0.75 && p.spi < 0.90) flags.push(`schedule under pressure (SPI ${p.spi.toFixed(2)})`);
  if (p.cpi !== null && p.cpi >= 0.85 && p.cpi < 0.92) flags.push(`margin tightening (CPI ${p.cpi.toFixed(2)})`);
  if (p.openActionItems > 3) flags.push(`${p.openActionItems} PM actions unresolved`);
  if (p.nextMilestoneDays !== null && p.nextMilestoneDays <= 14) flags.push(`milestone due in ${p.nextMilestoneDays}d`);
  if (flags.length === 0)
    return p.band === "green" ? "Delivery and cost on track — no exceptions this cycle." : "Watch: marginal signals. No single critical driver.";
  return flags.slice(0, 3).join("; ") + ".";
}

function toBand(healthStatus: string, hasRecentReport: boolean): "red" | "amber" | "no_data" | "green" {
  if (!hasRecentReport) return "no_data";
  if (healthStatus === "red") return "red";
  if (healthStatus === "amber") return "amber";
  return "green";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = session.user as any;
  if (!["dm", "pgm", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const accountFilter = url.searchParams.get("account_id");
  const programFilter = url.searchParams.get("program_id");

  let accountIds: string[] = [];
  let programIds: string[] = [];
  if (user.role === "admin") {
    const accounts = await prisma.orgAccount.findMany({ where: { orgId: user.orgId, deletedAt: null }, select: { id: true } });
    accountIds = accounts.map((a) => a.id);
  } else if (user.role === "pgm") {
    const assignments = await prisma.programAssignment.findMany({ where: { userId: user.id }, select: { programId: true } });
    programIds = assignments.map((a) => a.programId);
  } else {
    const assignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
    accountIds = assignments.map((a) => a.accountId);
  }

  const hasScope = accountIds.length > 0 || programIds.length > 0;
  if (!hasScope) {
    return NextResponse.json({
      bands: { red: [], amber: [], no_data: [], green: [] },
      counts: { red: 0, amber: 0, no_data: 0, green: 0, total: 0 },
      overdueActionItems: 0,
    });
  }

  const scopeOr = [
    ...(accountIds.length > 0 ? [{ accountId: accountFilter ?? { in: accountIds } }] : []),
    ...(programIds.length > 0 ? [{ programId: programFilter ?? { in: programIds } }] : []),
  ];
  const projectWhere: any = {
    orgId: user.orgId,
    deletedAt: null,
    status: { not: "closed" },
    OR: scopeOr,
  };

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const projects = await prisma.project.findMany({
    where: projectWhere,
    include: {
      pmOwner: { select: { id: true, fullName: true, email: true } },
      account: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 4,
        include: { healthScore: true },
      },
      _count: {
        select: {
          risks:       { where: { status: "open", probability: { in: ["high", "very_high"] } } },
          issues:      { where: { status: "open", severity: { in: ["critical", "high"] } } },
          actionItems: { where: { status: { in: ["open", "acknowledged", "in_progress", "blocked"] } } },
        },
      },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
      costEntries: { select: { amount: true } },
      scheduleTasks: {
        select: {
          plannedCost: true, estimatedHours: true, baselineDays: true,
          baselineStart: true, baselineFinish: true, percentComplete: true,
        },
        take: 500,
      },
      // Agile: sprint metadata (no backlog join — too expensive in bulk)
      sprints: {
        where: { state: { in: ["active", "closed"] } },
        orderBy: { sprintNumber: "asc" },
        select: { id: true, sprintNumber: true, label: true, state: true, committedPoints: true, acceptedPoints: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // ── Batch-fetch agile baseline + cost data ────────────────────────────────────
  const agileIds = projects
    .filter(p => isAgileProject(p as any))
    .map(p => p.id);

  const agileBacklogMap = new Map<string, { baselinePoints: number; acceptedBaselinePoints: number }>();
  const agileCostMap    = new Map<string, number>();

  if (agileIds.length > 0) {
    const [baselineItems, ledgerEntries] = await Promise.all([
      (prisma as any).backlogItem.findMany({
        where: { projectId: { in: agileIds }, inContractedBaseline: true },
        select: { projectId: true, points: true, baselinePoints: true, state: true },
      }),
      (prisma as any).costLedger.findMany({
        where: { projectId: { in: agileIds } },
        select: { projectId: true, costAmount: true },
      }),
    ]);

    for (const pid of agileIds) {
      const items = (baselineItems as any[]).filter((i: any) => i.projectId === pid);
      const baselinePoints = items.reduce((s: number, i: any) => s + (i.baselinePoints ?? i.points ?? 0), 0);
      const acceptedBaselinePoints = items
        .filter((i: any) => i.state === "accepted")
        .reduce((s: number, i: any) => s + (i.baselinePoints ?? i.points ?? 0), 0);
      agileBacklogMap.set(pid, { baselinePoints, acceptedBaselinePoints });

      const ac = (ledgerEntries as any[])
        .filter((l: any) => l.projectId === pid)
        .reduce((s: number, l: any) => s + (l.costAmount ?? 0), 0);
      agileCostMap.set(pid, ac);
    }
  }

  const now = Date.now();

  const rows = projects.map((p) => {
    const latestReport   = p.statusReports[0] ?? null;
    const hs             = latestReport?.healthScore ?? null;
    const hasRecentReport = latestReport !== null && latestReport.reportDate >= fourteenDaysAgo;
    const openAI  = p._count.actionItems;
    const highR   = p._count.risks;
    const critI   = p._count.issues;
    const trendReports = [...p.statusReports].reverse();
    const spiTrend = trendReports.map(r => r.healthScore?.spi ?? null);
    const cpiTrend = trendReports.map(r => r.healthScore?.cpi ?? null);
    const compositeTrend = trendReports.map(r => r.healthScore?.compositeScore ?? null);
    const nm = p.milestones[0] ?? null;
    const nextMilestoneDays = nm ? Math.ceil((new Date(nm.dueDate).getTime() - now) / 86400000) : null;
    const daysSinceReport = latestReport ? Math.floor((now - new Date(latestReport.reportDate).getTime()) / 86400000) : null;

    const mKey = methodologyKey(p as any);

    if (isAgileProject(p as any)) {
      // ── Agile branch ──────────────────────────────────────────────────────────
      const backlog = agileBacklogMap.get(p.id) ?? { baselinePoints: 0, acceptedBaselinePoints: 0 };
      const ac      = agileCostMap.get(p.id) ?? 0;
      const agile   = computeAgileMetrics(p.sprints as any, p.budget, backlog.baselinePoints, backlog.acceptedBaselinePoints, ac);
      const band    = agileRagBand(agile.avgVelocity, agile.avgReliability, agile.velTrend, agile.cpi, critI, highR, agile.closedSprints);
      const attentionScore = computeAgileAttentionScore({ avgReliability: agile.avgReliability, velTrend: agile.velTrend, cpi: agile.cpi, openActionItems: openAI, highRisks: highR, criticalIssues: critI });
      const why = agileWhyDiagnosis({ band, avgVelocity: agile.avgVelocity, avgReliability: agile.avgReliability, velTrend: agile.velTrend, cpi: agile.cpi, closedSprints: agile.closedSprints, highRisks: highR, criticalIssues: critI, openActionItems: openAI });
      const burnPct = p.budget && p.budget > 0 && ac > 0 ? Math.round((ac / p.budget) * 100) : null;

      return {
        id: p.id, name: p.name,
        accountId: p.accountId, accountName: p.account?.name ?? null,
        programId: p.programId, programName: p.program?.name ?? null,
        pmId: p.pmOwnerId, pmName: p.pmOwner.fullName,
        healthStatus: p.healthStatus, band, attentionScore,
        deliveryMethod: mKey,
        spi: null, cpi: agile.cpi,
        compositeScore: hs?.compositeScore ?? null,
        velocity: agile.avgVelocity,
        commitmentReliability: agile.avgReliability,
        activeSprint: agile.activeSprint,
        velTrend: agile.velTrend,
        openActionItems: openAI, highRisks: highR, criticalIssues: critI,
        nextMilestone: nm ? { name: nm.name, dueDate: nm.dueDate, daysUntilDue: nextMilestoneDays } : null,
        phase: p.currentPhase, lastReportDate: latestReport?.reportDate ?? null, daysSinceReport,
        spiTrend, cpiTrend, compositeTrend,
        burnPct, budget: p.budget, currency: p.currency, totalSpent: ac,
        whyDiagnosis: why,
        artifactsGenerated: 0, hoursSaved: 0, dollarsSaved: 0,
      };
    }

    // ── Waterfall / Predictive branch ─────────────────────────────────────────
    const evm = computeEvm(p.scheduleTasks, p.costEntries, p.budget);
    const totalSpent = evm.totalAC;
    const spi = evm.spi ?? hs?.spi ?? null;
    const cpi = evm.cpi ?? hs?.cpi ?? null;
    const composite = hs?.compositeScore ?? null;
    const band = toBand(p.healthStatus, hasRecentReport);
    const attentionScore = computeAttentionScore({ healthStatus: p.healthStatus, spi, cpi, compositeScore: composite, openActionItems: openAI, highRisks: highR, criticalIssues: critI });
    const burnPct = p.budget && p.budget > 0 ? Math.round((totalSpent / p.budget) * 100) : null;
    const why = whyDiagnosis({ band, spi, cpi, burnPct, daysSinceReport, highRisks: highR, criticalIssues: critI, openActionItems: openAI, nextMilestoneDays });

    return {
      id: p.id, name: p.name,
      accountId: p.accountId, accountName: p.account?.name ?? null,
      programId: p.programId, programName: p.program?.name ?? null,
      pmId: p.pmOwnerId, pmName: p.pmOwner.fullName,
      healthStatus: p.healthStatus, band, attentionScore,
      deliveryMethod: mKey,
      spi, cpi,
      compositeScore: composite,
      velocity: null, commitmentReliability: null, activeSprint: null, velTrend: null,
      openActionItems: openAI, highRisks: highR, criticalIssues: critI,
      nextMilestone: nm ? { name: nm.name, dueDate: nm.dueDate, daysUntilDue: nextMilestoneDays } : null,
      phase: p.currentPhase, lastReportDate: latestReport?.reportDate ?? null, daysSinceReport,
      spiTrend, cpiTrend, compositeTrend,
      burnPct, budget: p.budget, currency: p.currency, totalSpent,
      whyDiagnosis: why,
      artifactsGenerated: 0, hoursSaved: 0, dollarsSaved: 0,
    };
  });

  const sorted = [...rows].sort((a, b) => b.attentionScore - a.attentionScore);

  const bands = {
    red:     sorted.filter(r => r.band === "red"),
    amber:   sorted.filter(r => r.band === "amber"),
    no_data: sorted.filter(r => r.band === "no_data"),
    green:   sorted.filter(r => r.band === "green"),
  };

  const counts = {
    red: bands.red.length, amber: bands.amber.length,
    no_data: bands.no_data.length, green: bands.green.length,
    total: rows.length,
  };

  const overdueActionItems = await prisma.actionItem.count({
    where: {
      project: { OR: scopeOr },
      status: { in: ["open", "acknowledged", "in_progress", "blocked"] },
      dueDate: { lt: new Date() },
    },
  });

  const totalBudget   = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const totalSpentAll = rows.reduce((s, r) => s + r.totalSpent, 0);

  return NextResponse.json({ bands, counts, overdueActionItems, accountIds, totalBudget, totalSpentAll });
}
