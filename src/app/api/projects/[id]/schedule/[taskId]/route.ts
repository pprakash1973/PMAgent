import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  const updated = await prisma.scheduleTask.update({
    where: { id: taskId },
    data,
  });

  return NextResponse.json(updated);
}
