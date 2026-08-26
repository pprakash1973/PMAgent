export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

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
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

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
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    // SEC: enforce tenant boundary — see lib/project-access.ts
    const _acc = await requireProjectAccess((await params).id);
    if (_acc.error) return _acc.error;

    const { id: projectId } = await params;
    const db = prisma as any;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    let data: z.infer<typeof generateSchema>;
    try {
      data = generateSchema.parse(body);
    } catch (e: any) {
      return NextResponse.json({ error: e.errors?.[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
    }

    const holidays = new Set((data.holidays ?? []).map((d: string) => d.slice(0, 10)));

    await db.cadenceConfig.create({
      data: {
        projectId,
        sprintLengthWeeks: data.sprintLengthWeeks,
        cadenceStart: start,
        holidays: data.holidays ?? [],
        defaultCapacity: data.plannedCapacityPointsPerSprint,
      },
    });

    if (data.overwrite) {
      await db.sprint.deleteMany({ where: { projectId, state: "planned" } });
    }

    const sprintDays = data.sprintLengthWeeks * 7;
    const sprints = [];
    let current = new Date(start);

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

      let availableDays = 0;
      const d = new Date(sprintStart);
      while (d <= sprintEnd) {
        const day = d.getDay();
        const dateStr = d.toISOString().slice(0, 10);
        if (day !== 0 && day !== 6 && !holidays.has(dateStr)) availableDays++;
        d.setDate(d.getDate() + 1);
      }

      const num = nextNumber++;
      sprints.push({
        projectId,
        sprintNumber: num,
        label: `Sprint ${num}`,
        startDate: sprintStart,
        endDate: sprintEnd,
        state: "planned",
        status: "planned",
        availableDays,
        plannedCapacityPoints: data.plannedCapacityPointsPerSprint,
      });

      current = new Date(sprintEnd);
      current.setDate(current.getDate() + 1);
    }

    const created = await Promise.all(
      sprints.map(s => db.sprint.create({ data: s }))
    );

    return NextResponse.json({ created: created.length, sprints: created }, { status: 201 });
  } catch (e: any) {
    console.error("Cadence POST error:", e);
    return NextResponse.json({ error: e.message ?? "Internal error" }, { status: 500 });
  }
}
