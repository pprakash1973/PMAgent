export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, description, sponsor, status, dmIds } = body;

  const updated = await prisma.program.update({
    where: { id },
    data: { name, description, sponsor, status },
  });

  if (dmIds !== undefined) {
    await prisma.programAssignment.deleteMany({ where: { programId: id } });
    if (dmIds.length) {
      await prisma.programAssignment.createMany({
        data: dmIds.map((uid: string) => ({
          programId: id,
          userId: uid,
          assignedBy: (user as any).id,
        })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const projectCount = await prisma.project.count({ where: { programId: id, deletedAt: null } });
  if (projectCount > 0) {
    return NextResponse.json({ error: { code: "NOT_EMPTY", message: "Remove all projects before deleting this program" } }, { status: 409 });
  }

  await prisma.programAssignment.deleteMany({ where: { programId: id } });
  await prisma.program.update({ where: { id }, data: { deletedAt: new Date(), status: "closed" } });
  return NextResponse.json({ ok: true });
}
