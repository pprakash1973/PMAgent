export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, n } = await params;
  const versionNumber = parseInt(n, 10);
  if (isNaN(versionNumber)) return NextResponse.json({ error: "INVALID_VERSION" }, { status: 400 });

  const version = await (prisma.artifactVersion as any).findFirst({
    where: { artifactId: id, versionNumber },
    select: { id: true, extractionStatus: true, extractionCoverage: true },
  });
  if (!version) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const url = new URL(req.url);
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "200", 10), 500);
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10);

  const [items, total] = await Promise.all([
    (prisma as any).artifactVersionItem.findMany({
      where: { artifactVersionId: version.id },
      orderBy: { sequence: "asc" },
      take,
      skip,
    }),
    (prisma as any).artifactVersionItem.count({ where: { artifactVersionId: version.id } }),
  ]);

  return NextResponse.json({
    extractionStatus: version.extractionStatus,
    extractionCoverage: version.extractionCoverage,
    total,
    take,
    skip,
    items,
  });
}
