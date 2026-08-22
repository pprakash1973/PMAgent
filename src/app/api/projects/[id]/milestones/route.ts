import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const milestones = await prisma.milestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } });
  return NextResponse.json(milestones);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();
  const milestone = await prisma.milestone.create({
    data: { projectId: id, name: body.name, dueDate: new Date(body.dueDate), status: body.status || "pending", notes: body.notes },
  });
  return NextResponse.json(milestone, { status: 201 });
}
