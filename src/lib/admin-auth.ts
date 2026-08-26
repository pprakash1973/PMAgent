import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const user = session.user as any;
  if (user.role !== "admin") {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  // SEC: an admin is an admin *of one tenant*. Callers must scope every query by
  // this orgId — without it an admin in one org can read and mutate all others.
  if (!user.orgId) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { user, orgId: user.orgId as string };
}
