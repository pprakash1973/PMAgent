export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; resourceId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { resourceId } = await params;
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { resourceId } = await params;
  // Unassign tasks before deleting
  await prisma.scheduleTask.updateMany({ where: { resourceId }, data: { resourceId: null } });
  await prisma.projectResource.delete({ where: { id: resourceId } });
  return NextResponse.json({ ok: true });
}
