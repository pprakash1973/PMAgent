import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncArtifactToTables } from "@/lib/artifact-sync";

// Re-syncs the latest issue_register or raid_register artifact into the Issue table.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const artifact = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType: { in: ["issue_register", "raid_register"] } },
    orderBy: { updatedAt: "desc" },
  });

  if (!artifact?.content) {
    return NextResponse.json({ error: "No issue register artifact found. Generate or upload one in the Artifacts tab first." }, { status: 404 });
  }

  await syncArtifactToTables(id, artifact.artifactType, artifact.content);

  const issues = await prisma.issue.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ imported: issues.length, issues });
}
