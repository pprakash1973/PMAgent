export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashArtifactContent } from "@/lib/artifact-hash";

// BL-16: Restore never rewrites history — creates a new version with source="restore"
// and parent pointing to the current tip, content copied from the requested version.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;

  const { id, n } = await params;
  const targetVersionNumber = parseInt(n, 10);
  if (isNaN(targetVersionNumber)) return NextResponse.json({ error: "INVALID_VERSION" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const supersededReason: string | undefined = body.supersededReason;

  const [targetVersion, artifact] = await Promise.all([
    (prisma.artifactVersion as any).findFirst({ where: { artifactId: id, versionNumber: targetVersionNumber } }),
    prisma.artifact.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    }),
  ]);

  if (!targetVersion || !artifact) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const currentTip = artifact.versions[0];
  const newVersionNumber = artifact.currentVersion + 1;
  const newHash = hashArtifactContent(targetVersion.content);

  const [updatedArtifact, newVersion] = await prisma.$transaction([
    prisma.artifact.update({
      where: { id },
      data: { content: targetVersion.content, currentVersion: newVersionNumber },
    }),
    (prisma.artifactVersion as any).create({
      data: {
        artifactId: id,
        versionNumber: newVersionNumber,
        content: targetVersion.content,
        contentHash: newHash,
        source: "restore",
        approvalStatus: "unreviewed",
        parentVersionId: currentTip?.id ?? null,
        supersededReason: supersededReason ?? `Restored from v${targetVersionNumber}`,
        editedById: user.id,
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      orgId: user.orgId ?? "unknown",
      userId: user.id,
      action: "ARTIFACT_VERSION_RESTORED",
      entity: "Artifact",
      entityId: id,
      before: { currentVersion: artifact.currentVersion },
      after: { currentVersion: newVersionNumber, restoredFromVersion: targetVersionNumber },
    },
  });

  return NextResponse.json({ artifact: updatedArtifact, newVersion }, { status: 201 });
}
