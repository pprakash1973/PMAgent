import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncArtifactToTables } from "@/lib/artifact-sync";

// Re-syncs the latest risk_register or raid_register artifact into the Risk table.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== user.orgId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const artifact = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType: { in: ["risk_register", "raid_register"] } },
    orderBy: { updatedAt: "desc" },
  });

  if (!artifact?.content) {
    return NextResponse.json({ error: "No risk register artifact found. Generate or upload one in the Artifacts tab first." }, { status: 404 });
  }

  await syncArtifactToTables(id, artifact.artifactType, artifact.content);

  const risks = await prisma.risk.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ imported: risks.length, risks });
}
