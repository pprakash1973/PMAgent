export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner: { select: { fullName: true, email: true } },
      milestones: { orderBy: { dueDate: "asc" } },
      risks: { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" } },
      issues: { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" } },
      artifacts: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } },
      artifactSelections: true,
      statusReports: { orderBy: { reportDate: "desc" }, take: 5, include: { healthScore: true } },
      requirementsDocs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  return NextResponse.json(project);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.status && { status: body.status }),
      ...(body.healthStatus && { healthStatus: body.healthStatus }),
      ...(body.engagementMode && { engagementMode: body.engagementMode }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
      ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
      ...(body.budget !== undefined && { budget: body.budget }),
    },
  });

  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });

  return NextResponse.json({ success: true });
}
