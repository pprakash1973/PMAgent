import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";
import { nextSequentialId } from "@/lib/sequential-id";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const risks = await prisma.risk.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(risks);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();
  const existing = await prisma.risk.findMany({ where: { projectId: id }, select: { riskId: true } });
  const risk = await prisma.risk.create({
    data: {
      projectId: id,
      riskId: nextSequentialId(existing.map((r) => r.riskId), "R"),
      description: body.description,
      category: body.category,
      probability: body.probability || "medium",
      impact: body.impact || "medium",
      owner: body.owner,
      mitigation: body.mitigation,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      requirementRef: body.requirementRef || "General",
    },
  });
  return NextResponse.json(risk, { status: 201 });
}
