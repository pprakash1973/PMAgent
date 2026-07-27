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

  // Scope check — hierarchy: dm→Account, pgm→Program
  if (user.role === "dm") {
    const assignment = await prisma.accountAssignment.findFirst({
      where: { userId: user.id, accountId: project.accountId ?? "" },
    });
    if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } else if (user.role === "pgm") {
    if (!project.programId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const assignment = await prisma.programAssignment.findFirst({
      where: { userId: user.id, programId: project.programId },
    });
    if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const [latestReport, risks, issues, milestones, artifacts] = await Promise.all([
    prisma.statusReport.findFirst({
      where: { projectId: id },
      orderBy: { reportDate: "desc" },
      include: { healthScore: true },
    }),
    prisma.risk.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.issue.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.milestone.findMany({
      where: { projectId: id },
      orderBy: { dueDate: "asc" },
    }),
    prisma.artifact.findMany({
      where: { projectId: id },
      orderBy: { updatedAt: "desc" },
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

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      currentPhase: project.currentPhase,
      healthStatus: project.healthStatus,
      accountName: project.account?.name ?? null,
      programName: project.program?.name ?? null,
      pmName: project.pmOwner.fullName,
      budget: project.budget,
      currency: project.currency,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
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
    artifacts: artifacts.map((a) => ({
      artifactType: a.artifactType,
      phase: a.phase,
      status: a.status,
      updatedAt: a.updatedAt.toISOString(),
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
  });
}
