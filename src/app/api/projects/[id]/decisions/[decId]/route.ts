import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function resolveAndAuthorize(id: string, decId: string, orgId: string) {
  const decision = await prisma.decision.findUnique({
    where: { id: decId },
    include: { project: { select: { orgId: true } } },
  });
  if (!decision || decision.projectId !== id || decision.project.orgId !== orgId) return null;
  return decision;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; decId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id, decId } = await params;

  const decision = await resolveAndAuthorize(id, decId, user.orgId);
  if (!decision) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.decision.update({
    where: { id: decId },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.rationale !== undefined && { rationale: body.rationale?.trim() || null }),
      ...(body.madeBy !== undefined && { madeBy: body.madeBy?.trim() || null }),
      ...(body.madeAt !== undefined && { madeAt: new Date(body.madeAt) }),
      ...(body.reviewAt !== undefined && { reviewAt: body.reviewAt ? new Date(body.reviewAt) : null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.linkedRef !== undefined && { linkedRef: body.linkedRef?.trim() || null }),
      ...(body.linkedType !== undefined && { linkedType: body.linkedType || null }),
      ...(body.sprintId !== undefined && { sprintId: body.sprintId || null }),
      ...(body.sprintLabel !== undefined && { sprintLabel: body.sprintLabel?.trim() || null }),
      ...(body.category !== undefined && { category: body.category || null }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; decId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id, decId } = await params;

  const decision = await resolveAndAuthorize(id, decId, user.orgId);
  if (!decision) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.decision.delete({ where: { id: decId } });
  return NextResponse.json({ ok: true });
}
