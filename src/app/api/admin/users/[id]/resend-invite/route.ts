export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import crypto from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  // Invalidate prior invitations
  await prisma.invitation.updateMany({
    where: { userId: id, acceptedAt: null, invalidatedAt: null },
    data: { invalidatedAt: new Date() },
  });

  // Create new token
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await prisma.invitation.create({
    data: {
      userId: id,
      tokenHash,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  });

  await prisma.user.update({ where: { id }, data: { status: "invited" } });

  const inviteUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/accept-invite?token=${token}`;
  return NextResponse.json({ inviteUrl });
}
