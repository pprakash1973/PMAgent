export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { anthropic } from "@/lib/ai";

function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return d;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await params;

  const body = await req.json();
  const { command, tasks } = body as { command: string; tasks: any[] };

  if (!command?.trim()) return NextResponse.json({ error: "command is required" }, { status: 400 });
  if (!Array.isArray(tasks) || tasks.length === 0) return NextResponse.json({ error: "tasks array is required" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  const taskSummary = tasks.map(t => ({
    id: t.id,
    name: t.name,
    phase: t.phase,
    wbsCode: t.wbsCode,
    baselineStart: toISO(new Date(t.baselineStart)),
    baselineFinish: toISO(new Date(t.baselineFinish)),
    baselineDays: t.baselineDays,
    percentComplete: t.percentComplete,
    status: t.status,
    resource: t.resource?.name ?? null,
  }));

  const systemPrompt = `You are a project schedule assistant. Today is ${today}.
You receive a list of schedule tasks and a PM's natural-language command.
You must return a JSON object with:
- "summary": one sentence describing what you will change and why
- "patches": array of field-level changes, each with:
  { "taskId": string, "taskName": string, "field": string, "oldValue": string, "newValue": string }

Supported fields: "baselineStart" (ISO date), "baselineFinish" (ISO date), "baselineDays" (number as string), "percentComplete" (0-100 as string), "status" ("not_started"|"in_progress"|"complete"|"at_risk"|"blocked")

Rules:
- When shifting a phase, shift ALL tasks in that phase by the same number of working days
- When shifting dates, also update baselineDays if the duration changes
- Dates must be ISO format YYYY-MM-DD
- Only patch fields that actually change
- If the command asks for information (e.g. "who is overloaded"), return patches: [] and put the answer in summary
- Never invent task IDs — only use IDs from the provided list
- Return valid JSON only, no markdown`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `Tasks:\n${JSON.stringify(taskSummary, null, 2)}\n\nCommand: ${command}`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";

  let parsed: { summary: string; patches: any[] };
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    parsed = JSON.parse(fenced ? fenced[1] : text);
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON. Try rephrasing your command." }, { status: 500 });
  }

  if (!Array.isArray(parsed.patches)) parsed.patches = [];

  // Validate patch taskIds against the provided task list
  const taskIds = new Set(tasks.map((t: any) => t.id));
  parsed.patches = parsed.patches.filter((p: any) => taskIds.has(p.taskId));

  return NextResponse.json({
    summary: parsed.summary ?? "Done.",
    patches: parsed.patches,
  });
}
