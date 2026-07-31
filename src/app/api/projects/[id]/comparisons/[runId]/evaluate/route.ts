export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateAccuracy } from "@/lib/accuracy-evaluator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { runId } = await params;
  const db = prisma as any;

  const report = await db.accuracyReport.findUnique({ where: { runId } });
  if (!report) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(report);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, runId } = await params;

  const db = prisma as any;
  const run = await db.comparisonRun.findUnique({ where: { id: runId }, select: { projectId: true } });
  if (!run || run.projectId !== id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const result = await evaluateAccuracy(runId, id);
  return NextResponse.json(result, { status: 201 });
}
