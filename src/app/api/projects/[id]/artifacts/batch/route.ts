import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";
import { runGuardrails, GuardrailError } from "@/lib/guardrails";
import { syncArtifactToTables } from "@/lib/artifact-sync";
import { assembleEvidence, countGaps, extractGapFields } from "@/lib/evidence-assembler";
import type { Prisma } from "@prisma/client";

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

  // Legacy fallback: use extractedContent JSON if no chunks uploaded yet
  const requirements = project.requirementsDocs[0]?.extractedContent
    ? JSON.stringify(project.requirementsDocs[0].extractedContent)
    : undefined;

  const existingTypes = existingArtifacts.map((a) => a.artifactType);

  // Run guardrails per type
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

  // Assemble evidence for each allowed artifact type in parallel
  const evidenceContexts = await Promise.all(
    allowed.map(({ type }) => assembleEvidence(id, type))
  );

  // Fan out — each generateArtifact() is an independent sub-agent call
  const subAgentResults = await Promise.allSettled(
    allowed.map(({ type }, i) =>
      generateArtifact(type, projectContext, requirements, evidenceContexts[i])
        .then((content) => ({ type, content, evidenceCtx: evidenceContexts[i] }))
    )
  );

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

      const content = result.value.content as Record<string, unknown>;
      const evidenceCtx = result.value.evidenceCtx;

      // Count GAP markers for grounding score
      const gapCount = countGaps(content);
      const gapFields = extractGapFields(content, type);
      const totalFields = Object.keys(content).length;
      const groundingScore = evidenceCtx.hasEvidence && totalFields > 0
        ? Math.max(0, Math.round(((totalFields - gapCount) / Math.max(totalFields, 1)) * 100))
        : null;

      const existing = await prisma.artifact.findFirst({ where: { projectId: id, artifactType: type } });
      const jsonContent = content as Prisma.InputJsonValue;

      let artifact;
      if (existing) {
        const newVersion = existing.currentVersion + 1;
        artifact = await prisma.artifact.update({
          where: { id: existing.id },
          data: { content: jsonContent, currentVersion: newVersion, status: "draft", gapCount, groundingScore },
        });
        await prisma.artifactVersion.create({
          data: { artifactId: existing.id, versionNumber: newVersion, content: jsonContent, source: "ai_generated", editedById: user.id },
        });
        // Clear old gaps for this artifact before writing new ones
        await prisma.gap.deleteMany({ where: { artifactId: existing.id } });
      } else {
        artifact = await prisma.artifact.create({
          data: { projectId: id, artifactType: type, phase: catalogEntry.phase, content: jsonContent, currentVersion: 1, status: "draft", gapCount, groundingScore },
        });
        await prisma.artifactVersion.create({
          data: { artifactId: artifact.id, versionNumber: 1, content: jsonContent, source: "ai_generated", editedById: user.id },
        });
      }

      // Persist gaps
      if (gapFields.length > 0) {
        await prisma.gap.createMany({
          data: gapFields.map(g => ({
            id: `${artifact.id}-${g.fieldId}`.slice(0, 120),
            projectId: id,
            artifactId: artifact.id,
            artifactType: type,
            fieldId: g.fieldId,
            question: g.question,
            material: true,
            status: "open",
          })),
          skipDuplicates: true,
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

      succeeded.push({ ...artifact, gapCount, groundingScore });
    })
  );

  return NextResponse.json({ succeeded, failed }, { status: 200 });
}
