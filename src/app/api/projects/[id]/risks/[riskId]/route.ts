import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshAdvisories } from "@/lib/refresh-advisories";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; riskId: string }> }) {
  const { id, riskId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();

  const risk = await prisma.risk.update({
    where: { id: riskId, projectId: id },
    data: {
      ...(body.description !== undefined && { description: body.description }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.probability !== undefined && { probability: body.probability }),
      ...(body.impact !== undefined && { impact: body.impact }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.owner !== undefined && { owner: body.owner }),
      ...(body.mitigation !== undefined && { mitigation: body.mitigation }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.requirementRef !== undefined && { requirementRef: body.requirementRef }),
    },
  });
  refreshAdvisories(id).catch(() => {});
  return NextResponse.json(risk);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; riskId: string }> }) {
  const { id, riskId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  await prisma.risk.delete({ where: { id: riskId, projectId: id } });
  return NextResponse.json({ ok: true });
}
