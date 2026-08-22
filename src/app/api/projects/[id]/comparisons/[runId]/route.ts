export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id, runId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const db = prisma as any;

  const run = await db.comparisonRun.findUnique({
    where: { id: runId },
    include: {
      pairs: {
        include: {
          leftItem:  { select: { id: true, normalizedTitle: true, normalizedDesc: true, rawText: true, attributes: true, sequence: true, declaredId: true } },
          rightItem: { select: { id: true, normalizedTitle: true, normalizedDesc: true, rawText: true, attributes: true, sequence: true, declaredId: true } },
        },
        orderBy: { temporalClass: "asc" },
      },
    },
  });

  if (!run) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(run);
}
