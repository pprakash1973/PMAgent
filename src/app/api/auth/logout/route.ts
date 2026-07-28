import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  const loginUrl = new URL("/login", req.url);
  const response = NextResponse.redirect(loginUrl);

  // Set cookies to expired on the response object — this is the reliable way to
  // clear cookies in a Route Handler. cookies().delete() from next/headers does
  // not propagate its Set-Cookie headers into a NextResponse.redirect() object.
  for (const name of AUTH_COOKIES) {
    const opts: Parameters<typeof response.cookies.set>[2] = {
      maxAge: 0,
      path: "/",
    };
    // __Secure- and __Host- prefixed cookies require the Secure attribute
    if (name.startsWith("__Secure-") || name.startsWith("__Host-")) {
      opts.secure = true;
    }
    response.cookies.set(name, "", opts);
  }

  return response;
}
