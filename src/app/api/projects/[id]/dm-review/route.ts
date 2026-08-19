import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeEvm } from "@/lib/evm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = session.user as any;
  if (!["dm", "pgm", "admin", "dh"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner: { select: { id: true, fullName: true } },
      account: { select: { name: true } },
      program: { select: { name: true } },
    },
  });

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Scope check — mirrors triage page.tsx logic exactly.
  // Projects with accountId=null AND programId=null are "unassigned" and visible to any dm/pgm.
  const isUnassigned = project.accountId === null && project.programId === null;

  if (user.role === "dm") {
    if (!isUnassigned) {
      if (!project.accountId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      const assignment = await prisma.accountAssignment.findFirst({
        where: { userId: user.id, accountId: project.accountId },
      });
      if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } else if (user.role === "pgm") {
    if (!isUnassigned) {
      if (project.programId) {
        const assignment = await prisma.programAssignment.findFirst({
          where: { userId: user.id, programId: project.programId },
        });
        if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      } else if (project.accountId) {
        const assignment = await prisma.accountAssignment.findFirst({
          where: { userId: user.id, accountId: project.accountId },
        });
        if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      } else {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    }
  }

  const isAgile = project.deliveryMethod === "agile_scrum" || project.methodology === "agile_scrum";

  const [latestReport, allReports, risks, issues, milestones, artifacts, costEntries, scheduleTasks] = await Promise.all([
    prisma.statusReport.findFirst({
      where: { projectId: id },
      orderBy: { reportDate: "desc" },
      include: { healthScore: true },
    }),
    prisma.statusReport.findMany({
      where: { projectId: id },
      orderBy: { reportDate: "asc" },
      take: 8,
      select: { reportDate: true, healthScore: { select: { spi: true, cpi: true, compositeScore: true } } },
    }),
    prisma.risk.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.issue.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.milestone.findMany({
      where: { projectId: id },
      orderBy: { dueDate: "asc" },
    }),
    prisma.artifact.findMany({
      where: { projectId: id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.costEntry.findMany({
      where: { projectId: id },
      select: { amount: true },
    }),
    prisma.scheduleTask.findMany({
      where: { projectId: id },
      select: {
        plannedCost: true, estimatedHours: true, baselineDays: true,
        baselineStart: true, baselineFinish: true, percentComplete: true, status: true,
      },
    }),
  ]);

  // action_items and dm_review_notes are new tables — guard against missing migration
  let actionItems: any[] = [];
  let reviewNotes: any[] = [];
  try {
    [actionItems, reviewNotes] = await Promise.all([
      prisma.actionItem.findMany({
        where: { projectId: id },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        include: {
          raisedBy: { select: { fullName: true } },
          assignedTo: { select: { fullName: true } },
        },
      }),
      prisma.dmReviewNote.findMany({
        where: {
          projectId: id,
          ...(user.role === "dm"
            ? { OR: [{ visibility: "shared_with_pm" }, { authorId: user.id }] }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { fullName: true } } },
      }),
    ]);
  } catch {
    // Tables not yet migrated — return empty arrays
  }

  // Agile sprint data (only fetched for agile projects)
  let agileData: {
    avgVelocity: number | null;
    avgReliability: number | null;
    velTrend: "up" | "down" | "stable" | null;
    activeSprint: { sprintNumber: number; label: string | null; goal: string | null; endDate: string } | null;
    closedSprints: number;
    openImpediments: number;
  } | null = null;

  if (isAgile) {
    const [sprints, impedimentCount] = await Promise.all([
      prisma.sprint.findMany({
        where: { projectId: id, state: { in: ["active", "closed"] } },
        orderBy: { sprintNumber: "asc" },
        select: { sprintNumber: true, label: true, goal: true, state: true, endDate: true, committedPoints: true, acceptedPoints: true },
      }),
      prisma.impediment.count({ where: { projectId: id, resolvedAt: null } }),
    ]);

    const closed = sprints.filter(s => s.state === "closed");
    const active = sprints.find(s => s.state === "active") ?? null;

    const velocities = closed.map(s => s.acceptedPoints ?? 0);
    const avgVelocity = velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : null;

    const rels = closed
      .filter(s => (s.committedPoints ?? 0) > 0)
      .map(s => Math.min(100, ((s.acceptedPoints ?? 0) / s.committedPoints!) * 100));
    const avgReliability = rels.length > 0 ? rels.reduce((a, b) => a + b, 0) / rels.length : null;

    const recent = closed.slice(-3).map(s => s.acceptedPoints ?? 0);
    const velTrend: "up" | "down" | "stable" | null = recent.length >= 2
      ? (Math.abs(recent[recent.length - 1] - recent[0]) < 1 ? "stable" : recent[recent.length - 1] >= recent[0] ? "up" : "down")
      : null;

    agileData = {
      avgVelocity,
      avgReliability,
      velTrend,
      activeSprint: active ? { sprintNumber: active.sprintNumber, label: active.label, goal: active.goal ?? null, endDate: active.endDate.toISOString() } : null,
      closedSprints: closed.length,
      openImpediments: impedimentCount,
    };
  }

  // EVM via shared utility — same formula as PM burndown endpoint
  const evm = computeEvm(scheduleTasks, costEntries, project.budget);
  const { totalAC: totalSpent, spi: liveSpi, cpi: liveCpi } = evm;
  const burnPct = project.budget && project.budget > 0
    ? Math.round((totalSpent / project.budget) * 100)
    : null;

  const ragStatus = (() => {
    if (liveSpi !== null && liveCpi !== null) {
      if (liveSpi < 0.8 || liveCpi < 0.8) return "red";
      if (liveSpi < 0.9 || liveCpi < 0.9) return "amber";
      return "green";
    }
    if (liveSpi !== null) {
      if (liveSpi < 0.8) return "red";
      if (liveSpi < 0.9) return "amber";
      return "green";
    }
    return latestReport?.healthScore?.ragStatus ?? project.healthStatus ?? "green";
  })();

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      currentPhase: project.currentPhase,
      healthStatus: project.healthStatus,
      ragStatus,
      deliveryMethod: isAgile ? "agile_scrum" : (project.deliveryMethod ?? "predictive"),
      accountName: project.account?.name ?? null,
      programName: project.program?.name ?? null,
      pmName: project.pmOwner.fullName,
      budget: project.budget,
      currency: project.currency,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
    },
    burnPct,
    totalSpent,
    evm: {
      spi: evm.spi,
      cpi: evm.cpi,
      pvHours: evm.pvHours,
      evHours: evm.evHours,
      svHours: evm.svHours,
      eac: evm.eac,
      schedCompletionPct: evm.schedCompletionPct,
      taskCount: scheduleTasks.length,
    },
    health: latestReport?.healthScore
      ? {
          compositeScore: latestReport.healthScore.compositeScore,
          spi: latestReport.healthScore.spi,
          cpi: latestReport.healthScore.cpi,
          ragStatus: latestReport.healthScore.ragStatus,
        }
      : null,
    risks: risks.map((r) => ({
      id: r.id,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      status: r.status,
      owner: r.owner,
      dueDate: (r as any).dueDate ? new Date((r as any).dueDate).toISOString() : null,
    })),
    issues: issues.map((i) => ({
      id: i.id,
      description: i.description,
      severity: i.severity,
      status: i.status,
      owner: i.owner,
    })),
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      dueDate: m.dueDate.toISOString(),
      status: m.status,
    })),
    actionItems: actionItems.map((ai) => ({
      id: ai.id,
      reference: ai.reference,
      title: ai.title,
      priority: ai.priority,
      status: ai.status,
      dueDate: ai.dueDate?.toISOString() ?? null,
      raisedByName: ai.raisedBy.fullName,
      assignedToName: ai.assignedTo.fullName,
      pmResponse: (ai as any).pmResponse ?? null,
      closureNote: (ai as any).closureNote ?? null,
      closedAt: (ai as any).closedAt?.toISOString() ?? null,
    })),
    reviewNotes: reviewNotes.map((n) => ({
      id: n.id,
      reviewType: n.reviewType,
      body: n.body,
      visibility: n.visibility,
      createdAt: n.createdAt.toISOString(),
      authorName: n.author.fullName,
    })),
    spiCpiHistory: allReports.map((r) => ({
      date: r.reportDate.toISOString(),
      spi: r.healthScore?.spi ?? null,
      cpi: r.healthScore?.cpi ?? null,
      compositeScore: r.healthScore?.compositeScore ?? null,
    })),
    agile: agileData,
  });
}
