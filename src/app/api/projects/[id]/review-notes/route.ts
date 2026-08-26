import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

const VALID_REVIEW_TYPES = [
  "weekly_review", "ad_hoc", "escalation_prep", "gate_review", "handover_review",
] as const;

const VALID_VISIBILITY = ["shared_with_pm", "dm_only"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const user = session.user as any;
  if (!["dm", "pgm", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, accountId: true, programId: true },
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

  const body = await req.json();
  const { reviewType, body: noteBody, visibility = "dm_only" } = body;

  if (!noteBody?.trim()) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }
  if (!VALID_REVIEW_TYPES.includes(reviewType)) {
    return NextResponse.json({ error: "Invalid review type" }, { status: 400 });
  }
  if (!VALID_VISIBILITY.includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  const note = await prisma.dmReviewNote.create({
    data: {
      projectId,
      authorId: user.id,
      reviewType,
      body: noteBody.trim(),
      visibility,
    },
    include: { author: { select: { fullName: true } } },
  });

  return NextResponse.json({
    id: note.id,
    reviewType: note.reviewType,
    body: note.body,
    visibility: note.visibility,
    createdAt: note.createdAt.toISOString(),
    authorName: note.author.fullName,
  }, { status: 201 });
}
