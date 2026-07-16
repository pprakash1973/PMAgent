import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { entryId } = await params;
  await prisma.costEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { entryId } = await params;
  const body = await req.json();
  const entry = await prisma.costEntry.update({
    where: { id: entryId },
    data: {
      ...(body.date && { date: new Date(body.date) }),
      ...(body.amount != null && { amount: Number(body.amount) }),
      ...(body.category && { category: body.category }),
      ...(body.description !== undefined && { description: body.description }),
    },
  });
  return NextResponse.json(entry);
}
