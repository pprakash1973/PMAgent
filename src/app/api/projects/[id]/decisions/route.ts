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
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== user.orgId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const decisions = await prisma.decision.findMany({
    where: { projectId: id },
    orderBy: { madeAt: "desc" },
  });
  return NextResponse.json(decisions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== user.orgId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json();

  const count = await prisma.decision.count({ where: { projectId: id } });
  const decision = await prisma.decision.create({
    data: {
      projectId: id,
      decisionId: `D-${String(count + 1).padStart(3, "0")}`,
      title: body.title?.trim() || "Untitled decision",
      rationale: body.rationale?.trim() || null,
      madeBy: body.madeBy?.trim() || null,
      madeAt: body.madeAt ? new Date(body.madeAt) : new Date(),
      reviewAt: body.reviewAt ? new Date(body.reviewAt) : null,
      status: body.status ?? "open",
      linkedRef: body.linkedRef?.trim() || null,
      linkedType: body.linkedType || null,
      sprintId: body.sprintId || null,
      sprintLabel: body.sprintLabel?.trim() || null,
      category: body.category || null,
    },
  });
  return NextResponse.json(decision, { status: 201 });
}
