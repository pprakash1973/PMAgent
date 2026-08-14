import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Static files under public/ are served through this matcher, so exempt them —
  // otherwise an image on the login page redirects to /login and never loads.
  const isStaticAsset = /\.(png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|mp4)$/i.test(pathname);
  const isPublic =
    isStaticAsset ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/accept-invite" ||   // invited users aren't logged in yet — must reach the activation page
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/submit/") ||      // SA8 public actuals submission — token-authenticated, no login
    pathname.startsWith("/api/submit/");    // SA8 submit API — same

  // Check for Auth.js v5 session cookie (JWT strategy)
  // v5 uses "authjs.session-token"; v4 used "next-auth.session-token"
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
