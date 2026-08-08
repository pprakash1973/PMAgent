import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// DELETE an artifact (and its version history) so the user can regenerate or
// re-upload a fresh one. The catalog selection is left intact so the row stays
// visible with Generate / Upload actions.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as { id: string; orgId: string };
  const { id, type } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (project.orgId !== user.orgId) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const artifact = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType: type },
  });

  if (!artifact) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Artifact not found" } }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.artifactVersion.deleteMany({ where: { artifactId: artifact.id } }),
    prisma.artifact.delete({ where: { id: artifact.id } }),
  ]);

  return NextResponse.json({ deleted: true, artifactType: type });
}
