import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  status:         z.enum(["acknowledged", "in_progress", "resolved", "withdrawn"]),
  resolutionNote: z.string().optional(),
  withdrawalReason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  const data = parsed.data;

  const esc = await prisma.escalation.findUnique({ where: { id } });
  if (!esc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission: withdrawn can only be done by raiser
  if (data.status === "withdrawn" && esc.raisedById !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Only the raiser can withdraw" }, { status: 403 });
  }
  // Resolved requires a note
  if (data.status === "resolved" && (!data.resolutionNote || data.resolutionNote.length < 20)) {
    return NextResponse.json({ error: "Resolution note must be at least 20 characters" }, { status: 400 });
  }
  // Withdrawn requires a reason
  if (data.status === "withdrawn" && !data.withdrawalReason) {
    return NextResponse.json({ error: "Withdrawal reason is required" }, { status: 400 });
  }
  // Can only withdraw from open or acknowledged
  if (data.status === "withdrawn" && !["open", "acknowledged"].includes(esc.status)) {
    return NextResponse.json({ error: "Can only withdraw open or acknowledged escalations" }, { status: 400 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: data.status, updatedAt: now };

  if (data.status === "acknowledged") {
    updateData.acknowledgedById = user.id;
    updateData.acknowledgedAt = now;
  } else if (data.status === "resolved") {
    updateData.resolvedById = user.id;
    updateData.resolvedAt = now;
    updateData.resolutionNote = data.resolutionNote;
  } else if (data.status === "withdrawn") {
    updateData.withdrawnAt = now;
    updateData.withdrawalReason = data.withdrawalReason;
  }

  const before = { status: esc.status };
  const updated = await prisma.escalation.update({ where: { id }, data: updateData as any });

  await prisma.auditLog.create({
    data: {
      orgId:    user.orgId,
      userId:   user.id,
      action:   "ESCALATION_STATUS_CHANGED",
      entity:   "Escalation",
      entityId: id,
      before,
      after:    { status: data.status },
    },
  }).catch(() => {});

  return NextResponse.json({ escalation: updated });
}
