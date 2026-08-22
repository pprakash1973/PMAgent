export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { generateBaselineSummary } from "@/lib/baseline-copilot";
import { requireProjectAccess } from "@/lib/project-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const { runId } = await req.json();

  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const result = await generateBaselineSummary(runId, id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[baseline-summary] failed:", err);
    return NextResponse.json({ error: "Summary generation failed." }, { status: 502 });
  }
}
