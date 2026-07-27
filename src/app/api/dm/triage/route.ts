import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Compute a deterministic attention score from available project data.
// Subset of PRD §6.4 using data we have: health, SPI, CPI, open action items, risks, issues.
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

  // Health deficit (weight 30)
  const healthDeficit = (100 - composite) / 100;
  weightedSum += healthDeficit * 30;
  totalWeight += 30;

  // Schedule deficit (weight 15) — only if SPI available
  if (p.spi !== null) {
    const schedDef = Math.min(1, Math.max(0, (1 - p.spi) / 0.4));
    weightedSum += schedDef * 15;
    totalWeight += 15;
  }

  // Cost deficit (weight 15) — only if CPI available
  if (p.cpi !== null) {
    const costDef = Math.min(1, Math.max(0, (1 - p.cpi) / 0.4));
    weightedSum += costDef * 15;
    totalWeight += 15;
  }

  // Unaddressed action items (weight 10)
  const unaddressed = Math.min(1, p.openActionItems / 4);
  weightedSum += unaddressed * 10;
  totalWeight += 10;

  // Risk/issue proxy (weight 30)
  const riskProxy = Math.min(1, (p.highRisks + p.criticalIssues) / 5);
  weightedSum += riskProxy * 30;
  totalWeight += 30;

  // Renormalise if any terms were excluded (e.g. SPI/CPI missing)
  return Math.round((weightedSum / totalWeight) * 100);
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

  // Resolve DM's assigned accounts
  let accountIds: string[] = [];
  if (user.role === "admin") {
    // Admin sees everything — get all accounts in the org
    const accounts = await prisma.orgAccount.findMany({
      where: { orgId: user.orgId, deletedAt: null },
      select: { id: true },
    });
    accountIds = accounts.map((a) => a.id);
  } else if (user.role === "pgm") {
    const pgmAssignments = await prisma.programAssignment.findMany({
      where: { userId: user.id },
      include: { program: { select: { accountId: true } } },
    });
    accountIds = [...new Set(pgmAssignments.map((a) => a.program.accountId))];
    if (accountIds.length === 0) {
      const acctAssignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
      accountIds = acctAssignments.map((a) => a.accountId);
    }
  } else {
    const assignments = await prisma.accountAssignment.findMany({
      where: { userId: user.id },
      select: { accountId: true },
    });
    accountIds = assignments.map((a) => a.accountId);
  }

  if (accountIds.length === 0) {
    return NextResponse.json({ bands: { red: [], amber: [], no_data: [], green: [] }, counts: { red: 0, amber: 0, no_data: 0, green: 0, total: 0 } });
  }

  // Build project filter
  const projectWhere: any = {
    orgId: user.orgId,
    deletedAt: null,
    status: { not: "closed" },
    accountId: accountFilter ? accountFilter : { in: accountIds },
  };
  if (programFilter) projectWhere.programId = programFilter;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const projects = await prisma.project.findMany({
    where: projectWhere,
    include: {
      pmOwner: { select: { id: true, fullName: true, email: true } },
      account: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 1,
        include: { healthScore: true },
      },
      _count: {
        select: {
          risks: { where: { status: "open", probability: { in: ["high", "very_high"] } } },
          issues: { where: { status: "open", severity: { in: ["critical", "high"] } } },
          actionItems: { where: { status: { in: ["open", "acknowledged", "in_progress", "blocked"] } } },
        },
      },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  type TriageRow = {
    id: string;
    name: string;
    accountId: string | null;
    accountName: string | null;
    programId: string | null;
    programName: string | null;
    pmId: string;
    pmName: string;
    healthStatus: string;
    band: "red" | "amber" | "no_data" | "green";
    attentionScore: number;
    spi: number | null;
    cpi: number | null;
    compositeScore: number | null;
    openActionItems: number;
    highRisks: number;
    criticalIssues: number;
    nextMilestone: { name: string; dueDate: Date } | null;
    phase: string;
    lastReportDate: Date | null;
  };

  const rows: TriageRow[] = projects.map((p) => {
    const latestReport = p.statusReports[0] ?? null;
    const hs = latestReport?.healthScore ?? null;
    const hasRecentReport = latestReport !== null && latestReport.reportDate >= fourteenDaysAgo;

    const openAI = p._count.actionItems;
    const highR = p._count.risks;
    const critI = p._count.issues;
    const spi = hs?.spi ?? null;
    const cpi = hs?.cpi ?? null;
    const composite = hs?.compositeScore ?? null;

    const band = toBand(p.healthStatus, hasRecentReport);
    const attentionScore = computeAttentionScore({
      healthStatus: p.healthStatus,
      spi,
      cpi,
      compositeScore: composite,
      openActionItems: openAI,
      highRisks: highR,
      criticalIssues: critI,
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
      nextMilestone: p.milestones[0] ? { name: p.milestones[0].name, dueDate: p.milestones[0].dueDate } : null,
      phase: p.currentPhase,
      lastReportDate: latestReport?.reportDate ?? null,
    };
  });

  // Sort within each band by attention score desc (deterministic)
  const sorted = [...rows].sort((a, b) => b.attentionScore - a.attentionScore);

  const bands = {
    red: sorted.filter((r) => r.band === "red"),
    amber: sorted.filter((r) => r.band === "amber"),
    no_data: sorted.filter((r) => r.band === "no_data"),
    green: sorted.filter((r) => r.band === "green"),
  };

  const counts = {
    red: bands.red.length,
    amber: bands.amber.length,
    no_data: bands.no_data.length,
    green: bands.green.length,
    total: rows.length,
  };

  // Summary stats for the header chips
  const overdueActionItems = await prisma.actionItem.count({
    where: {
      project: { accountId: { in: accountIds } },
      status: { in: ["open", "acknowledged", "in_progress", "blocked"] },
      dueDate: { lt: new Date() },
    },
  });

  return NextResponse.json({ bands, counts, overdueActionItems, accountIds });
}
