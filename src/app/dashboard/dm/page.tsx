import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DmTriageClient } from "./dm-triage-client";

export const dynamic = "force-dynamic";

function toBand(healthStatus: string, hasRecentReport: boolean): "red" | "amber" | "no_data" | "green" {
  if (!hasRecentReport) return "no_data";
  if (healthStatus === "red") return "red";
  if (healthStatus === "amber") return "amber";
  return "green";
}

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

  weightedSum += ((100 - composite) / 100) * 30; totalWeight += 30;
  if (p.spi !== null) { weightedSum += Math.min(1, Math.max(0, (1 - p.spi) / 0.4)) * 15; totalWeight += 15; }
  if (p.cpi !== null) { weightedSum += Math.min(1, Math.max(0, (1 - p.cpi) / 0.4)) * 15; totalWeight += 15; }
  weightedSum += Math.min(1, p.openActionItems / 4) * 10; totalWeight += 10;
  weightedSum += Math.min(1, (p.highRisks + p.criticalIssues) / 5) * 30; totalWeight += 30;

  return Math.round((weightedSum / totalWeight) * 100);
}

export default async function DmTriagePage() {
  const session = await auth();
  const user = session!.user as any;

  if (!["dm", "pgm", "admin"].includes(user.role)) redirect("/dashboard");

  // Resolve account + program scope
  let accountIds: string[] = [];
  let programIds: string[] = [];

  if (user.role === "admin") {
    const accounts = await prisma.orgAccount.findMany({ where: { orgId: user.orgId, deletedAt: null }, select: { id: true } });
    accountIds = accounts.map((a) => a.id);
  } else if (user.role === "pgm") {
    const pgmAssignments = await prisma.programAssignment.findMany({
      where: { userId: user.id },
      include: { program: { select: { id: true, accountId: true } } },
    });
    programIds = pgmAssignments.map((a) => a.program.id);
    accountIds = [...new Set(pgmAssignments.map((a) => a.program.accountId).filter(Boolean))] as string[];
    // fall back to AccountAssignment if no programs
    if (accountIds.length === 0 && programIds.length === 0) {
      const acctAssignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
      accountIds = acctAssignments.map((a) => a.accountId);
    }
  } else {
    // dm role: try AccountAssignment first, fall back to ProgramAssignment
    const assignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
    accountIds = assignments.map((a) => a.accountId);
    if (accountIds.length === 0) {
      const pgmAssignments = await prisma.programAssignment.findMany({
        where: { userId: user.id },
        include: { program: { select: { id: true, accountId: true } } },
      });
      programIds = pgmAssignments.map((a) => a.program.id);
      accountIds = [...new Set(pgmAssignments.map((a) => a.program.accountId).filter(Boolean))] as string[];
    }
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const hasScope = accountIds.length > 0 || programIds.length > 0;
  const projects = !hasScope ? [] : await prisma.project.findMany({
    where: {
      orgId: user.orgId, deletedAt: null, status: { not: "closed" },
      OR: [
        ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
        ...(programIds.length > 0 ? [{ programId: { in: programIds } }] : []),
      ],
    },
    include: {
      pmOwner: { select: { id: true, fullName: true } },
      account: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      _count: {
        select: {
          risks: { where: { status: "open", probability: { in: ["high", "very_high"] } } },
          issues: { where: { status: "open", severity: { in: ["critical", "high"] } } },
        },
      },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Fetch action item counts separately — table may not exist on older deployments
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
        project: { OR: [
          ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
          ...(programIds.length > 0 ? [{ programId: { in: programIds } }] : []),
        ]},
      };
      overdueActionItems = await prisma.actionItem.count({ where: overdueWhere });
    } catch {
      // action_items table not yet migrated — counts default to 0
    }
  }

  type TriageRow = {
    id: string; name: string; accountId: string | null; accountName: string | null;
    programId: string | null; programName: string | null; pmId: string; pmName: string;
    healthStatus: string; band: "red" | "amber" | "no_data" | "green"; attentionScore: number;
    spi: number | null; cpi: number | null; compositeScore: number | null;
    openActionItems: number; highRisks: number; criticalIssues: number;
    nextMilestone: { name: string; dueDate: Date } | null; phase: string; lastReportDate: Date | null;
  };

  const rows: TriageRow[] = projects.map((p) => {
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
    const attentionScore = computeAttentionScore({ healthStatus: p.healthStatus, spi, cpi, compositeScore: composite, openActionItems: openAI, highRisks: highR, criticalIssues: critI });
    return {
      id: p.id, name: p.name, accountId: p.accountId, accountName: p.account?.name ?? null,
      programId: p.programId, programName: p.program?.name ?? null,
      pmId: p.pmOwnerId, pmName: p.pmOwner.fullName,
      healthStatus: p.healthStatus, band, attentionScore, spi, cpi, compositeScore: composite,
      openActionItems: openAI, highRisks: highR, criticalIssues: critI,
      nextMilestone: p.milestones[0] ? { name: p.milestones[0].name, dueDate: p.milestones[0].dueDate } : null,
      phase: p.currentPhase, lastReportDate: latestReport?.reportDate ?? null,
    };
  });

  const sorted = [...rows].sort((a, b) => b.attentionScore - a.attentionScore);
  const bands = {
    red: sorted.filter((r) => r.band === "red"),
    amber: sorted.filter((r) => r.band === "amber"),
    no_data: sorted.filter((r) => r.band === "no_data"),
    green: sorted.filter((r) => r.band === "green"),
  };
  const counts = { red: bands.red.length, amber: bands.amber.length, no_data: bands.no_data.length, green: bands.green.length, total: rows.length };

  // Serialize dates for client component
  const serialized = {
    bands: {
      red: bands.red.map(serializeRow),
      amber: bands.amber.map(serializeRow),
      no_data: bands.no_data.map(serializeRow),
      green: bands.green.map(serializeRow),
    },
    counts,
    overdueActionItems,
  };

  return <DmTriageClient data={serialized} userName={user.name ?? user.email} />;
}

function serializeRow(r: any) {
  return {
    ...r,
    nextMilestone: r.nextMilestone ? { ...r.nextMilestone, dueDate: r.nextMilestone.dueDate.toISOString() } : null,
    lastReportDate: r.lastReportDate?.toISOString() ?? null,
  };
}
