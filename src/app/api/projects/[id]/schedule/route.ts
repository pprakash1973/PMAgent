import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function computeEVM(tasks: any[]) {
  const today = Date.now();
  let totalPV = 0;
  let totalEV = 0;

  for (const t of tasks) {
    const planned = t.baselineDays;
    const s = new Date(t.baselineStart).getTime();
    // For PV: use actualFinish when task is complete, otherwise baselineFinish
    const effectiveFinish = t.percentComplete === 100 && t.actualFinish
      ? new Date(t.actualFinish).getTime()
      : new Date(t.baselineFinish).getTime();
    const dur = effectiveFinish - s;

    let plannedPct: number;
    if (today <= s) plannedPct = 0;
    else if (today >= effectiveFinish) plannedPct = 1;
    else plannedPct = dur > 0 ? (today - s) / dur : 0;

    totalPV += planned * plannedPct;
    totalEV += planned * (t.percentComplete / 100);
  }

  const spi = totalPV > 0 ? totalEV / totalPV : null;
  const sv = totalEV - totalPV; // in task-days

  return {
    pv: Math.round(totalPV * 10) / 10,
    ev: Math.round(totalEV * 10) / 10,
    sv: Math.round(sv * 10) / 10,
    spi: spi !== null ? Math.round(spi * 100) / 100 : null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
    include: { resource: { select: { id: true, name: true, role: true, email: true } } },
  });

  const kpi = computeEVM(tasks);

  return NextResponse.json({ tasks, kpi });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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
