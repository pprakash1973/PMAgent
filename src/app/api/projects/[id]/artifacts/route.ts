import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";
import { runGuardrails, GuardrailError } from "@/lib/guardrails";
import { syncArtifactToTables } from "@/lib/artifact-sync";

export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const artifacts = await prisma.artifact.findMany({
    where: { projectId: id },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(artifacts);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;
  const { id } = await params;
  const { artifactType } = await req.json();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: true,
      risks: true,
      requirementsDocs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const catalogEntry = ARTIFACT_CATALOG.find((a) => a.type === artifactType);
  if (!catalogEntry) {
    return NextResponse.json({ error: { code: "INVALID_ARTIFACT" } }, { status: 400 });
  }

  // ── Guardrail pre-flight (GR-1, GR-2, GR-4, GR-8, GR-9) ──────────────────
  const existingArtifacts = await prisma.artifact.findMany({
    where: { projectId: id },
    select: { artifactType: true },
  });
  try {
    const guardrailResult = runGuardrails(artifactType, {
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
      existingArtifactTypes: existingArtifacts.map((a) => a.artifactType),
      hasRequirementsDoc: project.requirementsDocs.length > 0,
      milestoneCount: project.milestones.length,
      riskCount: project.risks.length,
    });
    // Attach non-blocking warnings to response header for UI to surface
    if (guardrailResult.warnings.length > 0) {
      console.warn(`[guardrails] ${artifactType}:`, guardrailResult.warnings);
    }
  } catch (err) {
    if (err instanceof GuardrailError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 422 }
      );
    }
    throw err;
  }

  // For RTM: fetch schedule tasks + existing WBS/charter artifacts to ground traceability
  let scheduleTasks: { name: string; phase: string | null }[] = [];
  let wbsContent: unknown = null;
  if (artifactType === "traceability_matrix") {
    const [tasks, wbsArtifact] = await Promise.all([
      prisma.scheduleTask.findMany({ where: { projectId: id }, select: { name: true, phase: true }, take: 100 }),
      prisma.artifact.findFirst({ where: { projectId: id, artifactType: "wbs" }, select: { content: true } }),
    ]);
    scheduleTasks = tasks;
    wbsContent = wbsArtifact?.content ?? null;
  }

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
    ...(artifactType === "traceability_matrix" && {
      scheduleTasks,
      wbsStructure: wbsContent,
    }),
  };

  const requirements = project.requirementsDocs[0]?.extractedContent
    ? JSON.stringify(project.requirementsDocs[0].extractedContent)
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = await generateArtifact(artifactType, projectContext, requirements) as any;

  const existing = await prisma.artifact.findFirst({ where: { projectId: id, artifactType } });

  let artifact;
  if (existing) {
    const newVersion = existing.currentVersion + 1;
    artifact = await prisma.artifact.update({
      where: { id: existing.id },
      data: { content, currentVersion: newVersion, status: "draft" },
    });
    await prisma.artifactVersion.create({
      data: {
        artifactId: existing.id,
        versionNumber: newVersion,
        content,
        source: "ai_generated",
        editedById: user.id,
      },
    });
  } else {
    artifact = await prisma.artifact.create({
      data: {
        projectId: id,
        artifactType,
        phase: catalogEntry.phase,
        content,
        currentVersion: 1,
        status: "draft",
      },
    });
    await prisma.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        versionNumber: 1,
        content,
        source: "ai_generated",
        editedById: user.id,
      },
    });
  }

  // Mark selection as active
  await prisma.artifactSelection.upsert({
    where: { projectId_artifactType: { projectId: id, artifactType } },
    create: {
      projectId: id,
      artifactType,
      selectionStatus: "active",
      selectedById: user.id,
      selectedAt: new Date(),
    },
    update: { selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
  });

  // Sync artifact content into live DB tables (RAID tab, Resources tab, milestones)
  await syncArtifactToTables(id, artifactType, content).catch(() => {});

  return NextResponse.json(artifact, { status: 201 });
}
