export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const db = prisma as any;

  const entry = await db.comparisonGoldEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.projectId !== id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.comparisonGoldEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
