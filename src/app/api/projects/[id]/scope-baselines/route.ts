export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const baselines = await (prisma as any).scopeBaseline.findMany({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });
  return NextResponse.json(baselines);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const label = body.label as string | undefined;

  // Fetch active requirements for snapshot
  const activeReqs = await prisma.requirement.findMany({
    where: { projectId: id, isActive: true, status: { not: "rejected" } },
    select: { id: true, requirementKey: true, statement: true, source: true, sourceDocId: true },
    orderBy: { requirementKey: "asc" },
  });

  // Fetch previous baseline to compute removedSnapshot
  const prevBaseline = await (prisma as any).scopeBaseline.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });

  const version = prevBaseline ? prevBaseline.version + 1 : 1;
  let baselineLabel = label;
  if (!baselineLabel) {
    baselineLabel = `${id}_BL_V${version}`;
  }

  const snapshot = activeReqs.map(r => ({
    requirementId: r.id,
    requirementKey: r.requirementKey,
    statement: r.statement,
    source: r.source,
  }));

  // Diff against previous baseline to find removed requirements
  let removedSnapshot: unknown[] = [];
  let addedKeys: string[] = [];
  if (prevBaseline) {
    const prevSnapshot = (prevBaseline.snapshot as any[]) ?? [];
    const prevKeys = new Set(prevSnapshot.map((r: any) => r.requirementKey));
    const currKeys = new Set(snapshot.map(r => r.requirementKey));

    removedSnapshot = prevSnapshot
      .filter((r: any) => !currKeys.has(r.requirementKey))
      .map((r: any) => ({ ...r, removedInVersion: version }));

    addedKeys = snapshot
      .filter(r => !prevKeys.has(r.requirementKey))
      .map(r => r.requirementKey);
  }

  // Fetch current WBS tasks and milestones for AI delta generation
  const [scheduleTasks, milestones] = await Promise.all([
    prisma.scheduleTask.findMany({
      where: { projectId: id },
      select: { wbsCode: true, name: true, phase: true, percentComplete: true, status: true },
      orderBy: { sortOrder: "asc" },
      take: 50,
    }),
    prisma.milestone.findMany({
      where: { projectId: id },
      select: { id: true, name: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  // Generate WBS/Schedule delta via AI if there are changes
  let impactSummary: Record<string, unknown> | null = null;
  const hasChanges = (removedSnapshot as any[]).length > 0 || addedKeys.length > 0;

  if (hasChanges) {
    try {
      const addedReqs = snapshot.filter(r => addedKeys.includes(r.requirementKey));
      const removedReqs = removedSnapshot as any[];

      const prompt = `You are a PMO AI assisting a project manager in analysing the impact of scope changes on the project WBS and Schedule.

Current WBS tasks (max 50):
${scheduleTasks.length ? scheduleTasks.map(t => `- [${t.wbsCode}] ${t.name} (${t.phase}, ${t.percentComplete}% complete, ${t.status})`).join("\n") : "(No WBS tasks defined yet)"}

Current milestones:
${milestones.length ? milestones.map(m => `- ${m.name}: ${new Date(m.dueDate).toDateString()} (${m.status})`).join("\n") : "(No milestones defined yet)"}

Requirements being ADDED to scope (${addedReqs.length}):
${addedReqs.map(r => `- ${r.requirementKey}: ${r.statement}`).join("\n") || "(none)"}

Requirements being REMOVED from scope (${removedReqs.length}):
${removedReqs.map((r: any) => `- ${r.requirementKey}: ${r.statement}`).join("\n") || "(none)"}

Analyse the impact on the WBS and Schedule. Return ONLY valid JSON with no explanation:
{
  "wbsDelta": [
    {
      "action": "add",
      "workPackageName": "...",
      "phase": "...",
      "linkedReqKey": "REQ-XXX",
      "estimatedDays": 5,
      "note": "..."
    },
    {
      "action": "flag",
      "workPackageName": "existing WBS task name to flag as out-of-scope",
      "linkedReqKey": "REQ-XXX",
      "progressPct": 0,
      "note": "Reason PM should review this"
    }
  ],
  "scheduleDelta": [
    {
      "action": "add_milestone",
      "milestoneName": "...",
      "linkedReqKey": "REQ-XXX",
      "estimatedDaysFromEnd": 10,
      "note": "..."
    },
    {
      "action": "shift_advisory",
      "affectedMilestone": "existing milestone name",
      "estimatedDaysDelta": 5,
      "note": "Why this milestone may need to shift"
    }
  ],
  "overallRisk": "low|medium|high",
  "summary": "One sentence impact summary for the PM"
}

Only include items that are genuinely impacted. An empty wbsDelta or scheduleDelta array is fine if there is no impact.`;

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      try {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        impactSummary = JSON.parse(fenced ? fenced[1] : text);
      } catch {
        impactSummary = { wbsDelta: [], scheduleDelta: [], overallRisk: "low", summary: "Unable to parse AI analysis." };
      }
    } catch {
      impactSummary = { wbsDelta: [], scheduleDelta: [], overallRisk: "low", summary: "Impact analysis unavailable." };
    }
  }

  const baseline = await (prisma as any).scopeBaseline.create({
    data: {
      projectId: id,
      version,
      label: baselineLabel,
      snapshot,
      removedSnapshot,
      impactSummary,
      requirementCount: activeReqs.length,
      deltaReviewed: !hasChanges,
      createdById: user.id,
    },
  });

  return NextResponse.json(baseline, { status: 201 });
}
