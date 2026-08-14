import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeEvm } from "@/lib/evm";

export const dynamic = "force-dynamic";

// ── Attention score ─────────────────────────────────────────────────────────────
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
    const schedDef = Math.min(1, Math.max(0, (1 - p.spi) / 0.4));
    weightedSum += schedDef * 15;
    totalWeight += 15;
  }
  if (p.cpi !== null) {
    const costDef = Math.min(1, Math.max(0, (1 - p.cpi) / 0.4));
    weightedSum += costDef * 15;
    totalWeight += 15;
  }

  const unaddressed = Math.min(1, p.openActionItems / 4);
  weightedSum += unaddressed * 10;
  totalWeight += 10;

  const riskProxy = Math.min(1, (p.highRisks + p.criticalIssues) / 5);
  weightedSum += riskProxy * 30;
  totalWeight += 30;

  return Math.round((weightedSum / totalWeight) * 100);
}

// ── Why diagnosis — rule-based, priority ladder ─────────────────────────────────
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
    const days = p.daysSinceReport ?? "?";
    return `No status report in ${days} days — health cannot be assessed. Data gap may need a nudge to the PM.`;
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
  if (p.nextMilestoneDays !== null && p.nextMilestoneDays <= 14)
    flags.push(`milestone due in ${p.nextMilestoneDays}d`);

  if (flags.length === 0) {
    return p.band === "green"
      ? "Delivery and cost on track — no exceptions this cycle."
      : "Watch: marginal signals. No single critical driver — review for trend.";
  }
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
      // 4 most-recent reports for trend sparklines
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
        take: 500, // guard against unbounded task lists; 500 tasks covers all realistic projects
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = Date.now();

  const rows = projects.map((p) => {
    const latestReport = p.statusReports[0] ?? null;
    const hs = latestReport?.healthScore ?? null;
    const hasRecentReport = latestReport !== null && latestReport.reportDate >= fourteenDaysAgo;

    const openAI = p._count.actionItems;
    const highR = p._count.risks;
    const critI = p._count.issues;

    // Live SPI/CPI via shared computeEvm — same formula as PM burndown endpoint
    const evm = computeEvm(p.scheduleTasks, p.costEntries, p.budget);
    const totalSpent = evm.totalAC;
    const spi = evm.spi ?? hs?.spi ?? null;
    const cpi = evm.cpi ?? hs?.cpi ?? null;
    const composite = hs?.compositeScore ?? null;

    const band = toBand(p.healthStatus, hasRecentReport);
    const attentionScore = computeAttentionScore({
      healthStatus: p.healthStatus, spi, cpi, compositeScore: composite,
      openActionItems: openAI, highRisks: highR, criticalIssues: critI,
    });

    // Trend: last 4 reports ordered oldest→newest for sparklines
    const trendReports = [...p.statusReports].reverse();
    const spiTrend    = trendReports.map(r => r.healthScore?.spi ?? null);
    const cpiTrend    = trendReports.map(r => r.healthScore?.cpi ?? null);
    const compositeTrend = trendReports.map(r => r.healthScore?.compositeScore ?? null);

    // Burn %
    const burnPct = p.budget && p.budget > 0 ? Math.round((totalSpent / p.budget) * 100) : null;

    // Days to next milestone
    const nm = p.milestones[0] ?? null;
    const nextMilestoneDays = nm
      ? Math.ceil((new Date(nm.dueDate).getTime() - now) / 86400000)
      : null;

    // Days since last report
    const daysSinceReport = latestReport
      ? Math.floor((now - new Date(latestReport.reportDate).getTime()) / 86400000)
      : null;

    const why = whyDiagnosis({
      band, spi, cpi, burnPct, daysSinceReport,
      highRisks: highR, criticalIssues: critI,
      openActionItems: openAI, nextMilestoneDays,
    });

    return {
      id: p.id,
      name: p.name,
      accountId: p.accountId,
      accountName: p.account?.name ?? null,
      programId: p.programId,
      programName: p.program?.name ?? null,
      pmId: p.pmOwnerId,
      pmName: p.pmOwner.fullName,
      healthStatus: p.healthStatus,
      band,
      attentionScore,
      spi,
      cpi,
      compositeScore: composite,
      openActionItems: openAI,
      highRisks: highR,
      criticalIssues: critI,
      nextMilestone: nm ? { name: nm.name, dueDate: nm.dueDate, daysUntilDue: nextMilestoneDays } : null,
      phase: p.currentPhase,
      lastReportDate: latestReport?.reportDate ?? null,
      daysSinceReport,
      // New Phase-1 fields
      spiTrend,
      cpiTrend,
      compositeTrend,
      burnPct,
      budget: p.budget,
      currency: p.currency,
      totalSpent,
      whyDiagnosis: why,
      artifactsGenerated: 0,
      hoursSaved: 0,
      dollarsSaved: 0,
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

  // Portfolio financials summary
  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const totalSpentAll = rows.reduce((s, r) => s + r.totalSpent, 0);

  return NextResponse.json({ bands, counts, overdueActionItems, accountIds, totalBudget, totalSpentAll });
}
