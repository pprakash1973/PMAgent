import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Task = {
  id: string;
  name: string;
  phase: string;
  wbsCode: string | null;
  baselineStart: Date;
  baselineFinish: Date;
  baselineDays: number;
  estimatedHours: number | null;
  percentComplete: number;
  dependencies: string[];
  status: string;
};

type CpmNode = {
  id: string;
  duration: number; // working days
  preds: string[];
  es: number;
  ef: number;
  ls: number;
  lf: number;
  tf: number;
  ff: number;
  critical: boolean;
};

function workingDaysBetween(start: Date, finish: Date): number {
  const s = new Date(start);
  const f = new Date(finish);
  let days = 0;
  const cur = new Date(s);
  while (cur <= f) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, days);
}

function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function runCpm(tasks: Task[]): Map<string, CpmNode> {
  const nodes = new Map<string, CpmNode>();

  for (const t of tasks) {
    const duration = workingDaysBetween(t.baselineStart, t.baselineFinish);
    nodes.set(t.id, {
      id: t.id,
      duration,
      preds: t.dependencies ?? [],
      es: 0, ef: 0, ls: 0, lf: 0, tf: 0, ff: 0,
      critical: false,
    });
  }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const [id] of nodes) { inDegree.set(id, 0); adj.set(id, []); }
  for (const [id, n] of nodes) {
    for (const p of n.preds) {
      if (!nodes.has(p)) continue;
      adj.get(p)!.push(id);
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id); }
  const order: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const succ of adj.get(cur) ?? []) {
      const d = inDegree.get(succ)! - 1;
      inDegree.set(succ, d);
      if (d === 0) queue.push(succ);
    }
  }

  // Forward pass (ordinal day numbers, day 1 = project start)
  for (const id of order) {
    const n = nodes.get(id)!;
    let es = 1;
    for (const p of n.preds) {
      if (!nodes.has(p)) continue;
      es = Math.max(es, nodes.get(p)!.ef + 1);
    }
    n.es = es;
    n.ef = es + n.duration - 1;
  }

  const projectFinish = Math.max(...[...nodes.values()].map(n => n.ef));

  // Backward pass
  for (const id of [...order].reverse()) {
    const n = nodes.get(id)!;
    const succs = adj.get(id) ?? [];
    if (succs.length === 0) {
      n.lf = projectFinish;
    } else {
      n.lf = Math.min(...succs.filter(s => nodes.has(s)).map(s => nodes.get(s)!.ls - 1));
    }
    n.ls = n.lf - n.duration + 1;
    n.tf = n.lf - n.ef;
    // Free float
    const succEs = succs.filter(s => nodes.has(s)).map(s => nodes.get(s)!.es);
    n.ff = succEs.length > 0 ? Math.min(...succEs) - n.ef - 1 : projectFinish - n.ef;
    n.ff = Math.max(0, n.ff);
  }

  const minTf = Math.min(...[...nodes.values()].map(n => n.tf));
  for (const n of nodes.values()) { n.critical = n.tf === minTf; }

  return nodes;
}

const SKILL_SYSTEM = `You are a PMI-certified schedule analyst using the Critical Path Method (CPM).
You analyse project schedules, identify risks on the critical path, and recommend concrete PM actions.
Your analysis is factual, direct, and draws only from the computed CPM data provided.
Reference the PMI CPM standard (Wilkens 2006, PMBOK® Section 6) in your analysis.`;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });

  if (tasks.length === 0) {
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 404 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true, startDate: true, endDate: true },
  });

  const cpmNodes = runCpm(tasks as any);

  const criticalIds = [...cpmNodes.values()].filter(n => n.critical).map(n => n.id);
  const nearCriticalIds = [...cpmNodes.values()].filter(n => !n.critical && n.tf <= 2).map(n => n.id);

  const projectStart = project?.startDate ?? tasks[0].baselineStart;
  const maxEf = Math.max(...[...cpmNodes.values()].map(n => n.ef));
  const projectedEnd = addWorkingDays(new Date(projectStart), maxEf - 1);

  const floatTable = tasks
    .map(t => {
      const n = cpmNodes.get(t.id);
      if (!n) return null;
      return {
        id: t.id,
        name: t.name,
        phase: t.phase,
        duration: n.duration,
        tf: n.tf,
        ff: n.ff,
        critical: n.critical,
        nearCritical: !n.critical && n.tf <= 2,
        percentComplete: t.percentComplete,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.tf - b!.tf);

  const cpTasks = tasks.filter(t => criticalIds.includes(t.id));
  const nearCpTasks = tasks.filter(t => nearCriticalIds.includes(t.id));

  const prompt = `Project: ${project?.name ?? "Unknown"}
Project start: ${new Date(projectStart).toDateString()}
Projected end (forward pass): ${projectedEnd.toDateString()}

CRITICAL PATH (${criticalIds.length} tasks, 0 days total float):
${cpTasks.map(t => {
  const n = cpmNodes.get(t.id)!;
  return `- ${t.name} | Duration: ${n.duration}d | Progress: ${t.percentComplete}% | Phase: ${t.phase}`;
}).join("\n") || "(none)"}

NEAR-CRITICAL TASKS (float ≤ 2 days):
${nearCpTasks.map(t => {
  const n = cpmNodes.get(t.id)!;
  return `- ${t.name} | TF: ${n.tf}d | FF: ${n.ff}d | Progress: ${t.percentComplete}% | Phase: ${t.phase}`;
}).join("\n") || "(none)"}

TOP 5 LOWEST FLOAT (all tasks):
${floatTable.slice(0, 5).map(r => `- ${r!.name}: TF=${r!.tf}d, FF=${r!.ff}d, ${r!.percentComplete}% complete`).join("\n")}

Using the PMI Critical Path Method, provide a concise analysis covering:
1. Critical path summary and projected finish
2. Top 2-3 specific risks (name the tasks)
3. One crash option and one fast-track opportunity if feasible
4. Top recommended PM action for this week

Keep it under 200 words. Be specific and factual — reference task names from the data above.`;

  let narrative = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SKILL_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch {
    narrative = "Critical path computed. AI narrative unavailable — check your API connection.";
  }

  return NextResponse.json({
    criticalIds,
    nearCriticalIds,
    floatTable,
    projectedEnd: projectedEnd.toISOString(),
    cpDuration: maxEf,
    narrative,
  });
}
