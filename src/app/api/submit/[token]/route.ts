export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

// GET /api/submit/[token] — validate token and return task info (no auth)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.collectionToken.findUnique({
    where: { tokenHash },
    include: {
      resource: { select: { id: true, name: true, role: true } },
      project: { select: { id: true, name: true } },
      cycle: { select: { id: true, cycleNumber: true, label: true, startDate: true, endDate: true, status: true, taskIds: true } },
    },
  });

  if (!record) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (record.status === "submitted") return NextResponse.json({ error: "Already submitted", alreadySubmitted: true }, { status: 409 });
  if (record.status === "expired" || record.expiresAt < new Date()) {
    if (record.status !== "expired") {
      await prisma.collectionToken.update({ where: { id: record.id }, data: { status: "expired" } });
    }
    return NextResponse.json({ error: "Link has expired", expired: true }, { status: 410 });
  }
  if (record.cycle.status !== "open") {
    return NextResponse.json({ error: "Collection cycle is closed", cycleClosed: true }, { status: 403 });
  }

  // Cycle-level task filter (PM selected specific tasks when creating the cycle)
  const cycleTaskIds: string[] = Array.isArray(record.cycle.taskIds) ? record.cycle.taskIds as string[] : [];

  // Resource-level task filter (explicit assignments + direct resource link)
  const assignments = await prisma.taskAssignment.findMany({
    where: { resourceId: record.resourceId, projectId: record.projectId },
    select: { taskId: true },
  });
  const directTasks = await prisma.scheduleTask.findMany({
    where: { resourceId: record.resourceId, projectId: record.projectId },
    select: { id: true },
  });
  const resourceTaskIds = new Set([
    ...assignments.map((a) => a.taskId),
    ...directTasks.map((t) => t.id),
  ]);

  // Intersect: cycle selection ∩ resource assignments (or union if no assignments)
  let taskFilter: string[] | undefined;
  if (cycleTaskIds.length > 0 && resourceTaskIds.size > 0) {
    taskFilter = cycleTaskIds.filter((id) => resourceTaskIds.has(id));
    if (taskFilter.length === 0) taskFilter = cycleTaskIds; // fall back to cycle selection
  } else if (cycleTaskIds.length > 0) {
    taskFilter = cycleTaskIds;
  } else if (resourceTaskIds.size > 0) {
    taskFilter = Array.from(resourceTaskIds);
  }

  const tasks = await prisma.scheduleTask.findMany({
    where: {
      projectId: record.projectId,
      ...(taskFilter ? { id: { in: taskFilter } } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    tokenId: record.id,
    resource: record.resource,
    project: record.project,
    cycle: record.cycle,
    tasks,
  });
}

// POST /api/submit/[token] — submit actuals (no auth)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.collectionToken.findUnique({
    where: { tokenHash },
  });

  if (!record) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (record.status === "submitted") return NextResponse.json({ error: "Already submitted", alreadySubmitted: true }, { status: 409 });
  if (record.status === "expired" || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  const cycle = await prisma.collectionCycle.findUnique({ where: { id: record.cycleId } });
  if (!cycle || cycle.status !== "open") {
    return NextResponse.json({ error: "Collection cycle is closed" }, { status: 403 });
  }

  const body = await req.json();
  const { submissions } = body as {
    submissions: Array<{
      taskId: string;
      hoursWorked: number;
      percentComplete: number;
      etcHours?: number;
      disposition: string;
      notes?: string;
    }>;
  };

  if (!Array.isArray(submissions) || submissions.length === 0) {
    return NextResponse.json({ error: "submissions array required" }, { status: 400 });
  }

  // Write to append-only ledger
  const entries = await prisma.$transaction(
    submissions.map((s) =>
      prisma.taskActualsLedger.create({
        data: {
          projectId: record.projectId,
          taskId: s.taskId,
          resourceId: record.resourceId,
          cycleId: record.cycleId,
          tokenId: record.id,
          hoursWorked: s.hoursWorked,
          percentComplete: s.percentComplete,
          etcHours: s.etcHours ?? null,
          disposition: s.disposition,
          notes: s.notes ?? null,
        },
      })
    )
  );

  // Mark token as used (single-use)
  await prisma.collectionToken.update({
    where: { id: record.id },
    data: { status: "submitted", usedAt: new Date() },
  });

  return NextResponse.json({ ok: true, entriesCreated: entries.length });
}
