export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id, entryId } = await params;
  const db = prisma as any;

  const entry = await db.comparisonGoldEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.projectId !== id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.comparisonGoldEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
