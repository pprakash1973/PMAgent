export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, clusterId, industry, region, accountOwner, status } = body;

  const updated = await prisma.client.update({
    where: { id },
    data: { name, clusterId, industry, region, accountOwner, status },
    include: { cluster: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const programCount = await prisma.program.count({ where: { clientId: id, deletedAt: null } });
  if (programCount > 0) {
    return NextResponse.json({ error: { code: "NOT_EMPTY", message: "Remove all programs before deleting this client" } }, { status: 409 });
  }

  const projectCount = await prisma.project.count({ where: { clientId: id, deletedAt: null } });
  if (projectCount > 0) {
    return NextResponse.json({ error: { code: "NOT_EMPTY", message: "Unassign all projects before deleting this client" } }, { status: 409 });
  }

  await prisma.client.update({ where: { id }, data: { deletedAt: new Date(), status: "inactive" } });
  return NextResponse.json({ ok: true });
}
