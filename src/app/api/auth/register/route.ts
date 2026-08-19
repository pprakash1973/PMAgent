export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

// Rough entropy estimate — rejects keyboard-walks and repeated patterns
function passwordEntropy(p: string): number {
  const pool =
    (/[a-z]/.test(p) ? 26 : 0) +
    (/[A-Z]/.test(p) ? 26 : 0) +
    (/[0-9]/.test(p) ? 10 : 0) +
    (/[^a-zA-Z0-9]/.test(p) ? 32 : 0);
  return p.length * Math.log2(pool || 1);
}

const COMMON_PASSWORDS = new Set([
  "Password1!", "Password123!", "Welcome1!", "Admin123!", "Passw0rd!",
  "P@ssword1", "Qwerty123!", "Letmein1!", "Monkey123!", "Dragon123!",
]);

const schema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain a special character")
    .refine((p) => !COMMON_PASSWORDS.has(p), "Password is too common")
    .refine((p) => passwordEntropy(p) >= 40, "Password is too weak — try a longer or more varied password"),
  orgName: z.string().min(2).max(100).optional(),
  orgId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per IP per hour
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many registration attempts. Try again later." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body = await req.json();
    const data = schema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: { code: "EMAIL_TAKEN", message: "Email already registered" } }, { status: 409 });
    }

    let orgId = data.orgId;
    if (!orgId) {
      const org = await prisma.organization.create({
        data: { name: data.orgName || `${data.fullName}'s Org` },
      });
      orgId = org.id;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        orgId,
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        role: "pm",
        approved: true,
      },
    });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message || "Validation error" } }, { status: 400 });
    }
    console.error("[register]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Registration failed" } }, { status: 500 });
  }
}
