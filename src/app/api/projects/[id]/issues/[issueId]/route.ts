import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refreshAdvisories } from "@/lib/refresh-advisories";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id, issueId } = await params;
  const body = await req.json();

  const issue = await prisma.issue.update({
    where: { id: issueId, projectId: id },
    data: {
      ...(body.description !== undefined && { description: body.description }),
      ...(body.severity !== undefined && { severity: body.severity }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.owner !== undefined && { owner: body.owner }),
      ...(body.resolution !== undefined && { resolution: body.resolution }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
    },
  });
  refreshAdvisories(id).catch(() => {});
  return NextResponse.json(issue);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id, issueId } = await params;
  await prisma.issue.delete({ where: { id: issueId, projectId: id } });
  return NextResponse.json({ ok: true });
}
