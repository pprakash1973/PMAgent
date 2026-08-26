export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateBaselineSummary } from "@/lib/baseline-copilot";
import { requireProjectAccess } from "@/lib/project-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id } = await params;
  const { runId } = await req.json();

  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const result = await generateBaselineSummary(runId, id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Summary generation failed" }, { status: 502 });
  }
}
