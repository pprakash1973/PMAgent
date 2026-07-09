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
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, type } = await params;

  const artifact = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType: type },
  });

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.artifactVersion.deleteMany({ where: { artifactId: artifact.id } }),
    prisma.artifact.delete({ where: { id: artifact.id } }),
  ]);

  return NextResponse.json({ deleted: true, artifactType: type });
}
