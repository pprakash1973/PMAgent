export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
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
