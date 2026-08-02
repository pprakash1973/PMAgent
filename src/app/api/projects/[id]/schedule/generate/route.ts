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
    where: { projectId: id, artifactType: "wbs" },
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

  const isGovernance = project.engagementMode === "high_level";

  // Flatten tasks — Governance: deliverable level (week-snapped); Detailed: work packages
  const allTasks: WPTask[] = [];
  if (isGovernance) {
    // One task per deliverable, duration snapped up to nearest week (5 working days)
    for (const phase of phases) {
      for (const deliverable of phase.deliverables ?? []) {
        // Sum work package days or fall back to deliverable-level estimate
        const rawDays = deliverable.workPackages?.reduce(
          (sum: number, wp: any) => sum + Number(wp.estimatedDays ?? 5), 0
        ) ?? Number(deliverable.estimatedDays ?? 5);
        // Snap up to nearest week
        const weeks = Math.max(1, Math.ceil(rawDays / 5));
        allTasks.push({
          wbsCode: String(deliverable.id ?? deliverable.wbsCode ?? ""),
          name: String(deliverable.name ?? ""),
          phase: String(phase.name ?? ""),
          owner: String(deliverable.owner ?? phase.owner ?? ""),
          estimatedDays: weeks * 5,
          dependencies: Array.isArray(deliverable.dependencies)
            ? deliverable.dependencies.map(String)
            : [],
        });
      }
    }
  } else {
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
  }

  // ── Phase-based implicit sequencing ─────────────────────────────────────────
  // When tasks carry no explicit dependencies (typical for AI-generated WBS),
  // inject phase-level finish-to-start links so phases execute sequentially
  // and tasks within the same phase run end-to-end rather than all on day 1.
  const hasAnyExplicitDeps = allTasks.some((t) => t.dependencies.length > 0);
  if (!hasAnyExplicitDeps && allTasks.length > 1) {
    // Collect unique phases in WBS order
    const phaseOrder: string[] = [];
    const seen = new Set<string>();
    for (const t of allTasks) {
      if (!seen.has(t.phase)) { phaseOrder.push(t.phase); seen.add(t.phase); }
    }
    // Group tasks by phase
    const byPhase: Record<string, WPTask[]> = {};
    for (const t of allTasks) {
      byPhase[t.phase] = byPhase[t.phase] ?? [];
      byPhase[t.phase].push(t);
    }
    // For each task with no deps: depend on previous task in same phase (serial within phase)
    // For the first task of each phase (except the first): depend on last task of prior phase
    for (let pi = 0; pi < phaseOrder.length; pi++) {
      const phaseTasks = byPhase[phaseOrder[pi]];
      for (let ti = 0; ti < phaseTasks.length; ti++) {
        if (phaseTasks[ti].dependencies.length > 0) continue; // respect explicit deps
        if (ti > 0) {
          // Depend on previous task in this phase → serial sequencing
          phaseTasks[ti].dependencies = [phaseTasks[ti - 1].wbsCode];
        } else if (pi > 0) {
          // First task of this phase depends on the last task of the previous phase
          const prevPhaseTasks = byPhase[phaseOrder[pi - 1]];
          const lastInPrev = prevPhaseTasks[prevPhaseTasks.length - 1];
          phaseTasks[ti].dependencies = [lastInPrev.wbsCode];
        }
      }
    }
  }

  if (allTasks.length === 0) {
    return NextResponse.json({
      error: isGovernance
        ? "WBS has no deliverables to schedule."
        : "WBS has no work packages to schedule.",
    }, { status: 422 });
  }

  // In Governance mode also pull milestones to append as zero-day markers
  const milestoneArtifact = isGovernance
    ? await prisma.artifact.findFirst({ where: { projectId: id, artifactType: "milestone_plan" }, orderBy: { updatedAt: "desc" } })
    : null;

  const projectStart = project.startDate ? new Date(project.startDate) : new Date();

  // Fetch resource roster for assignment matching
  const roster = await prisma.projectResource.findMany({ where: { projectId: id } });

  function matchResource(owner: string): string | null {
    if (!owner || roster.length === 0) return null;
    const needle = owner.toLowerCase().trim();
    // 1. Exact name match
    const exact = roster.find(r => r.name.toLowerCase() === needle);
    if (exact) return exact.id;
    // 2. Substring match on name (bidirectional)
    const partialName = roster.find(r => needle.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(needle));
    if (partialName) return partialName.id;
    // 3. Substring match on role (bidirectional)
    const byRole = roster.find(r => r.role.toLowerCase().includes(needle) || needle.includes(r.role.toLowerCase()));
    if (byRole) return byRole.id;
    // 4. Word-level overlap on role: any meaningful word (>2 chars) in needle appears in role or vice versa
    const needleWords = needle.split(/\s+/).filter(w => w.length > 2);
    if (needleWords.length > 0) {
      const byWordOverlap = roster.find(r => {
        const roleWords = r.role.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        return needleWords.some(nw => roleWords.some((rw: string) => rw.includes(nw) || nw.includes(rw)));
      });
      if (byWordOverlap) return byWordOverlap.id;
    }
    return null;
  }

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
        resourceId: matchResource(t.owner),
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

  // In Governance mode, append milestones as zero-day marker tasks
  if (isGovernance && milestoneArtifact?.content) {
    const mlContent = milestoneArtifact.content as any;
    const mlList: any[] = mlContent.milestones ?? [];
    const baseSort = rows.length;
    for (let i = 0; i < mlList.length; i++) {
      const m = mlList[i];
      const dt = m.plannedDate ?? m.forecastDate ?? m.targetDate;
      if (!dt) continue;
      const d = new Date(dt);
      if (isNaN(d.getTime())) continue; // skip milestones with non-ISO dates like "TBD"
      rows.push({
        projectId: id,
        wbsCode: `MS-${i + 1}`,
        name: String(m.name ?? `Milestone ${i + 1}`),
        phase: "Milestones",
        owner: m.owner ?? "",
        resourceId: null,
        sortOrder: baseSort + i,
        baselineStart: d,
        baselineFinish: d,
        baselineDays: 0,
        dependencies: [],
        percentComplete: 0,
        status: "not_started",
      } as any);
    }
  }

  await prisma.scheduleTask.createMany({ data: rows });

  const created = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ tasks: created, count: created.length }, { status: 201 });
}
