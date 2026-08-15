import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProductivityStatsForProjects } from "@/lib/productivity";
import { DmTriageClient } from "./dm-triage-client";

export const dynamic = "force-dynamic";

function toBand(healthStatus: string, hasRecentReport: boolean): "red" | "amber" | "no_data" | "green" {
  if (!hasRecentReport) return "no_data";
  if (healthStatus === "red") return "red";
  if (healthStatus === "amber") return "amber";
  return "green";
}

function computeAttentionScore(p: {
  healthStatus: string; spi: number | null; cpi: number | null; compositeScore: number | null;
  openActionItems: number; highRisks: number; criticalIssues: number;
}): number {
  const composite = p.compositeScore ?? (p.healthStatus === "red" ? 40 : p.healthStatus === "amber" ? 65 : 85);
  let totalWeight = 0, weightedSum = 0;
  weightedSum += ((100 - composite) / 100) * 30; totalWeight += 30;
  if (p.spi !== null) { weightedSum += Math.min(1, Math.max(0, (1 - p.spi) / 0.4)) * 15; totalWeight += 15; }
  if (p.cpi !== null) { weightedSum += Math.min(1, Math.max(0, (1 - p.cpi) / 0.4)) * 15; totalWeight += 15; }
  weightedSum += Math.min(1, p.openActionItems / 4) * 10; totalWeight += 10;
  weightedSum += Math.min(1, (p.highRisks + p.criticalIssues) / 5) * 30; totalWeight += 30;
  return Math.round((weightedSum / totalWeight) * 100);
}

