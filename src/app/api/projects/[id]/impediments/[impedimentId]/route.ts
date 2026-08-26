export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; impedimentId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { impedimentId } = await params;
  const db = prisma as any;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === "resolved") data.resolvedAt = new Date();
  }
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.description !== undefined) data.description = body.description;

  const impediment = await db.impediment.update({ where: { id: impedimentId }, data });
  return NextResponse.json(impediment);
}
