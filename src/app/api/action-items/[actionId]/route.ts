import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { actionId } = await params;
  const item = await prisma.actionItem.findUnique({
    where: { id: actionId },
    include: {
      raisedBy: { select: { fullName: true } },
      assignedTo: { select: { fullName: true } },
      closedBy: { select: { fullName: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { fullName: true } } } },
      project: { select: { name: true, accountId: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ item });
}
