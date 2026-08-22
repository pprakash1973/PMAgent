export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; resourceId: string }> }) {
  const { id, resourceId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();
  const resource = await prisma.projectResource.update({
    where: { id: resourceId },
    data: {
      name: body.name,
      role: body.role,
      email: body.email || null,
      allocationPct: body.allocationPct ?? 100,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      ratePerDay: body.ratePerDay ? Number(body.ratePerDay) : null,
      skills: body.skills || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(resource);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; resourceId: string }> }) {
  const { id, resourceId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  // Unassign tasks before deleting
  await prisma.scheduleTask.updateMany({ where: { resourceId }, data: { resourceId: null } });
  await prisma.projectResource.delete({ where: { id: resourceId } });
  return NextResponse.json({ ok: true });
}
