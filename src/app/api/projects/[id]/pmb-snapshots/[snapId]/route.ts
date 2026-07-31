export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; snapId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { snapId } = await params;
  const db = prisma as any;

  const snapshot = await db.pmbSnapshot.findUnique({
    where: { id: snapId },
    include: {
      members: {
        include: {
          artifactVersion: {
            select: {
              id: true,
              versionNumber: true,
              approvalStatus: true,
              contentHash: true,
              source: true,
              createdAt: true,
              artifactId: true,
            },
          },
        },
        orderBy: { dimension: "asc" },
      },
    },
  });

  if (!snapshot) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(snapshot);
}
