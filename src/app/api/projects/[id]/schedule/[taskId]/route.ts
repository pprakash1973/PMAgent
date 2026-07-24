import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// After any task update, recompute portfolio SPI and auto-degrade project health
// if the schedule is at risk. Never auto-upgrades — only the PM/WSR can improve health.
async function syncProjectHealth(projectId: string) {
  const tasks = await prisma.scheduleTask.findMany({ where: { projectId } });
  if (tasks.length === 0) return;

  const now = Date.now();
  let pv = 0, ev = 0;
  for (const t of tasks) {
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;
    const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
    pv += t.baselineDays * plannedPct;
    ev += t.baselineDays * (t.percentComplete / 100);
  }

  if (pv === 0) return;
  const spi = ev / pv;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { healthStatus: true },
  });
  if (!project) return;

  // Degrade: SPI < 0.8 → red, SPI < 0.9 → at least amber. Never auto-upgrade.
  let newHealth: string | null = null;
  if (spi < 0.8 && project.healthStatus !== "red") {
    newHealth = "red";
  } else if (spi < 0.9 && project.healthStatus === "green") {
    newHealth = "amber";
  }

  if (newHealth) {
    await prisma.project.update({
      where: { id: projectId },
      data: { healthStatus: newHealth },
    });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, taskId } = await params;
  const body = await req.json();

  const task = await prisma.scheduleTask.findFirst({
    where: { id: taskId, projectId: id },
  });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const pct = typeof body.percentComplete === "number"
    ? Math.max(0, Math.min(100, Math.round(body.percentComplete)))
    : task.percentComplete;

  const status =
    pct === 100 ? "complete"
    : pct > 0 ? "in_progress"
    : "not_started";

  const data: any = { percentComplete: pct, status };
  if (body.actualStart) data.actualStart = new Date(body.actualStart);
  if (body.actualFinish) data.actualFinish = new Date(body.actualFinish);
  if (pct > 0 && !task.actualStart && !body.actualStart) data.actualStart = new Date();
  if (pct === 100 && !task.actualFinish && !body.actualFinish) data.actualFinish = new Date();
  if ("resourceId" in body) data.resourceId = body.resourceId || null;
  if ("estimatedHours" in body) data.estimatedHours = body.estimatedHours ? Number(body.estimatedHours) : null;
  if ("name" in body && typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("baselineDays" in body) data.baselineDays = Math.max(0, Number(body.baselineDays) || 0);
  if ("baselineStart" in body) data.baselineStart = new Date(body.baselineStart);
  if ("baselineFinish" in body) data.baselineFinish = new Date(body.baselineFinish);
  if ("status" in body && !("percentComplete" in body)) {
    data.status = body.status;
    delete data.percentComplete;
    delete data.status;
    data.status = body.status;
  }

  const updated = await prisma.scheduleTask.update({
    where: { id: taskId },
    data,
    include: { resource: { select: { id: true, name: true, role: true, email: true } } },
  });

  syncProjectHealth(id).catch(() => {});
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, taskId } = await params;

  const task = await prisma.scheduleTask.findFirst({ where: { id: taskId, projectId: id } });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.scheduleTask.delete({ where: { id: taskId } });
  return NextResponse.json({ deleted: true });
}
