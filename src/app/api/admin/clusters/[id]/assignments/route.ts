export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const assignSchema = z.object({
  userId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

/** GET  /api/admin/clusters/[id]/assignments */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const assignments = await prisma.clusterAssignment.findMany({
    where: { clusterId: id },
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
  });

  return NextResponse.json(assignments);
}

/** POST /api/admin/clusters/[id]/assignments — add or update a DH assignment */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id: clusterId } = await params;
  const body = await req.json();
  const { userId, isPrimary } = assignSchema.parse(body);

  if (isPrimary) {
    // Demote existing primary first
    await prisma.clusterAssignment.updateMany({
      where: { clusterId, isPrimary: true },
      data: { isPrimary: false },
    });
    await prisma.cluster.update({ where: { id: clusterId }, data: { primaryDhId: userId } });
  }

  const assignment = await prisma.clusterAssignment.upsert({
    where: { clusterId_userId: { clusterId, userId } },
    create: { clusterId, userId, isPrimary, assignedBy: (admin as any).id },
    update: { isPrimary, assignedBy: (admin as any).id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });

  return NextResponse.json(assignment, { status: 201 });
}

/** DELETE /api/admin/clusters/[id]/assignments?userId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: clusterId } = await params;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: { code: "MISSING_PARAM", message: "userId required" } }, { status: 400 });

  await prisma.clusterAssignment.delete({ where: { clusterId_userId: { clusterId, userId } } });

  // If deleted user was primary, clear the denormalised field
  const cluster = await prisma.cluster.findUnique({ where: { id: clusterId }, select: { primaryDhId: true } });
  if (cluster?.primaryDhId === userId) {
    await prisma.cluster.update({ where: { id: clusterId }, data: { primaryDhId: null } });
  }

  return NextResponse.json({ ok: true });
}
