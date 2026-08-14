import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isStaticAsset = /\.(png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|mp4)$/i.test(pathname);
  const isPublic =
    isStaticAsset ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/accept-invite" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/submit/") ||      // SA8 — token-authenticated, no login required
    pathname.startsWith("/api/submit/");    // SA8 submit API — same

  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value;

  const isLoggedIn = !!sessionToken;

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
