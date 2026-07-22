import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { body } = await req.json().catch(() => ({ body: "" }));
  if (!body || body.trim().length < 2) {
    return NextResponse.json({ error: "Comment body required" }, { status: 400 });
  }

  const esc = await prisma.escalation.findUnique({ where: { id }, select: { id: true } });
  if (!esc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comment = await prisma.escalationComment.create({
    data: { escalationId: id, userId: user.id, body: body.trim() },
    include: { user: { select: { fullName: true } } },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
