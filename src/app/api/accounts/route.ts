export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/accounts?clusterId= — active accounts visible to the current user */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;

  const { searchParams } = new URL(req.url);
  const clusterId = searchParams.get("clusterId");

  const where: any = { orgId: user.orgId, status: "active", deletedAt: null };
  if (clusterId) where.clusterId = clusterId;

  const accounts = await prisma.orgAccount.findMany({
    where,
    include: {
      cluster: { select: { id: true, name: true, type: true } },
      dmAssignments: {
        where: { isPrimary: true },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        take: 1,
      },
      _count: { select: { programs: true, projects: true } },
    },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(accounts);
}
