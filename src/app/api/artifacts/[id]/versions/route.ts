export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const artifact = await prisma.artifact.findUnique({ where: { id } });
  if (!artifact) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const versions = await (prisma.artifactVersion as any).findMany({
    where: { artifactId: id },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      contentHash: true,
      source: true,
      approvalStatus: true,
      parentVersionId: true,
      supersededReason: true,
      editedById: true,
      createdAt: true,
      editedBy: { select: { fullName: true, email: true } },
    },
  });

  return NextResponse.json({ artifactId: id, artifactType: artifact.artifactType, versions });
}
