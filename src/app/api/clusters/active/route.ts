export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/clusters/active — active clusters for the session user's org */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;

  const clusters = await prisma.cluster.findMany({
    where: { orgId: user.orgId, status: "active", deletedAt: null },
    include: {
      _count: { select: { accounts: true } },
      clusterAssignments: {
        where: { isPrimary: true },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clusters);
}
