export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string; pairId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const user = session.user as any;
  const { runId, pairId } = await params;
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
