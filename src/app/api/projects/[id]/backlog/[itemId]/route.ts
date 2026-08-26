export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  points: z.number().optional(),
  sprintId: z.string().nullable().optional(),
  state: z.enum(["todo", "in_progress", "in_review", "done", "accepted", "removed"]).optional(),
  disposition: z.enum([
    "in_scope", "deferred", "out_of_scope", "conditional",
    "illustrative", "negated", "undetermined",
  ]).optional(),
  priorityRank: z.number().optional(),
  dorPassed: z.boolean().optional(),
  dodPassed: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
}).strict();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { itemId } = await params;
  const db = prisma as any;

  const item = await db.backlogItem.findUnique({
    where: { id: itemId },
    include: {
      children: { orderBy: { priorityRank: "asc" } },
      history: { orderBy: { changedAt: "desc" }, take: 20 },
    },
  });

  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { itemId } = await params;
  const db = prisma as any;
  const user = session.user as any;

  const body = await req.json();
  const data = patchSchema.parse(body);

  const existing = await db.backlogItem.findUnique({ where: { id: itemId } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Stamp acceptedAt when moving to "accepted"
  const updateData: Record<string, unknown> = { ...data };
  if (data.state === "accepted" && existing.state !== "accepted") {
    updateData.acceptedAt = new Date();
    updateData.acceptedBy = user.id;
  }

  const item = await db.backlogItem.update({
    where: { id: itemId },
    data: updateData,
  });

  // Write history row for each changed field
  const trackedFields = ["state", "points", "sprintId", "disposition", "title"];
  for (const field of trackedFields) {
    if (field in data && String(existing[field]) !== String((data as any)[field])) {
      await db.backlogItemHistory.create({
        data: {
          backlogItemId: itemId,
          field,
          oldValue: String(existing[field] ?? ""),
          newValue: String((data as any)[field] ?? ""),
          changeClass: field === "state" ? "state_change"
            : field === "points" ? "repoint"
            : field === "sprintId" ? "reassign"
            : "update",
          changedBy: user.id,
        },
      });
    }
  }

  return NextResponse.json(item);
}

// POST to /backlog/:itemId — accept the item (convenience route)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { itemId } = await params;
  const db = prisma as any;
  const user = session.user as any;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "accept") {
    const item = await db.backlogItem.update({
      where: { id: itemId },
      data: { state: "accepted", status: "accepted", acceptedAt: new Date(), acceptedBy: user.id, dodPassed: true },
    });
    await db.backlogItemHistory.create({
      data: {
        backlogItemId: itemId,
        field: "state",
        oldValue: "done",
        newValue: "accepted",
        changeClass: "acceptance",
        changedBy: user.id,
      },
    });
    return NextResponse.json(item);
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
