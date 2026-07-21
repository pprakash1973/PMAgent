export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = schema.parse(body);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!invitation || invitation.invalidatedAt || invitation.acceptedAt) {
      return NextResponse.json({ error: { code: "INVALID_TOKEN", message: "This invitation link is invalid or already used" } }, { status: 400 });
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: { code: "EXPIRED_TOKEN", message: "This invitation has expired. Ask your admin to resend it." } }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: invitation.userId },
        data: { passwordHash, status: "active", emailVerified: new Date() },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true, email: invitation.user.email });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message } }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
  }
}
