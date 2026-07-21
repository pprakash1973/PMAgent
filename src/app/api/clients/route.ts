export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;

  const clients = await prisma.client.findMany({
    where: { orgId: user.orgId, status: "active", deletedAt: null },
    include: { cluster: { select: { id: true, name: true, type: true } } },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  // Group by cluster for the dropdown
  const grouped: Record<string, { clusterId: string; clusterName: string; clients: typeof clients }> = {};
  for (const c of clients) {
    const cid = c.cluster.id;
    if (!grouped[cid]) {
      grouped[cid] = { clusterId: cid, clusterName: c.cluster.name, clients: [] };
    }
    grouped[cid].clients.push(c);
  }

  return NextResponse.json({ clients, grouped: Object.values(grouped) });
}
