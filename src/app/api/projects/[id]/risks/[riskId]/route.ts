import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; riskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, riskId } = await params;
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
    },
  });
  return NextResponse.json(risk);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; riskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, riskId } = await params;
  await prisma.risk.delete({ where: { id: riskId, projectId: id } });
  return NextResponse.json({ ok: true });
}
