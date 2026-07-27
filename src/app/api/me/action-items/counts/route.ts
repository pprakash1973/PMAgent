import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;

  const [open, overdue] = await Promise.all([
    prisma.actionItem.count({
      where: { assignedToId: user.id, status: { in: ["open", "acknowledged", "in_progress", "blocked"] } },
    }),
    prisma.actionItem.count({
      where: { assignedToId: user.id, status: { in: ["open", "acknowledged", "in_progress", "blocked"] }, dueDate: { lt: new Date() } },
    }),
  ]);

  return NextResponse.json({ open, overdue });
}
