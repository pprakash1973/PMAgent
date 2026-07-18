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
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;

    let plannedPct: number;
    if (today <= s) plannedPct = 0;
    else if (today >= f) plannedPct = 1;
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
