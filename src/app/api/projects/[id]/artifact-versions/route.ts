export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

// Returns all artifact versions for a project, grouped with artifact metadata.
// Used by the Baseline tab version picker.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;


  const artifacts = await prisma.artifact.findMany({
    where: { projectId: id },
    select: {
      id: true,
      artifactType: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          approvalStatus: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Flatten to a list of version entries with artifact context
  const versions = artifacts.flatMap((a) =>
    (a.versions as any[]).map((v: any) => ({
      id: v.id,
      artifactId: a.id,
      artifactType: a.artifactType,
      versionNumber: v.versionNumber,
      approvalStatus: v.approvalStatus ?? "unreviewed",
      createdAt: v.createdAt,
    }))
  );

  return NextResponse.json(versions);
}
