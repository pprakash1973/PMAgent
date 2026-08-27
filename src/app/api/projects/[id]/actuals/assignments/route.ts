export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

// GET /api/projects/[id]/actuals/assignments — get task-resource assignments
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;


  const assignments = await prisma.taskAssignment.findMany({
    where: { projectId },
    include: {
      task: { select: { id: true, wbsCode: true, name: true, phase: true } },
      resource: { select: { id: true, name: true, role: true, email: true } },
    },
  });

  return NextResponse.json(assignments);
}

// POST /api/projects/[id]/actuals/assignments — assign a resource to a task
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;

  const body = await req.json();
  const { taskId, resourceId, role } = body;

  if (!taskId || !resourceId) {
    return NextResponse.json({ error: "taskId and resourceId required" }, { status: 400 });
  }

  const assignment = await prisma.taskAssignment.upsert({
    where: { taskId_resourceId: { taskId, resourceId } },
    create: { taskId, resourceId, projectId, role: role || null },
    update: { role: role || null },
    include: {
      task: { select: { id: true, wbsCode: true, name: true } },
      resource: { select: { id: true, name: true, role: true, email: true } },
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}

// DELETE /api/projects/[id]/actuals/assignments — remove an assignment
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;

  const body = await req.json();
  const { taskId, resourceId } = body;

  await prisma.taskAssignment.deleteMany({
    where: { taskId, resourceId, projectId },
  });

  return NextResponse.json({ ok: true });
}
