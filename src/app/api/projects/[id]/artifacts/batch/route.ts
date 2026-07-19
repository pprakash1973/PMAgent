import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";
import { runGuardrails, GuardrailError } from "@/lib/guardrails";
import { syncArtifactToTables } from "@/lib/artifact-sync";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;
  const { id } = await params;
  const { artifactTypes } = await req.json();

  if (!Array.isArray(artifactTypes) || artifactTypes.length === 0) {
    return NextResponse.json({ error: { code: "MISSING_TYPES" } }, { status: 400 });
  }

  // Load project context once — shared across all sub-agents
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: true,
      risks: true,
      requirementsDocs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const existingArtifacts = await prisma.artifact.findMany({
    where: { projectId: id },
    select: { artifactType: true },
  });

  const projectContext = {
    name: project.name,
    code: project.code,
    customer: project.customer,
    methodology: project.methodology,
    engagementMode: project.engagementMode,
    budget: project.budget,
    currency: project.currency,
    startDate: project.startDate,
    endDate: project.endDate,
    teamSize: project.teamSize,
    description: project.description,
    milestones: project.milestones,
  };

  const requirements = project.requirementsDocs[0]?.extractedContent
    ? JSON.stringify(project.requirementsDocs[0].extractedContent)
    : undefined;

  const existingTypes = existingArtifacts.map((a) => a.artifactType);

  // Run guardrails per type — collect failures without blocking others
  const guardrailResults = artifactTypes.map((type: string) => {
    const catalogEntry = ARTIFACT_CATALOG.find((a) => a.type === type);
    if (!catalogEntry) return { type, blocked: true, reason: "Unknown artifact type" };
    try {
      runGuardrails(type, {
        name: project.name,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        budget: project.budget,
        existingArtifactTypes: existingTypes,
        hasRequirementsDoc: project.requirementsDocs.length > 0,
        milestoneCount: project.milestones.length,
        riskCount: project.risks.length,
      });
      return { type, blocked: false, catalogEntry };
    } catch (err) {
      if (err instanceof GuardrailError) {
        return { type, blocked: true, reason: err.message };
      }
      throw err;
    }
  });

  const allowed = guardrailResults.filter((r) => !r.blocked);
  const guardBlocked = guardrailResults.filter((r) => r.blocked);

  // Fan out — each generateArtifact() is an independent sub-agent call
  const subAgentResults = await Promise.allSettled(
    allowed.map(({ type }) =>
      generateArtifact(type, projectContext, requirements)
        .then((content) => ({ type, content }))
    )
  );

  // Save all succeeded results to DB + sync to live tables
  const succeeded: any[] = [];
  const failed: { type: string; reason: string }[] = [
    ...guardBlocked.map((r) => ({ type: r.type, reason: r.reason! })),
  ];

  await Promise.all(
    subAgentResults.map(async (result, i) => {
      const type = allowed[i].type;
      const catalogEntry = allowed[i].catalogEntry!;

      if (result.status === "rejected") {
        failed.push({ type, reason: result.reason?.message ?? "Generation failed" });
        return;
      }

      const content = result.value.content as object;

      const existing = await prisma.artifact.findFirst({ where: { projectId: id, artifactType: type } });

      let artifact;
      if (existing) {
        const newVersion = existing.currentVersion + 1;
        artifact = await prisma.artifact.update({
          where: { id: existing.id },
          data: { content, currentVersion: newVersion, status: "draft" },
        });
        await prisma.artifactVersion.create({
          data: { artifactId: existing.id, versionNumber: newVersion, content, source: "ai_generated", editedById: user.id },
        });
      } else {
        artifact = await prisma.artifact.create({
          data: { projectId: id, artifactType: type, phase: catalogEntry.phase, content, currentVersion: 1, status: "draft" },
        });
        await prisma.artifactVersion.create({
          data: { artifactId: artifact.id, versionNumber: 1, content, source: "ai_generated", editedById: user.id },
        });
      }

      await prisma.artifactSelection.upsert({
        where: { projectId_artifactType: { projectId: id, artifactType: type } },
        create: { projectId: id, artifactType: type, selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
        update: { selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
      });

      await syncArtifactToTables(id, type, content).catch((err) => {
        console.error(`[batch-sync] failed for ${type}:`, err);
      });

      succeeded.push(artifact);
    })
  );

  return NextResponse.json({ succeeded, failed }, { status: 200 });
}
