import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

// Auth.js v5 cookie names (dev vs prod)
const AUTH_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  // next-auth v4/beta fallback names
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "next-auth.callback-url",
];

export async function GET(req: NextRequest) {
  const session = await auth();

  if (session?.user?.id) {
    // Delete any database Session records (created by PrismaAdapter for OAuth flows)
    try {
      await prisma.session.deleteMany({ where: { userId: session.user.id } });
    } catch {
      // Non-fatal — JWT strategy may not populate sessions table
    }
  }

  // Explicitly clear all auth cookies server-side
  const jar = await cookies();
  for (const name of AUTH_COOKIES) {
    try {
      jar.delete(name);
    } catch {
      // Cookie may not exist — ignore
    }
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}
