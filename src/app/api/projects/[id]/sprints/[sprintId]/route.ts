export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  goal: z.string().optional(),
  goalMet: z.enum(["yes", "partial", "no"]).optional(),
  state: z.enum(["planned", "active", "closed"]).optional(),
  committedPoints: z.number().optional(),
  acceptedPoints: z.number().optional(),
  carriedPoints: z.number().optional(),
  plannedCapacityPoints: z.number().optional(),
  availableDays: z.number().optional(),
  focusFactor: z.number().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { sprintId } = await params;
  const db = prisma as any;

  const sprint = await db.sprint.findUnique({
    where: { id: sprintId },
    include: {
      backlogItems: {
        orderBy: { priorityRank: "asc" },
        select: {
          id: true, title: true, state: true, points: true,
          itemType: true, level: true, acceptedAt: true,
          acceptedBy: true, dorPassed: true, dodPassed: true,
        },
      },
      ceremonies: true,
      retrospectiveActions: true,
      agileMetrics: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!sprint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(sprint);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { sprintId } = await params;
  const db = prisma as any;
  const body = await req.json();
  const data = updateSchema.parse(body);

  const user = session.user as any;

  const updateData: Record<string, unknown> = { ...data };

  // If closing the sprint, stamp closedAt + closedBy
  if (data.state === "closed") {
    updateData.closedAt = new Date();
    updateData.closedBy = user.id;
    updateData.status = "closed";
  } else if (data.state === "active") {
    updateData.status = "active";
  }

  const sprint = await db.sprint.update({
    where: { id: sprintId },
    data: updateData,
  });

  return NextResponse.json(sprint);
}
