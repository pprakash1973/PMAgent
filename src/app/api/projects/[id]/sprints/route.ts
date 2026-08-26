export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

const createSchema = z.object({
  goal: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  plannedCapacityPoints: z.number().optional(),
  cadenceConfigId: z.string().optional(),
  releaseId: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id } = await params;
  const db = prisma as any;

  const sprints = await db.sprint.findMany({
    where: { projectId: id },
    include: {
      backlogItems: {
        select: { id: true, title: true, state: true, points: true, itemType: true },
      },
      ceremonies: { select: { id: true, type: true, scheduledAt: true, heldAt: true } },
    },
    orderBy: { sprintNumber: "asc" },
  });

  return NextResponse.json(sprints);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id: projectId } = await params;
  const db = prisma as any;

  const body = await req.json();
  const data = createSchema.parse(body);

  // Auto-number the next sprint
  const last = await db.sprint.findFirst({
    where: { projectId },
    orderBy: { sprintNumber: "desc" },
    select: { sprintNumber: true },
  });
  const sprintNumber = (last?.sprintNumber ?? 0) + 1;

  const sprint = await db.sprint.create({
    data: {
      projectId,
      sprintNumber,
      label: `Sprint ${sprintNumber}`,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      goal: data.goal,
      plannedCapacityPoints: data.plannedCapacityPoints,
      cadenceConfigId: data.cadenceConfigId,
      releaseId: data.releaseId,
      state: "planned",
      status: "planned",
    },
  });

  return NextResponse.json(sprint, { status: 201 });
}
