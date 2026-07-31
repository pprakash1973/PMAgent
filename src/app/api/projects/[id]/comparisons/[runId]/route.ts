export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { runId } = await params;
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
