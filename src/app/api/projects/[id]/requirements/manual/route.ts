export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const { statement } = await req.json();
  if (!statement?.trim()) return NextResponse.json({ error: "statement required" }, { status: 400 });

  // Auto-generate next REQ-NNN key
  const existing = await prisma.requirement.findMany({
    where: { projectId: id },
    select: { requirementKey: true },
  });
  const maxNum = existing.reduce((max, r) => {
    const m = r.requirementKey.match(/\d+$/);
    return m ? Math.max(max, parseInt(m[0], 10)) : max;
  }, 0);
  const requirementKey = `REQ-${String(maxNum + 1).padStart(3, "0")}`;

  const created = await prisma.requirement.create({
    data: {
      projectId: id,
      requirementKey,
      statement: statement.trim(),
      source: "manual",
      status: "confirmed",
      isActive: true,
      confirmedById: user.id,
      confirmedAt: new Date(),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
