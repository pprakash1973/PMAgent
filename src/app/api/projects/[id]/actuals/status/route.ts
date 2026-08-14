export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/projects/[id]/actuals/status
// Returns per-task actuals status for the latest open cycle (or most recent cycle).
// Used by the schedule tab to show collection indicators on task rows.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;

  // Find latest cycle (prefer open, fall back to most recent)
  const cycle = await prisma.collectionCycle.findFirst({
    where: { projectId },
    orderBy: [{ status: "asc" }, { cycleNumber: "desc" }], // "open" sorts before "closed"
    select: {
      id: true,
      cycleNumber: true,
      label: true,
      status: true,
      startDate: true,
      endDate: true,
      taskIds: true,
      tokens: {
        select: {
          id: true,
          resourceId: true,
          status: true,
          emailSentAt: true,
        },
      },
      actuals: {
        select: {
          taskId: true,
          resourceId: true,
          hoursWorked: true,
          percentComplete: true,
          disposition: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!cycle) return NextResponse.json({ cycle: null, taskStatus: {} });

  // Build per-task status map
  // taskStatus[taskId] = { collected: bool, submittedCount: number, pendingCount: number }
  const taskStatus: Record<string, {
    collected: boolean;
    submittedCount: number;
    pendingCount: number;
    latestEntry: { hoursWorked: number; percentComplete: number; disposition: string } | null;
  }> = {};

  const cycleTaskIds: string[] = Array.isArray(cycle.taskIds) ? cycle.taskIds as string[] : [];

  // Initialise entries for all tasks in this cycle
  for (const taskId of cycleTaskIds) {
    taskStatus[taskId] = { collected: false, submittedCount: 0, pendingCount: 0, latestEntry: null };
  }

  // Count actual submissions per task
  for (const actual of cycle.actuals) {
    if (!taskStatus[actual.taskId]) {
      taskStatus[actual.taskId] = { collected: false, submittedCount: 0, pendingCount: 0, latestEntry: null };
    }
    taskStatus[actual.taskId].submittedCount++;
    taskStatus[actual.taskId].collected = true;
    taskStatus[actual.taskId].latestEntry = {
      hoursWorked: actual.hoursWorked,
      percentComplete: actual.percentComplete,
      disposition: actual.disposition,
    };
  }

  // Count pending tokens (email sent, not yet submitted) for tasks in cycle
  const submittedResourceIds = new Set(
    cycle.tokens.filter((t) => t.status === "submitted").map((t) => t.resourceId)
  );
  const pendingResourceIds = new Set(
    cycle.tokens.filter((t) => t.status === "pending" && t.emailSentAt).map((t) => t.resourceId)
  );

  // Mark pending: tasks in cycle with at least one resource that hasn't submitted
  for (const taskId of cycleTaskIds) {
    if (!taskStatus[taskId]) continue;
    if (!taskStatus[taskId].collected && pendingResourceIds.size > 0) {
      taskStatus[taskId].pendingCount = pendingResourceIds.size;
    }
  }

  return NextResponse.json({
    cycle: {
      id: cycle.id,
      cycleNumber: cycle.cycleNumber,
      label: cycle.label,
      status: cycle.status,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      taskIds: cycleTaskIds,
      totalResources: cycle.tokens.length,
      submittedResources: submittedResourceIds.size,
    },
    taskStatus,
  });
}
