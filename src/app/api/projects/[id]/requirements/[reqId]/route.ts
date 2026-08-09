export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, reqId } = await params;

  const body = await req.json();
  const { action, statement } = body;

  const existing = await prisma.requirement.findFirst({ where: { id: reqId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let data: Record<string, unknown> = {};

  if (action === "remove") {
    data = { isActive: false };
  } else if (action === "restore") {
    data = { isActive: true };
  } else if (action === "edit") {
    if (!statement?.trim()) return NextResponse.json({ error: "statement required" }, { status: 400 });
    data = { statement: statement.trim() };
  } else {
    return NextResponse.json({ error: "action must be remove|restore|edit" }, { status: 400 });
  }

  const updated = await prisma.requirement.update({ where: { id: reqId }, data });
  return NextResponse.json(updated);
}
