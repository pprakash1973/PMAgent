import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Add N working days (Mon–Fri) to a date
function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

interface WPTask {
  wbsCode: string;
  name: string;
  phase: string;
  owner: string;
  estimatedDays: number;
  dependencies: string[];
}

// Topological sort: returns task wbsCodes in dependency order
function topoSort(tasks: WPTask[]): string[] {
  const codeSet = new Set(tasks.map((t) => t.wbsCode));
  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};

  for (const t of tasks) {
    inDegree[t.wbsCode] = inDegree[t.wbsCode] ?? 0;
    adj[t.wbsCode] = adj[t.wbsCode] ?? [];
    for (const dep of t.dependencies) {
      if (!codeSet.has(dep) || dep === t.wbsCode) continue;
      adj[dep] = adj[dep] ?? [];
      adj[dep].push(t.wbsCode);
      inDegree[t.wbsCode] = (inDegree[t.wbsCode] ?? 0) + 1;
    }
  }

  const queue = tasks.filter((t) => (inDegree[t.wbsCode] ?? 0) === 0).map((t) => t.wbsCode);
  const result: string[] = [];

  while (queue.length > 0) {
    const code = queue.shift()!;
    result.push(code);
    for (const next of adj[code] ?? []) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // Append any remaining (cycles) in original order
  for (const t of tasks) {
    if (!result.includes(t.wbsCode)) result.push(t.wbsCode);
  }

  return result;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Find latest WBS artifact
  const wbsArtifact = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType: "work_breakdown_structure" },
    orderBy: { updatedAt: "desc" },
  });

  if (!wbsArtifact?.content) {
    return NextResponse.json(
      { error: "No WBS artifact found. Generate the WBS first." },
      { status: 422 }
    );
  }

  const wbs = wbsArtifact.content as any;
  const phases: any[] = wbs.phases ?? [];

  // Flatten to work packages
  const allTasks: WPTask[] = [];
  for (const phase of phases) {
    for (const deliverable of phase.deliverables ?? []) {
      for (const wp of deliverable.workPackages ?? []) {
        allTasks.push({
          wbsCode: String(wp.id ?? wp.wbsCode ?? ""),
          name: String(wp.name ?? ""),
          phase: String(phase.name ?? ""),
          owner: String(wp.owner ?? ""),
          estimatedDays: Number(wp.estimatedDays ?? 1),
          dependencies: Array.isArray(wp.dependencies) ? wp.dependencies.map(String) : [],
        });
      }
    }
  }

  if (allTasks.length === 0) {
    return NextResponse.json({ error: "WBS has no work packages to schedule." }, { status: 422 });
  }

  const projectStart = project.startDate ? new Date(project.startDate) : new Date();

  // Sort topologically
  const order = topoSort(allTasks);
  const taskByCode: Record<string, WPTask> = {};
  for (const t of allTasks) taskByCode[t.wbsCode] = t;

  // Forward-pass CPM: finish[code] = earliest finish date
  const finish: Record<string, Date> = {};
  const start: Record<string, Date> = {};

  for (const code of order) {
    const t = taskByCode[code];
    if (!t) continue;

    const depFinish = t.dependencies
      .filter((d) => d !== code && finish[d])
      .map((d) => finish[d].getTime());

    const taskStart = depFinish.length > 0
      ? new Date(Math.max(...depFinish))
      : new Date(projectStart);

    // Align to next working day if taskStart is weekend
    while (taskStart.getDay() === 0 || taskStart.getDay() === 6) {
      taskStart.setDate(taskStart.getDate() + 1);
    }

    start[code] = taskStart;
    finish[code] = addWorkingDays(taskStart, t.estimatedDays);
  }

  // Delete existing schedule and rebuild
  await prisma.scheduleTask.deleteMany({ where: { projectId: id } });

  const rows = order
    .map((code, i) => {
      const t = taskByCode[code];
      if (!t || !start[code] || !finish[code]) return null;
      return {
        projectId: id,
        wbsCode: t.wbsCode,
        name: t.name,
        phase: t.phase,
        owner: t.owner,
        sortOrder: i,
        baselineStart: start[code],
        baselineFinish: finish[code],
        baselineDays: t.estimatedDays,
        dependencies: t.dependencies,
        percentComplete: 0,
        status: "not_started",
      };
    })
    .filter(Boolean) as any[];

  await prisma.scheduleTask.createMany({ data: rows });

  const created = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ tasks: created, count: created.length }, { status: 201 });
}
