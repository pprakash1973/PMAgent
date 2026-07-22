import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CAN_REASSIGN = ["pgm", "admin"];

const schema = z.object({
  projectId:     z.string().min(1),
  newPmId:       z.string().min(1),
  reason:        z.string().min(10),
  effectiveFrom: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || !CAN_REASSIGN.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    select: { id: true, name: true, pmOwnerId: true, programId: true, orgId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope check for pgm
  if (user.role === "pgm" && project.programId) {
    const assignment = await prisma.programAssignment.findFirst({
      where: { userId: user.id, programId: project.programId },
    });
    if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate new PM
  const newPm = await prisma.user.findUnique({
    where: { id: data.newPmId },
    select: {
      id: true, fullName: true, role: true,
      ownedProjects: {
        where: { deletedAt: null, status: { not: "archived" } },
        select: { id: true },
      },
    },
  });
  if (!newPm || newPm.role !== "pm") {
    return NextResponse.json({ error: "Target user is not a Project Manager" }, { status: 400 });
  }
  if (newPm.id === project.pmOwnerId) {
    return NextResponse.json({ error: "Target is already the current PM" }, { status: 400 });
  }
  if (newPm.ownedProjects.length >= 2) {
    return NextResponse.json({ error: "PM is at the 2-project limit", code: "AT_LIMIT" }, { status: 422 });
  }

  const effectiveFrom = data.effectiveFrom ? new Date(data.effectiveFrom) : new Date();
  const outgoingPmId = project.pmOwnerId;

  // Close current assignment history row
  if (outgoingPmId) {
    await prisma.projectPmAssignment.updateMany({
      where: { projectId: data.projectId, userId: outgoingPmId, effectiveTo: null },
      data:  { effectiveTo: effectiveFrom },
    }).catch(() => {});
  }

  // Write new assignment history row
  await prisma.projectPmAssignment.create({
    data: {
      projectId:    data.projectId,
      userId:       data.newPmId,
      assignedBy:   user.id,
      reason:       data.reason,
      effectiveFrom,
    },
  });

  // Transfer ownership
  await prisma.project.update({
    where: { id: data.projectId },
    data:  { pmOwnerId: data.newPmId },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      orgId:    project.orgId,
      userId:   user.id,
      action:   "PROJECT_REASSIGNED_PM",
      entity:   "Project",
      entityId: data.projectId,
      before:   { pmOwnerId: outgoingPmId },
      after:    { pmOwnerId: data.newPmId, reason: data.reason },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, newPmName: newPm.fullName });
}
