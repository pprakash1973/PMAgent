export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, n } = await params;
  const versionNumber = parseInt(n, 10);
  if (isNaN(versionNumber)) return NextResponse.json({ error: "INVALID_VERSION" }, { status: 400 });

  const version = await (prisma.artifactVersion as any).findFirst({
    where: { artifactId: id, versionNumber },
    include: { editedBy: { select: { fullName: true, email: true } } },
  });

  if (!version) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(version);
}
