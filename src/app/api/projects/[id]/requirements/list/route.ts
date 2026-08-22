export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const requirements = await prisma.requirement.findMany({
    where: { projectId: id },
    include: {
      sourceChunk: {
        select: {
          text: true, sectionTitle: true, pageNumber: true,
          document: { select: { id: true, fileName: true } },
        },
      },
    },
    orderBy: { requirementKey: "asc" },
  });

  return NextResponse.json(requirements);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

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
