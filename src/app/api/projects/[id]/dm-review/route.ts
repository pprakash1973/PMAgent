import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const totalSpent = costEntries.reduce((s, e) => s + e.amount, 0);
  const burnPct = project.budget && project.budget > 0
    ? Math.round((totalSpent / project.budget) * 100)
    : null;

  // Live EVM from schedule tasks (burndown formula: dollar-weighted)
  const bac = project.budget ?? 0;
  const totalBaseHours = scheduleTasks.reduce((s, t) => s + (t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8), 0);
  const taskPC = (t: typeof scheduleTasks[0]) => {
    const pc = t.plannedCost ? Number(t.plannedCost) : 0;
    if (pc > 0) return pc;
    const th = t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8;
    return bac > 0 && totalBaseHours > 0 ? (bac * th) / totalBaseHours : 0;
  };
  const nowMs = Date.now();
  const pvNow = scheduleTasks.reduce((s, t) => {
    const start = new Date(t.baselineStart).getTime();
    const end = new Date(t.baselineFinish).getTime();
    if (nowMs <= start) return s;
    if (nowMs >= end) return s + taskPC(t);
    return s + taskPC(t) * ((nowMs - start) / (end - start || 1));
  }, 0);
  const evNow = scheduleTasks.reduce((s, t) => s + (t.percentComplete === 100 ? taskPC(t) : 0), 0);
  const liveSpi = pvNow > 0 ? evNow / pvNow : null;
  const liveCpi = totalSpent > 0 ? evNow / totalSpent : null;
  const eac = liveCpi && liveCpi > 0 ? bac / liveCpi : null;
  const completedTasks = scheduleTasks.filter(t => t.status === "complete").length;
  const schedCompletionPct = scheduleTasks.length > 0
    ? Math.round((completedTasks / scheduleTasks.length) * 100) : null;
  // Hour-based EVM for display (pv/ev in hours, days * 8)
  const pvHours = scheduleTasks.reduce((s, t) => {
    const th = t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8;
    const start = new Date(t.baselineStart).getTime();
    const end = new Date(t.baselineFinish).getTime();
    if (nowMs <= start) return s;
    if (nowMs >= end) return s + th;
    return s + th * ((nowMs - start) / (end - start || 1));
  }, 0);
  const evHours = scheduleTasks.reduce((s, t) => {
    const th = t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8;
    return s + th * (t.percentComplete / 100);
  }, 0);

  const svHours = evHours - pvHours;
  const ragStatus = (() => {
    if (liveSpi !== null && liveCpi !== null) {
      if (liveSpi < 0.8 || liveCpi < 0.8) return "red";
      if (liveSpi < 0.9 || liveCpi < 0.9) return "amber";
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
      spi: liveSpi !== null ? Math.round(liveSpi * 100) / 100 : null,
      cpi: liveCpi !== null ? Math.round(liveCpi * 100) / 100 : null,
      pvHours: Math.round(pvHours),
      evHours: Math.round(evHours),
      svHours: Math.round(svHours),
      eac: eac !== null ? Math.round(eac) : null,
      schedCompletionPct,
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
  });
}
