export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; snapId: string }> }
) {
  const { id, snapId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const db = prisma as any;

  const snapshot = await db.pmbSnapshot.findUnique({
    where: { id: snapId },
    select: { id: true, projectId: true },
  });
  if (!snapshot || snapshot.projectId !== id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await db.pmbSnapshot.updateMany({ where: { projectId: id, isCurrent: true }, data: { isCurrent: false } });
  const updated = await db.pmbSnapshot.update({
    where: { id: snapId },
    data: { isCurrent: true },
  });

  return NextResponse.json(updated);
}
