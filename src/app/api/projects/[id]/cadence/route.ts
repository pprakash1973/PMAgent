export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const generateSchema = z.object({
  sprintLengthWeeks: z.number().min(1).max(8).default(2),
  startDate: z.string(),
  endDate: z.string(),
  plannedCapacityPointsPerSprint: z.number().optional(),
  holidays: z.array(z.string()).optional(),
  overwrite: z.boolean().default(false),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
  const db = prisma as any;

  const config = await db.cadenceConfig.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const sprintCount = await db.sprint.count({ where: { projectId } });

  return NextResponse.json({ config, sprintCount });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
  const db = prisma as any;

  const body = await req.json();
  const data = generateSchema.parse(body);

  const holidays = new Set((data.holidays ?? []).map((d: string) => d.slice(0, 10)));

  // Save cadence config
  await db.cadenceConfig.create({
    data: {
      projectId,
      sprintLengthWeeks: data.sprintLengthWeeks,
      cadenceStart: new Date(data.startDate),
      holidays: data.holidays ?? [],
      defaultCapacity: data.plannedCapacityPointsPerSprint,
    },
  });

  if (data.overwrite) {
    await db.sprint.deleteMany({ where: { projectId, state: "planned" } });
  }

  // Compute sprint boundaries deterministically
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  const sprintDays = data.sprintLengthWeeks * 7;

  const sprints = [];
  let current = new Date(start);
  let sprintNumber = 0;

  // Get existing sprint count for numbering offset
  const last = await db.sprint.findFirst({
    where: { projectId },
    orderBy: { sprintNumber: "desc" },
    select: { sprintNumber: true },
  });
  let nextNumber = (last?.sprintNumber ?? 0) + 1;

  while (current < end) {
    const sprintStart = new Date(current);
    const sprintEnd = new Date(current);
    sprintEnd.setDate(sprintEnd.getDate() + sprintDays - 1);

    if (sprintEnd > end) sprintEnd.setTime(end.getTime());

    // Count available days (exclude weekends + holidays)
    let availableDays = 0;
    const d = new Date(sprintStart);
    while (d <= sprintEnd) {
      const day = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);
      if (day !== 0 && day !== 6 && !holidays.has(dateStr)) availableDays++;
      d.setDate(d.getDate() + 1);
    }

    sprints.push({
      projectId,
      sprintNumber: nextNumber++,
      label: `Sprint ${nextNumber - 1}`,
      startDate: sprintStart,
      endDate: sprintEnd,
      state: "planned",
      status: "planned",
      availableDays,
      plannedCapacityPoints: data.plannedCapacityPointsPerSprint,
    });

    sprintNumber++;
    current = new Date(sprintEnd);
    current.setDate(current.getDate() + 1);
  }

  const created = await Promise.all(
    sprints.map(s => db.sprint.create({ data: s }))
  );

  return NextResponse.json({ created: created.length, sprints: created }, { status: 201 });
}
