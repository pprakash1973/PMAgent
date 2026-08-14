export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/projects/[id]/actuals/cycles/[cycleId] — cycle detail with submissions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cycleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId, cycleId } = await params;

  const cycle = await prisma.collectionCycle.findFirst({
    where: { id: cycleId, projectId },
    include: {
      tokens: {
        include: {
          resource: { select: { id: true, name: true, role: true, email: true } },
        },
      },
      actuals: {
        include: {
          task: { select: { id: true, wbsCode: true, name: true, phase: true, estimatedHours: true } },
          resource: { select: { id: true, name: true, role: true } },
        },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  return NextResponse.json(cycle);
}

// PATCH /api/projects/[id]/actuals/cycles/[cycleId] — close or update cycle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cycleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId, cycleId } = await params;
  const body = await req.json();

  const cycle = await prisma.collectionCycle.findFirst({
    where: { id: cycleId, projectId },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const updated = await prisma.collectionCycle.update({
    where: { id: cycleId },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.status === "closed" ? { closedAt: new Date() } : {}),
      ...(body.label ? { label: body.label } : {}),
    },
  });

  // Expire all pending tokens when cycle is closed
  if (body.status === "closed") {
    await prisma.collectionToken.updateMany({
      where: { cycleId, status: "pending" },
      data: { status: "expired" },
    });
  }

  return NextResponse.json(updated);
}
