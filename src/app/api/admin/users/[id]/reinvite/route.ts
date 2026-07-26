export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import crypto from "crypto";

/**
 * POST /api/admin/users/[id]/reinvite
 * Re-invites a deactivated user with a fresh mapping.
 * Clears old assignments, resets status to "invited", issues new invite link.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { role, fullName, programIds = [], clientIds = [] } = body;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: { message: "User not found" } }, { status: 404 });
  if (existing.status !== "deactivated") {
    return NextResponse.json({ error: { message: "User must be deactivated first" } }, { status: 400 });
  }

  // Clear old assignments
  await prisma.programAssignment.deleteMany({ where: { userId: id } });
  await (prisma as any).clusterAssignment.deleteMany({ where: { userId: id } });
  await (prisma as any).accountAssignment.deleteMany({ where: { userId: id } });
  await prisma.invitation.deleteMany({ where: { userId: id } });

  // Reset user
  await prisma.user.update({
    where: { id },
    data: {
      role: role || existing.role,
      fullName: fullName || existing.fullName,
      status: "invited",
      orgId: (admin as any).orgId,
      deletedAt: null,
    },
  });

  // New assignments
  if ((role === "pm") && programIds.length) {
    await prisma.programAssignment.create({
      data: { programId: programIds[0], userId: id, assignedBy: (admin as any).id },
    });
  }
  if ((role === "pgm" || role === "dm") && programIds.length) {
    await prisma.programAssignment.createMany({
      data: programIds.map((pid: string) => ({ programId: pid, userId: id, assignedBy: (admin as any).id })),
      skipDuplicates: true,
    });
  }
  if (role === "dh" && clientIds.length) {
    await (prisma as any).clusterAssignment.createMany({
      data: clientIds.map((cid: string) => ({ clusterId: cid, userId: id, assignedBy: (admin as any).id })),
      skipDuplicates: true,
    });
  }

  // New invite token
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.invitation.create({
    data: { userId: id, tokenHash, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/accept-invite?token=${token}`;
  return NextResponse.json({ inviteUrl });
}
