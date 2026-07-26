export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/accounts/[id]/programs — active programs under an account */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: accountId } = await params;

  const programs = await prisma.program.findMany({
    where: { accountId, deletedAt: null },
    include: {
      assignments: {
        include: { user: { select: { id: true, fullName: true, email: true } } },
      },
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(programs);
}
