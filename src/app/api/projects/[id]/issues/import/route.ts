import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncArtifactToTables } from "@/lib/artifact-sync";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

// Re-syncs the latest issue_register or raid_register artifact into the Issue table.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id } = await params;

  const artifact = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType: { in: ["issue_register", "raid_register"] } },
    orderBy: { updatedAt: "desc" },
  });

  if (!artifact?.content) {
    return NextResponse.json({
      error: "No issue register artifact found. Go to the Artifacts tab and generate or upload an Issue Register first.",
    }, { status: 404 });
  }

  // Inspect artifact content to detect empty issues array early
  const rawContent = artifact.content as any;
  const issueArray =
    rawContent?.issues ??
    rawContent?.issueRegister ??
    rawContent?.issueItems ??
    rawContent?.issueLog;

  if (!Array.isArray(issueArray) || issueArray.length === 0) {
    return NextResponse.json({
      error: "The Issue Register artifact was found but contains no issues. Try regenerating it in the Artifacts tab.",
    }, { status: 422 });
  }

  try {
    await syncArtifactToTables(id, artifact.artifactType, artifact.content);
  } catch (err: any) {
    console.error("[issues/import] syncArtifactToTables failed:", err);
    return NextResponse.json({ error: `Sync failed: ${err?.message ?? "unknown error"}` }, { status: 500 });
  }

  const issues = await prisma.issue.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ imported: issues.length, issues });
}
