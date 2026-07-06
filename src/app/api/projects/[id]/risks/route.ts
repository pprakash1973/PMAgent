import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  const risks = await prisma.risk.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(risks);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const count = await prisma.risk.count({ where: { projectId: id } });
  const risk = await prisma.risk.create({
    data: {
      projectId: id,
      riskId: `R-${String(count + 1).padStart(3, "0")}`,
      description: body.description,
      category: body.category,
      probability: body.probability || "medium",
      impact: body.impact || "medium",
      owner: body.owner,
      mitigation: body.mitigation,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
  });
  return NextResponse.json(risk, { status: 201 });
}
