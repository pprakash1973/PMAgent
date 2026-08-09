export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, blId } = await params;

  const body = await req.json();
  // acceptedMilestones: Array<{ milestoneName, estimatedDaysFromEnd }>
  // reviewed: boolean (mark delta as reviewed)
  const { acceptedMilestones = [], reviewed = false } = body as {
    acceptedMilestones?: { milestoneName: string; estimatedDaysFromEnd?: number }[];
    reviewed?: boolean;
  };

  const baseline = await (prisma as any).scopeBaseline.findFirst({
    where: { id: blId, projectId: id },
  });
  if (!baseline) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const results: string[] = [];

  // Create accepted milestone records
  if (acceptedMilestones.length > 0) {
    const lastMilestone = await prisma.milestone.findFirst({
      where: { projectId: id },
      orderBy: { dueDate: "desc" },
    });
    const baseDate = lastMilestone?.dueDate ?? new Date();

    for (const m of acceptedMilestones) {
      const daysToAdd = m.estimatedDaysFromEnd ?? 14;
      const dueDate = new Date(baseDate);
      dueDate.setDate(dueDate.getDate() + daysToAdd);
      await prisma.milestone.create({
        data: {
          projectId: id,
          name: m.milestoneName,
          dueDate,
          status: "pending",
          notes: `Added via Scope Control — BL v${baseline.version}`,
        },
      });
      results.push(`Milestone created: ${m.milestoneName}`);
    }
  }

  // Mark delta as reviewed
  if (reviewed) {
    await (prisma as any).scopeBaseline.update({
      where: { id: blId },
      data: { deltaReviewed: true },
    });
  }

  return NextResponse.json({ ok: true, results });
}
