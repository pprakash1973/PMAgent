export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateScheduleRecovery } from "@/lib/ai";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const user = session.user as any;

  const project = await prisma.project.findUnique({
    where: { id, orgId: user.orgId, deletedAt: null },
  });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });

  if (tasks.length === 0) {
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 400 });
  }

  const now = Date.now();
  const todayDate = new Date();
  let pv = 0, ev = 0;
  const overdueTasks: string[] = [];

  for (const t of tasks) {
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;
    const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
    pv += t.baselineDays * plannedPct;
    ev += t.baselineDays * (t.percentComplete / 100);
    if (t.percentComplete < 100 && new Date(t.baselineFinish) < todayDate) {
      overdueTasks.push(t.name);
    }
  }

  const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  if (spi === null || spi >= 0.8) {
    return NextResponse.json({ error: "SPI_OK" }, { status: 400 });
  }

  const sv = Math.round((ev - pv) * 10) / 10;

  const projectContext = {
    name: project.name,
    methodology: project.methodology,
    currentPhase: project.currentPhase,
    teamSize: project.teamSize,
    endDate: project.endDate,
    daysToDeadline: project.endDate
      ? Math.round((new Date(project.endDate).getTime() - Date.now()) / 86400000)
      : null,
  };

  const taskSummary = tasks.map(t => ({
    name: t.name,
    phase: t.phase,
    percentComplete: t.percentComplete,
    baselineDays: t.baselineDays,
    status: t.status,
  }));

  try {
    const recovery = await generateScheduleRecovery(
      projectContext,
      { pv: Math.round(pv * 10) / 10, ev: Math.round(ev * 10) / 10, sv, spi, overdueTasks: overdueTasks.length, overdueTaskNames: overdueTasks.slice(0, 5) },
      taskSummary
    );
    return NextResponse.json(recovery);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
