export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, type, clusterLead, description, status } = body;

  const updated = await prisma.cluster.update({
    where: { id },
    data: { name, type, clusterLead, description, status },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const clientCount = await prisma.client.count({ where: { clusterId: id, deletedAt: null } });
  if (clientCount > 0) {
    return NextResponse.json({ error: { code: "NOT_EMPTY", message: "Remove all clients before deleting this cluster" } }, { status: 409 });
  }

  await prisma.cluster.update({ where: { id }, data: { deletedAt: new Date(), status: "inactive" } });
  return NextResponse.json({ ok: true });
}
