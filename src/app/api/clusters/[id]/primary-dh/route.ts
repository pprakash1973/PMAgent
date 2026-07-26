export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/clusters/[id]/primary-dh — returns the primary DH for a cluster, or 404 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;

  const cluster = await prisma.cluster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      primaryDhId: true,
    },
  });

  if (!cluster) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (!cluster.primaryDhId) {
    return NextResponse.json({ error: { code: "NO_PRIMARY_DH", message: "This cluster has no Primary Delivery Head assigned. Contact your administrator." } }, { status: 422 });
  }

  const dh = await prisma.user.findUnique({
    where: { id: cluster.primaryDhId },
    select: { id: true, fullName: true, email: true, role: true, status: true },
  });

  if (!dh || dh.status === "deactivated") {
    return NextResponse.json({ error: { code: "NO_PRIMARY_DH", message: "The Primary Delivery Head for this cluster is inactive. Contact your administrator." } }, { status: 422 });
  }

  return NextResponse.json({ cluster: { id: cluster.id, name: cluster.name }, dh });
}
