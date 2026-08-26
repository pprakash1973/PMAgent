export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeImpact } from "@/lib/impact-engine";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id, runId } = await params;
  const db = prisma as any;

  const report = await db.impactReport.findUnique({ where: { runId } });
  if (!report) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(report);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id, runId } = await params;

  const run = await (prisma as any).comparisonRun.findUnique({
    where: { id: runId },
    select: { id: true, projectId: true },
  });
  if (!run || run.projectId !== id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const result = await computeImpact(runId, id);
  return NextResponse.json(result, { status: 201 });
}
