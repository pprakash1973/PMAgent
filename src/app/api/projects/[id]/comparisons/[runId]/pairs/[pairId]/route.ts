export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string; pairId: string }> }
) {
  const { id, runId, pairId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

  const db = prisma as any;

  const pair = await db.comparisonPair.findUnique({ where: { id: pairId }, select: { runId: true } });
  if (!pair || pair.runId !== runId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { overrideReason, temporalClass, dispositionClass } = await req.json();

  const updated = await db.comparisonPair.update({
    where: { id: pairId },
    data: {
      ...(temporalClass && { temporalClass }),
      ...(dispositionClass !== undefined && { dispositionClass }),
      overrideBy: user.id,
      overrideAt: new Date(),
      overrideReason: overrideReason ?? null,
    },
  });

  return NextResponse.json(updated);
}
