export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

const createSchema = z.object({
  type: z.enum(["planning", "daily_standup", "review", "retrospective", "refinement", "other"]),
  sprintId: z.string().optional(),
  scheduledAt: z.string().optional(),
  durationMinutes: z.number().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;

  const { searchParams } = new URL(req.url);
  const sprintId = searchParams.get("sprintId");
  const db = prisma as any;

  const where: Record<string, unknown> = { projectId };
  if (sprintId) where.sprintId = sprintId;

  const ceremonies = await db.ceremony.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json(ceremonies);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;

  const db = prisma as any;
  const body = await req.json();
  const data = createSchema.parse(body);

  const ceremony = await db.ceremony.create({
    data: {
      projectId,
      sprintId: data.sprintId,
      type: data.type,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      durationMinutes: data.durationMinutes,
    },
  });

  return NextResponse.json(ceremony, { status: 201 });
}
