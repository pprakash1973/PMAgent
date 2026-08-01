export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ceremonyId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { ceremonyId } = await params;
  const db = prisma as any;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.heldAt !== undefined) data.heldAt = body.heldAt ? new Date(body.heldAt) : null;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.durationMin !== undefined) data.durationMin = body.durationMin;
  if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

  const ceremony = await db.ceremony.update({ where: { id: ceremonyId }, data });
  return NextResponse.json(ceremony);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ceremonyId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { ceremonyId } = await params;
  const db = prisma as any;
  await db.ceremony.delete({ where: { id: ceremonyId } });
  return NextResponse.json({ ok: true });
}