function whyDiagnosis(p: {
  band: string; spi: number | null; cpi: number | null; burnPct: number | null;
  daysSinceReport: number | null; highRisks: number; criticalIssues: number;
  openActionItems: number; nextMilestoneDays: number | null;
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

export default async function DmTriagePage() {
  const session = await auth();
  const user = session!.user as any;

  if (!["dm", "pgm", "admin"].includes(user.role)) redirect("/dashboard");

  let accountIds: string[] = [];
  let programIds: string[] = [];

  if (user.role === "admin") {
    const accounts = await prisma.orgAccount.findMany({ where: { orgId: user.orgId, deletedAt: null }, select: { id: true } });
    accountIds = accounts.map((a) => a.id);
  } else if (user.role === "pgm") {
    const [progAssign, acctAssign] = await Promise.all([
      prisma.programAssignment.findMany({ where: { userId: user.id }, select: { programId: true } }),
      prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } }),
    ]);
    programIds = progAssign.map((a) => a.programId);
    accountIds = acctAssign.map((a) => a.accountId);
  } else {
    const assignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
    accountIds = assignments.map((a) => a.accountId);
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const now = Date.now();

  const projects = await prisma.project.findMany({
    where: {
      orgId: user.orgId, deletedAt: null, status: { not: "closed" },
      OR: [
        ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
        ...(programIds.length > 0 ? [{ programId: { in: programIds } }] : []),
        ...(user.role !== "admin" ? [{ accountId: null, programId: null }] : []),
      ],
    },
    include: {
      pmOwner: { select: { id: true, fullName: true } },
      account: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      // 4 most-recent reports for trend sparklines (oldest→newest after reverse)
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 4,
        include: { healthScore: true },
      },
      costEntries: { select: { amount: true } },
      _count: {
        select: {
          risks:       { where: { status: "open", probability: { in: ["high", "very_high"] } } },
          issues:      { where: { status: "open", severity:   { in: ["critical", "high"] } } },
        },
      },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Sprint data for agile projects
  const agileProjectIds = projects
    .filter(p => {
      const dm = (p as any).deliveryMethod ?? "predictive";
      return dm === "agile_scrum" || p.methodology === "agile_scrum" || p.methodology === "agile";
    })
    .map(p => p.id);

  const sprintsByProject = new Map<string, Array<{ id: string; state: string; sprintNumber: number; label: string | null; committedPoints: number | null; acceptedPoints: number | null }>>();

  if (agileProjectIds.length > 0) {
    try {
      const sprints = await prisma.sprint.findMany({
        where: { projectId: { in: agileProjectIds }, state: { in: ["active", "closed"] } },
        orderBy: [{ projectId: "asc" }, { sprintNumber: "desc" }],
        take: agileProjectIds.length * 5,
        select: { id: true, projectId: true, state: true, sprintNumber: true, label: true, committedPoints: true, acceptedPoints: true },
      });
      for (const s of sprints) {
        if (!sprintsByProject.has(s.projectId)) sprintsByProject.set(s.projectId, []);
        sprintsByProject.get(s.projectId)!.push(s);
      }
    } catch {}
  }

  // Action item counts (separate query — table may not exist on older deployments)
  let actionItemCountMap: Record<string, number> = {};
  let overdueActionItems = 0;
  if (projects.length > 0) {
    try {
      const aiCounts = await prisma.actionItem.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projects.map((p) => p.id) }, status: { in: ["open", "acknowledged", "in_progress", "blocked"] } },
        _count: { id: true },
      });
      aiCounts.forEach((r) => { actionItemCountMap[r.projectId] = r._count.id; });

      const overdueWhere: any = {
        status: { in: ["open", "acknowledged", "in_progress", "blocked"] },
        dueDate: { lt: new Date() },
        project: {
          OR: [
            ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
            ...(programIds.length > 0 ? [{ programId: { in: programIds } }] : []),
            ...(user.role !== "admin" ? [{ accountId: null, programId: null }] : []),
          ],
        },
      };
      overdueActionItems = await prisma.actionItem.count({ where: overdueWhere });
    } catch {
      // action_items table not yet migrated
    }
  }

  // Per-project productivity stats
  let projectProdStats: Record<string, { artifactsGenerated: number; hoursSaved: number; dollarsSaved: number }> = {};
  try {
    projectProdStats = await getProductivityStatsForProjects(projects.map((p) => p.id));
  } catch {}

  function computePageAgileMetrics(sprints: Array<{ id: string; state: string; sprintNumber: number; label: string | null; committedPoints: number | null; acceptedPoints: number | null }>) {
    const active = sprints.find(s => s.state === "active");
    const closed = sprints.filter(s => s.state === "closed");
    const recent3 = closed.slice(0, 3);
    const velocity = recent3.length > 0 ? recent3.reduce((s, sp) => s + (sp.acceptedPoints ?? 0), 0) / recent3.length : null;
    const reliableCount = recent3.filter(s => {
      const c = s.committedPoints ?? 0; const a = s.acceptedPoints ?? 0;
      return c > 0 && (a / c) >= 0.8;
    }).length;
    const commitmentReliability = recent3.length > 0 ? (reliableCount / recent3.length) * 100 : null;
    let velTrend: "up" | "down" | "stable" | null = null;
    if (closed.length >= 2) {
      const prev = closed[1].acceptedPoints ?? 0; const curr = closed[0].acceptedPoints ?? 0;
      if (curr > prev * 1.05) velTrend = "up"; else if (curr < prev * 0.95) velTrend = "down"; else velTrend = "stable";
    }
    return { velocity, commitmentReliability, activeSprint: active ? { id: active.id, label: active.label, sprintNumber: active.sprintNumber } : null, velTrend };
  }

  const rows = projects.map((p) => {
    const deliveryMethod: string = (p as any).deliveryMethod ?? "predictive";
    const isAgile = deliveryMethod === "agile_scrum" || p.methodology === "agile_scrum" || p.methodology === "agile";
    const agileMetrics = isAgile ? computePageAgileMetrics(sprintsByProject.get(p.id) ?? []) : null;

    const latestReport = p.statusReports[0] ?? null;
    const hs = latestReport?.healthScore ?? null;
    const hasRecentReport = latestReport !== null && latestReport.reportDate >= fourteenDaysAgo;
    const spi = hs?.spi ?? null;
    const cpi = hs?.cpi ?? null;
    const composite = hs?.compositeScore ?? null;
    const openAI = actionItemCountMap[p.id] ?? 0;
    const highR = p._count.risks;
    const critI = p._count.issues;
    const band = toBand(p.healthStatus, hasRecentReport);

    const attentionScore = computeAttentionScore({
      healthStatus: p.healthStatus, spi, cpi, compositeScore: composite,
      openActionItems: openAI, highRisks: highR, criticalIssues: critI,
    });

    // Trend arrays: reverse so oldest→newest for sparklines
    const trendReports = [...p.statusReports].reverse();
    const spiTrend = trendReports.map(r => r.healthScore?.spi ?? null);
    const cpiTrend = trendReports.map(r => r.healthScore?.cpi ?? null);
    const compositeTrend = trendReports.map(r => r.healthScore?.compositeScore ?? null);

    // Burn %
    const totalSpent = p.costEntries.reduce((s, e) => s + e.amount, 0);
    const burnPct = (p.budget && p.budget > 0) ? Math.round((totalSpent / p.budget) * 100) : null;

    // Next milestone
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

    const prod = projectProdStats[p.id] ?? { artifactsGenerated: 0, hoursSaved: 0, dollarsSaved: 0 };

    return {
      id: p.id, name: p.name,
      accountId: p.accountId, accountName: p.account?.name ?? null,
      programId: p.programId, programName: p.program?.name ?? null,
      pmId: p.pmOwnerId, pmName: p.pmOwner.fullName,
      healthStatus: p.healthStatus, band, attentionScore,
      deliveryMethod,
      velocity:              agileMetrics?.velocity ?? null,
      commitmentReliability: agileMetrics?.commitmentReliability ?? null,
      activeSprint:          agileMetrics?.activeSprint ?? null,
      velTrend:              agileMetrics?.velTrend ?? null,
      spi, cpi, compositeScore: composite,
      openActionItems: openAI, highRisks: highR, criticalIssues: critI,
      nextMilestone: nm
        ? { name: nm.name, dueDate: nm.dueDate.toISOString(), daysUntilDue: nextMilestoneDays }
        : null,
      phase: p.currentPhase, lastReportDate: latestReport?.reportDate?.toISOString() ?? null,
      daysSinceReport,
      spiTrend, cpiTrend, compositeTrend,
      burnPct,
      budget: p.budget ?? null,
      currency: p.currency ?? "USD",
      totalSpent,
      whyDiagnosis: why,
      artifactsGenerated: prod.artifactsGenerated,
      hoursSaved: prod.hoursSaved,
      dollarsSaved: prod.dollarsSaved,
    };
  });

  const sorted = [...rows].sort((a, b) => b.attentionScore - a.attentionScore);
  const bands = {
    red:     sorted.filter((r) => r.band === "red"),
    amber:   sorted.filter((r) => r.band === "amber"),
    no_data: sorted.filter((r) => r.band === "no_data"),
    green:   sorted.filter((r) => r.band === "green"),
  };
  const counts = {
    red: bands.red.length, amber: bands.amber.length,
    no_data: bands.no_data.length, green: bands.green.length,
    total: rows.length,
  };

  const portfolioProd = {
    artifactsGenerated: rows.reduce((s, r) => s + r.artifactsGenerated, 0),
    hoursSaved: Math.round(rows.reduce((s, r) => s + r.hoursSaved, 0) * 10) / 10,
    dollarsSaved: rows.reduce((s, r) => s + r.dollarsSaved, 0),
  };

  const totalBudget   = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const totalSpentAll = rows.reduce((s, r) => s + r.totalSpent, 0);

  return (
    <DmTriageClient
      data={{ bands, counts, overdueActionItems, portfolioProd, totalBudget, totalSpentAll }}
      userName={user.name ?? user.email}
      userRole={user.role}
    />
  );
}
