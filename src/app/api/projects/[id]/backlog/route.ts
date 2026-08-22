export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  level: z.enum(["epic", "feature", "story", "task"]).default("story"),
  itemType: z.enum(["story", "defect", "spike", "enabler", "chore"]).default("story"),
  points: z.number().optional(),
  parentId: z.string().optional(),
  sprintId: z.string().optional(),
  disposition: z.enum([
    "in_scope", "deferred", "out_of_scope", "conditional",
    "illustrative", "negated", "undetermined",
  ]).default("in_scope"),
  priorityRank: z.number().optional(),
  externalRef: z.string().optional(),
  externalUrl: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level");
  const sprintId = searchParams.get("sprintId");
  const state = searchParams.get("state");
  const unassigned = searchParams.get("unassigned") === "true";

  const db = prisma as any;

  const where: Record<string, unknown> = { projectId };
  if (level) where.level = level;
  if (state) where.state = state;
  if (sprintId) where.sprintId = sprintId;
  if (unassigned) where.sprintId = null;

  const items = await db.backlogItem.findMany({
    where,
    orderBy: [{ priorityRank: "asc" }, { createdAt: "asc" }],
    include: {
      children: {
        select: {
          id: true, title: true, level: true, itemType: true,
          state: true, points: true, sprintId: true,
        },
        orderBy: { priorityRank: "asc" },
      },
    },
  });

  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;
  const user = access.user;

  const db = prisma as any;

  const body = await req.json();
  const data = createSchema.parse(body);

  const item = await db.backlogItem.create({
    data: {
      projectId,
      title: data.title,
      description: data.description,
      acceptanceCriteria: data.acceptanceCriteria,
      level: data.level,
      itemType: data.itemType,
      type: data.itemType,  // legacy field
      points: data.points,
      storyPoints: data.points ? Math.round(data.points) : undefined,  // legacy field
      parentId: data.parentId,
      sprintId: data.sprintId,
      disposition: data.disposition,
      priorityRank: data.priorityRank,
      externalRef: data.externalRef,
      externalUrl: data.externalUrl,
      state: "todo",
      status: "todo",
    },
  });

  // Write history row
  await db.backlogItemHistory.create({
    data: {
      backlogItemId: item.id,
      field: "created",
      oldValue: null,
      newValue: item.title,
      changeClass: "scope_add",
      changedBy: user.id,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
