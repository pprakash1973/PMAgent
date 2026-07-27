import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

type TransitionResult = { ok: boolean; response?: NextResponse };

export async function transition(
  actionItemId: string,
  actorId: string,
  actorRole: string,
  toStatus: string,
  extra?: {
    blockedReason?: string;
    pmResponse?: string;
    closureNote?: string;
    reason?: string;
  }
): Promise<TransitionResult> {
  const item = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  if (!item) return { ok: false, response: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };

  const fromStatus = item.status;

  // Guard: cancelled/closed items cannot transition further
  if (["cancelled", "closed"].includes(fromStatus)) {
    return { ok: false, response: NextResponse.json({ error: `Cannot transition from ${fromStatus}` }, { status: 409 }) };
  }

  // Role guards
  const pmTransitions = ["acknowledged", "in_progress", "blocked", "submitted"];
  const dmTransitions = ["closed", "cancelled"];

  if (pmTransitions.includes(toStatus) && !["pm", "admin"].includes(actorRole)) {
    // Only the assigned PM (or admin) can advance
    if (item.assignedToId !== actorId && actorRole !== "admin") {
      return { ok: false, response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
    }
  }

  if (dmTransitions.includes(toStatus) && !["dm", "dh", "admin"].includes(actorRole)) {
    return { ok: false, response: NextResponse.json({ error: "FORBIDDEN — only DM/DH/Admin can close or cancel" }, { status: 403 }) };
  }

  // Reject (DM closes back to in_progress) — special case
  if (toStatus === "in_progress" && ["dm", "dh", "admin"].includes(actorRole) && fromStatus === "submitted") {
    if (!extra?.reason?.trim()) {
      return { ok: false, response: NextResponse.json({ error: "Rejection requires a reason" }, { status: 422 }) };
    }
  }

  // Blocked requires reason
  if (toStatus === "blocked" && !extra?.blockedReason?.trim()) {
    return { ok: false, response: NextResponse.json({ error: "blocked_reason is required" }, { status: 422 }) };
  }

  // Submit requires PM response
  if (toStatus === "submitted" && !extra?.pmResponse?.trim()) {
    return { ok: false, response: NextResponse.json({ error: "pm_response is required" }, { status: 422 }) };
  }

  const now = new Date();
  const updateData: Record<string, any> = { status: toStatus };

  if (toStatus === "acknowledged") updateData.acknowledgedAt = now;
  if (toStatus === "submitted") { updateData.submittedAt = now; updateData.pmResponse = extra?.pmResponse; }
  if (toStatus === "closed") { updateData.closedAt = now; updateData.closedById = actorId; updateData.closureNote = extra?.closureNote ?? null; }
  if (toStatus === "blocked") updateData.blockedReason = extra?.blockedReason;
  if (toStatus === "cancelled") updateData.closedAt = now;

  await prisma.$transaction([
    prisma.actionItem.update({ where: { id: actionItemId }, data: updateData }),
    prisma.actionItemEvent.create({
      data: {
        actionItemId,
        actorId,
        fromStatus,
        toStatus,
        reason: extra?.reason ?? extra?.blockedReason ?? extra?.closureNote ?? null,
      },
    }),
  ]);

  const updated = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  return { ok: true, response: NextResponse.json({ actionItem: updated }) };
}
