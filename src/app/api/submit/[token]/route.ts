export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { submissionsPayloadSchema, computeAllowedTaskIds } from "@/lib/submit-validation";

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

  // Only expose tasks this resource is authorised to see for this cycle.
  // Never falls back to the full project task list (prevents info disclosure).
  const allowedTaskIds = await computeAllowedTaskIds({
    projectId: record.projectId,
    resourceId: record.resourceId,
    cycleTaskIds,
  });

  const tasks = allowedTaskIds.size === 0
    ? []
    : await prisma.scheduleTask.findMany({
        where: {
          projectId: record.projectId,
          id: { in: Array.from(allowedTaskIds) },
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

  // Rate limit by token (single-use anyway) and by client IP, to stop a leaked
  // token being hammered to corrupt task data before it flips to "submitted".
  const rlToken = checkRateLimit(`submit:${tokenHash}`, 10, 10 * 60 * 1000);
  if (!rlToken.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const rlIp = checkRateLimit(`submit-ip:${getClientIp(req.headers)}`, 30, 10 * 60 * 1000);
  if (!rlIp.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

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

  // Validate the payload shape and bounds (rejects negative/NaN/Infinity/oversized
  // values and unknown disposition strings).
  const body = await req.json().catch(() => null);
  const parsed = submissionsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission data", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 }
    );
  }
  const { submissions } = parsed.data;

  // Authorization: the resource may only submit for tasks they own in this cycle.
  const cycleTaskIds: string[] = Array.isArray(cycle.taskIds) ? cycle.taskIds as string[] : [];
  const allowedTaskIds = await computeAllowedTaskIds({
    projectId: record.projectId,
    resourceId: record.resourceId,
    cycleTaskIds,
  });
  const unauthorized = submissions.filter((s) => !allowedTaskIds.has(s.taskId));
  if (unauthorized.length > 0) {
    return NextResponse.json(
      { error: "You are not assigned to one or more of the submitted tasks." },
      { status: 403 }
    );
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

  // Aggregate total hoursWorked per task from the full ledger (including what we just wrote)
  const taskIds = submissions.map((s) => s.taskId);
  const ledgerTotals = await prisma.taskActualsLedger.groupBy({
    by: ["taskId"],
    where: { taskId: { in: taskIds } },
    _sum: { hoursWorked: true },
  });
  const totalHoursMap = new Map(ledgerTotals.map((r) => [r.taskId, r._sum.hoursWorked ?? 0]));

  // Update ScheduleTask with the reported actuals and cumulative actual hours
  await prisma.$transaction(
    submissions.map((s) => {
      const pct = Math.min(100, Math.max(0, Math.round(s.percentComplete)));
      const newStatus = pct === 100 ? "complete" : pct > 0 ? "in_progress" : "not_started";
      const totalHours = totalHoursMap.get(s.taskId) ?? s.hoursWorked;
      return prisma.scheduleTask.update({
        where: { id: s.taskId },
        data: {
          percentComplete: pct,
          status: newStatus,
          actualHours: Math.round(totalHours * 10) / 10,
          ...(pct === 100 ? { actualFinish: new Date() } : {}),
          ...(pct > 0 ? { actualStart: new Date() } : {}),
        },
      });
    })
  );

  // Mark token as used (single-use)
  await prisma.collectionToken.update({
    where: { id: record.id },
    data: { status: "submitted", usedAt: new Date() },
  });

  return NextResponse.json({ ok: true, entriesCreated: entries.length });
}
