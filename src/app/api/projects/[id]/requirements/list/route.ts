export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const requirements = await prisma.requirement.findMany({
    where: { projectId: id },
    include: {
      sourceChunk: { select: { text: true, sectionTitle: true, pageNumber: true } },
    },
    orderBy: { requirementKey: "asc" },
  });

  return NextResponse.json(requirements);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const { requirementId, action, amendedStatement } = await req.json();
  if (!requirementId || !action) return NextResponse.json({ error: "requirementId and action required" }, { status: 400 });

  const req_ = await prisma.requirement.findFirst({ where: { id: requirementId, projectId: id } });
  if (!req_) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let status: string;
  if (action === "confirm") status = "confirmed";
  else if (action === "reject") status = "rejected";
  else if (action === "amend") status = "confirmed";
  else return NextResponse.json({ error: "action must be confirm|reject|amend" }, { status: 400 });

  const updated = await prisma.requirement.update({
    where: { id: requirementId },
    data: {
      status,
      confirmedById: user.id,
      confirmedAt: new Date(),
      ...(action === "amend" && amendedStatement ? { amendedStatement } : {}),
    },
  });

  return NextResponse.json(updated);
}
