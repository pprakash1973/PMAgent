import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  // Real-time DB check: JWT role is cached — re-verify the user is still an active admin.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, status: true },
  });
  if (!dbUser || dbUser.role !== "admin" || dbUser.status !== "active") {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { user };
}
