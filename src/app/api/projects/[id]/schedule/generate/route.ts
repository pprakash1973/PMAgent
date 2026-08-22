import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

// Count working days (Mon–Fri) between two dates, inclusive
function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm") === "true";

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
  const hasAnyExplicitDeps = allTasks.some((t) => t.dependencies.length > 0);
  if (!hasAnyExplicitDeps && allTasks.length > 1) {
    const phaseOrder: string[] = [];
    const seen = new Set<string>();
    for (const t of allTasks) {
      if (!seen.has(t.phase)) { phaseOrder.push(t.phase); seen.add(t.phase); }
    }
    const byPhase: Record<string, WPTask[]> = {};
    for (const t of allTasks) {
      byPhase[t.phase] = byPhase[t.phase] ?? [];
      byPhase[t.phase].push(t);
    }
    for (let pi = 0; pi < phaseOrder.length; pi++) {
      const phaseTasks = byPhase[phaseOrder[pi]];
      for (let ti = 0; ti < phaseTasks.length; ti++) {
        if (phaseTasks[ti].dependencies.length > 0) continue;
        if (ti > 0) {
          phaseTasks[ti].dependencies = [phaseTasks[ti - 1].wbsCode];
        } else if (pi > 0) {
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
    const exact = roster.find(r => r.name.toLowerCase() === needle);
    if (exact) return exact.id;
    const partialName = roster.find(r => needle.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(needle));
    if (partialName) return partialName.id;
    const byRole = roster.find(r => r.role.toLowerCase().includes(needle) || needle.includes(r.role.toLowerCase()));
    if (byRole) return byRole.id;
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

  // Sort topologically and run CPM
  const order = topoSort(allTasks);
  const taskByCode: Record<string, WPTask> = {};
  for (const t of allTasks) taskByCode[t.wbsCode] = t;

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

    while (taskStart.getDay() === 0 || taskStart.getDay() === 6) {
      taskStart.setDate(taskStart.getDate() + 1);
    }

    start[code] = taskStart;
    finish[code] = addWorkingDays(taskStart, t.estimatedDays);
  }

  // ── End-date scaling: compress durations proportionally if CPM overruns project end ─
  if (project.endDate && allTasks.length > 0) {
    const projectEnd = new Date(project.endDate);
    const maxFinishTime = Math.max(...Object.values(finish).map((d) => d.getTime()));
    if (maxFinishTime > projectEnd.getTime()) {
      const availableDays = countWorkingDays(projectStart, projectEnd);
      const totalWbsDays = allTasks.reduce((s, t) => s + t.estimatedDays, 0);
      const scale = availableDays / Math.max(totalWbsDays, 1);
      for (const t of allTasks) {
        t.estimatedDays = Math.max(1, Math.round(t.estimatedDays * scale));
      }
      // Re-run CPM with scaled durations
      for (const key of Object.keys(start)) delete start[key];
      for (const key of Object.keys(finish)) delete finish[key];
      for (const code of order) {
        const t = taskByCode[code];
        if (!t) continue;
        const depFinish = t.dependencies
          .filter((d) => d !== code && finish[d])
          .map((d) => finish[d].getTime());
        const taskStart = depFinish.length > 0
          ? new Date(Math.max(...depFinish))
          : new Date(projectStart);
        while (taskStart.getDay() === 0 || taskStart.getDay() === 6) {
          taskStart.setDate(taskStart.getDate() + 1);
        }
        start[code] = taskStart;
        finish[code] = addWorkingDays(taskStart, t.estimatedDays);
      }
    }
  }

  // ── Load existing tasks for merge ──────────────────────────────────────────
  const existingTasks = await prisma.scheduleTask.findMany({
    where: { projectId: id },
  });
  const existingByCode = new Map(existingTasks.map(t => [t.wbsCode, t]));
  const newCodeSet = new Set(order.filter(c => taskByCode[c]));

  // ── Guardrail: warn when tasks have progress (user decision: warn-but-allow) ─
  const tasksWithProgress = existingTasks.filter(
    t => (t.percentComplete ?? 0) > 0 && t.status !== "descoped"
  );

  if (tasksWithProgress.length > 0 && !confirm) {
    return NextResponse.json({
      requiresConfirmation: true,
      tasksWithProgress: tasksWithProgress.map(t => ({
        wbsCode: t.wbsCode,
        name: t.name,
        percentComplete: t.percentComplete,
        status: t.status,
      })),
      message: `${tasksWithProgress.length} task(s) have recorded progress. Existing tasks will be preserved and only updated with new baseline dates. New tasks will be added and de-scoped tasks will be flagged. Proceed?`,
    }, { status: 409 });
  }

  // ── Handle orphan tasks (in DB but not in new WBS) ──────────────────────────
  for (const existing of existingTasks) {
    // Skip milestone tasks — handled separately below
    if (existing.wbsCode.startsWith("MS-")) continue;
    if (!newCodeSet.has(existing.wbsCode)) {
      if ((existing.percentComplete ?? 0) > 0) {
        // Has progress: flag as descoped, never delete
        await prisma.scheduleTask.update({
          where: { id: existing.id },
          data: { status: "descoped" },
        });
      } else {
        // No progress: remove cleanly
        await prisma.scheduleTask.delete({ where: { id: existing.id } });
      }
    }
  }

  // ── Upsert tasks from new WBS ───────────────────────────────────────────────
  for (let i = 0; i < order.length; i++) {
    const code = order[i];
    const t = taskByCode[code];
    if (!t || !start[code] || !finish[code]) continue;

    const existing = existingByCode.get(code);
    const hasProgress = existing && (existing.percentComplete ?? 0) > 0;

    if (existing) {
      if (hasProgress && existing.status !== "not_started") {
        // Preserve execution state: only update baseline dates + metadata
        await prisma.scheduleTask.update({
          where: { id: existing.id },
          data: {
            name: t.name,
            phase: t.phase,
            owner: t.owner,
            resourceId: matchResource(t.owner),
            sortOrder: i,
            baselineStart: start[code],
            baselineFinish: finish[code],
            baselineDays: t.estimatedDays,
            dependencies: t.dependencies,
          },
        });
      } else {
        // No progress: full reset to new baseline
        await prisma.scheduleTask.update({
          where: { id: existing.id },
          data: {
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
          },
        });
      }
    } else {
      // Completely new task from revised WBS
      await prisma.scheduleTask.create({
        data: {
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
        },
      });
    }
  }

  // ── Governance milestones: always delete and recreate (zero-progress markers) ─
  if (isGovernance && milestoneArtifact?.content) {
    await prisma.scheduleTask.deleteMany({
      where: { projectId: id, wbsCode: { startsWith: "MS-" } },
    });
    const mlContent = milestoneArtifact.content as any;
    const mlList: any[] = mlContent.milestones ?? [];
    const baseSort = order.length;
    for (let i = 0; i < mlList.length; i++) {
      const m = mlList[i];
      const dt = m.plannedDate ?? m.forecastDate ?? m.targetDate;
      if (!dt) continue;
      const d = new Date(dt);
      if (isNaN(d.getTime())) continue;
      await prisma.scheduleTask.create({
        data: {
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
        },
      });
    }
  }

  // ── Auto-create ProjectResource entries for WBS owners not already in roster ─
  {
    const uniqueOwners = [...new Set(allTasks.map((t) => t.owner).filter(Boolean))];
    const existingNames = new Set(roster.map((r) => r.name.toLowerCase()));
    const existingRoles = new Set(roster.map((r) => r.role.toLowerCase()));
    const added = new Set<string>();
    for (const owner of uniqueOwners) {
      const ownerLower = owner.toLowerCase();
      if (existingNames.has(ownerLower) || existingRoles.has(ownerLower) || added.has(ownerLower)) continue;
      await prisma.projectResource.create({
        data: {
          projectId: id,
          name: owner,
          role: owner,
          allocationPct: 100,
          startDate: project.startDate ?? projectStart,
          endDate: project.endDate ?? undefined,
        },
      });
      added.add(ownerLower);
    }
  }

  const created = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ tasks: created, count: created.length }, { status: 201 });
}
