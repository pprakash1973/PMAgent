import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

// EVM engine — ZERO_HUNDRED method (per PMI spec and PMO policy):
//   PV: credit full BAC for each task whose planned finish is today or in the past.
//   EV: credit full BAC for each task that is 100 % complete (date-independent).
//   AC: total actual hours logged across ALL tasks, regardless of completion status.
// Both PV and EV use the same method — method mismatch would measure the reporting
// convention rather than the project, violating the fundamental EV invariant.
function computeEVM(tasks: any[]) {
  // End of today in ms so tasks finishing today count as "due".
  const todayMs = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); })();

  let pv = 0, ev = 0, ac = 0;

  for (const t of tasks) {
    // BAC: prefer estimatedHours; fall back to baselineDays × 8 for effort-less tasks.
    const bac = (t.estimatedHours != null && t.estimatedHours > 0)
      ? Number(t.estimatedHours)
      : (t.baselineDays ?? 0) * 8;

    if (!bac || !t.baselineFinish) continue;

    const finishMs = new Date(t.baselineFinish).getTime();
    if (isNaN(finishMs)) continue;

    // PV — ZERO_HUNDRED planned fraction
    if (finishMs <= todayMs) pv += bac;

    // EV — ZERO_HUNDRED earned fraction (date-free)
    if ((t.percentComplete ?? 0) >= 100) ev += bac;

    // AC — all logged hours irrespective of task status
    ac += Number(t.actualHours ?? 0);
  }

  const r = (n: number) => Math.round(n * 10) / 10;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const safeDiv = (num: number, den: number): number | null => den === 0 ? null : num / den;

  const spi = safeDiv(ev, pv);
  const sv  = ev - pv;

  return {
    pv:  r(pv),
    ev:  r(ev),
    ac:  r(ac),
    sv:  r(sv),
    spi: spi !== null ? r2(spi) : null,
    totalActualEffort: r(ac),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id } = await params;

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
    include: { resource: { select: { id: true, name: true, role: true, email: true } } },
  });

  // Aggregate actual hours from the ledger — ScheduleTask has no actualHours column,
  // so we derive it here from all hoursWorked entries per task.
  const ledgerTotals = await prisma.taskActualsLedger.groupBy({
    by: ["taskId"],
    where: { taskId: { in: tasks.map(t => t.id) } },
    _sum: { hoursWorked: true },
  });
  const actualHoursMap = new Map(ledgerTotals.map(r => [r.taskId, r._sum.hoursWorked ?? 0]));

  const tasksWithActuals = tasks.map(t => ({
    ...t,
    actualHours: actualHoursMap.get(t.id) ?? 0,
  }));

  const kpi = computeEVM(tasksWithActuals);

  return NextResponse.json({ tasks: tasksWithActuals, kpi });
}

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

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json();
  const name = String(body.name ?? "New task").trim();
  const phase = String(body.phase ?? "General");
  const baselineStart = body.baselineStart ? new Date(body.baselineStart) : (project.startDate ?? new Date());
  const baselineDays = Math.max(1, Number(body.baselineDays ?? 5));

  function addWorkingDays(start: Date, days: number): Date {
    const d = new Date(start);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d;
  }

  const baselineFinish = addWorkingDays(new Date(baselineStart), baselineDays);

  const maxSort = await prisma.scheduleTask.aggregate({ where: { projectId: id }, _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  const task = await prisma.scheduleTask.create({
    data: {
      projectId: id,
      name,
      phase,
      wbsCode: `T-${sortOrder}`,
      baselineStart: new Date(baselineStart),
      baselineFinish,
      baselineDays,
      dependencies: [],
      sortOrder,
      percentComplete: 0,
      status: "not_started",
    },
    include: { resource: { select: { id: true, name: true, role: true, email: true } } },
  });

  return NextResponse.json(task, { status: 201 });
}
