import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount:      z.number().positive().max(999_999_999).optional(),
  category:    z.enum(["labor", "material", "overhead", "travel", "other"]).optional(),
  description: z.string().max(500).optional(),
}).strict();

async function resolveAndAuthorize(projectId: string, entryId: string, orgId: string) {
  const entry = await prisma.costEntry.findUnique({
    where: { id: entryId },
    select: { id: true, projectId: true },
  });
  if (!entry || entry.projectId !== projectId) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) return null;
  return entry;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const { id, entryId } = await params;

  const entry = await resolveAndAuthorize(id, entryId, user.orgId);
  if (!entry) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.costEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const { id, entryId } = await params;

  const entry = await resolveAndAuthorize(id, entryId, user.orgId);
  if (!entry) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", detail: parsed.error.issues[0]?.message }, { status: 400 });

  const updated = await prisma.costEntry.update({
    where: { id: entryId },
    data: {
      ...(parsed.data.date        && { date: new Date(parsed.data.date) }),
      ...(parsed.data.amount      != null && { amount: parsed.data.amount }),
      ...(parsed.data.category    && { category: parsed.data.category }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    },
  });
  return NextResponse.json(updated);
}
