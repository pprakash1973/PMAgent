export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runComparison } from "@/lib/comparison-engine";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const db = prisma as any;

  const runs = await db.comparisonRun.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      leftVersionId: true,
      rightVersionId: true,
      artifactType: true,
      status: true,
      matchedCount: true,
      addedCount: true,
      deletedCount: true,
      modifiedCount: true,
      unchangedCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(runs);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const { leftVersionId, rightVersionId, artifactType } = await req.json();

  if (!leftVersionId || !rightVersionId || !artifactType) {
    return NextResponse.json(
      { error: "leftVersionId, rightVersionId, and artifactType are required" },
      { status: 400 }
    );
  }

  if (leftVersionId === rightVersionId) {
    return NextResponse.json({ error: "leftVersionId and rightVersionId must differ" }, { status: 400 });
  }

  // Verify both versions belong to this project via artifact
  const db = prisma as any;
  const [lv, rv] = await Promise.all([
    db.artifactVersion.findFirst({ where: { id: leftVersionId }, select: { artifact: { select: { projectId: true } } } }),
    db.artifactVersion.findFirst({ where: { id: rightVersionId }, select: { artifact: { select: { projectId: true } } } }),
  ]);

  if (!lv || !rv || lv.artifact.projectId !== id || rv.artifact.projectId !== id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Check extraction status — warn if not complete but proceed
  const [lStatus, rStatus] = await Promise.all([
    db.artifactVersion.findUnique({ where: { id: leftVersionId }, select: { extractionStatus: true } }),
    db.artifactVersion.findUnique({ where: { id: rightVersionId }, select: { extractionStatus: true } }),
  ]);

  const warnings: string[] = [];
  if (lStatus?.extractionStatus !== "complete") warnings.push("left version items not fully extracted");
  if (rStatus?.extractionStatus !== "complete") warnings.push("right version items not fully extracted");

  const result = await runComparison(id, leftVersionId, rightVersionId, artifactType);

  return NextResponse.json({ ...result, warnings: warnings.length ? warnings : undefined }, { status: 201 });
}
