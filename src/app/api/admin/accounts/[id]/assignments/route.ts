export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const assignSchema = z.object({
  userId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

/** GET  /api/admin/accounts/[id]/assignments */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const assignments = await prisma.accountAssignment.findMany({
    where: { accountId: id },
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
  });

  return NextResponse.json(assignments);
}

/** POST /api/admin/accounts/[id]/assignments — add or update a DM assignment */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id: accountId } = await params;
  const body = await req.json();
  const { userId, isPrimary } = assignSchema.parse(body);

  if (isPrimary) {
    // Demote existing primary first
    await prisma.accountAssignment.updateMany({
      where: { accountId, isPrimary: true },
      data: { isPrimary: false },
    });
    await prisma.orgAccount.update({ where: { id: accountId }, data: { primaryDmId: userId } });
  }

  const assignment = await prisma.accountAssignment.upsert({
    where: { accountId_userId: { accountId, userId } },
    create: { accountId, userId, isPrimary, assignedBy: (admin as any).id },
    update: { isPrimary, assignedBy: (admin as any).id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });

  return NextResponse.json(assignment, { status: 201 });
}

/** DELETE /api/admin/accounts/[id]/assignments?userId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: accountId } = await params;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: { code: "MISSING_PARAM", message: "userId required" } }, { status: 400 });

  await prisma.accountAssignment.delete({ where: { accountId_userId: { accountId, userId } } });

  // If deleted user was primary, clear the denormalised field
  const account = await prisma.orgAccount.findUnique({ where: { id: accountId }, select: { primaryDmId: true } });
  if (account?.primaryDmId === userId) {
    await prisma.orgAccount.update({ where: { id: accountId }, data: { primaryDmId: null } });
  }

  return NextResponse.json({ ok: true });
}
