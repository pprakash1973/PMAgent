import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  const milestones = await prisma.milestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } });
  return NextResponse.json(milestones);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const milestone = await prisma.milestone.create({
    data: { projectId: id, name: body.name, dueDate: new Date(body.dueDate), status: body.status || "pending", notes: body.notes },
  });
  return NextResponse.json(milestone, { status: 201 });
}
