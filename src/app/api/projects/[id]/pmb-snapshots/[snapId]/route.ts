export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; snapId: string }> }
) {
  const { id, snapId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

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
