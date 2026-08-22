import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  reviewType: z.enum(["weekly_review", "ad_hoc", "escalation_prep", "gate_review", "handover_review"]),
  body: z.string().min(10).max(3000),
  visibility: z.enum(["shared_with_pm", "dm_only"]).default("dm_only"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

  if (!["dm", "pgm", "admin", "dh"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const note = await prisma.dmReviewNote.create({
    data: {
      projectId: id,
      authorId: user.id,
      reviewType: parsed.data.reviewType,
      body: parsed.data.body,
      visibility: parsed.data.visibility,
    },
    include: { author: { select: { fullName: true } } },
  });

  return NextResponse.json({
    id: note.id,
    reviewType: note.reviewType,
    body: note.body,
    visibility: note.visibility,
    createdAt: note.createdAt.toISOString(),
    authorName: note.author.fullName,
  }, { status: 201 });
}
