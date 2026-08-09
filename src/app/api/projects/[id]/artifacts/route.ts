import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact, type ArtifactTemplateOverride } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";
import { runGuardrails, GuardrailError } from "@/lib/guardrails";
import { syncArtifactToTables } from "@/lib/artifact-sync";
import { hashArtifactContent } from "@/lib/artifact-hash";
import { extractAndStoreItems } from "@/lib/item-extractor";

async function resolveTemplate(
  orgId: string | null | undefined,
  accountId: string | null | undefined,
  artifactType: string
): Promise<ArtifactTemplateOverride | undefined> {
  if (!orgId) return undefined;
  const db = prisma as any;
  const candidates = await db.artifactTemplate.findMany({
    where: {
      orgId,
      isActive: true,
      OR: [
        ...(accountId ? [
          { scope: "account", accountId, artifactType },
          { scope: "account", accountId, artifactType: "all" },
        ] : []),
        { scope: "global", accountId: null, artifactType },
        { scope: "global", accountId: null, artifactType: "all" },
      ],
    },
    orderBy: [{ scope: "desc" }, { artifactType: "desc" }],
  });
  if (candidates.length === 0) return undefined;
  const pick = candidates.find((t: any) => t.scope === "account" && t.artifactType === artifactType)
    ?? candidates.find((t: any) => t.scope === "account" && t.artifactType === "all")
    ?? candidates.find((t: any) => t.scope === "global" && t.artifactType === artifactType)
    ?? candidates[0];
  // A template with no addendum content has zero effect — treat as no template
  if (!pick.systemAddendum?.trim() && !pick.userAddendum?.trim()) return undefined;
  return { systemAddendum: pick.systemAddendum, userAddendum: pick.userAddendum, templateId: pick.id };
}

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

  // Org-level ownership check (SEC-3)
  if (project.orgId !== user.orgId) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const catalogEntry = ARTIFACT_CATALOG.find((a) => a.type === artifactType);
  if (!catalogEntry) {
    return NextResponse.json({ error: { code: "INVALID_ARTIFACT" } }, { status: 400 });
  }

  // ── Guardrail pre-flight ────────────────────────────────────────────────────
  const [existingArtifacts, costEntryCount] = await Promise.all([
    prisma.artifact.findMany({ where: { projectId: id }, select: { artifactType: true } }),
    artifactType === "evm_analysis"
      ? prisma.costEntry.count({ where: { projectId: id } })
      : Promise.resolve(0),
  ]);
  let guardrailWarnings: string[] = [];
  try {
    const guardrailResult = runGuardrails(artifactType, {
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
      existingArtifactTypes: existingArtifacts.map((a) => a.artifactType),
      hasRequirementsDoc: project.requirementsDocs.length > 0,
      costEntryCount,
      milestoneCount: project.milestones.length,
      riskCount: project.risks.length,
    });
    guardrailWarnings = guardrailResult.warnings;
    if (guardrailWarnings.length > 0) {
      console.warn(`[guardrails] ${artifactType}:`, guardrailWarnings);
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

  // For EVM: fetch cost entries and budget revision history
  let costEntries: { date: Date; amount: number; category: string }[] = [];
  let budgetRevisions: any[] = [];
  if (artifactType === "evm_analysis") {
    [costEntries, budgetRevisions] = await Promise.all([
      prisma.costEntry.findMany({
        where: { projectId: id },
        select: { date: true, amount: true, category: true },
        orderBy: { date: "asc" },
      }),
      prisma.$queryRaw<any[]>`SELECT "previousBudget","newBudget",delta,reason,"createdAt" FROM budget_revisions WHERE "projectId" = ${id} ORDER BY "createdAt" ASC`,
    ]);
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
    ...(artifactType === "evm_analysis" && {
      costEntries: costEntries.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        amount: e.amount,
        category: e.category,
      })),
      ...(budgetRevisions.length > 0 && {
        budgetRevisions: budgetRevisions.map((r: any) => ({
          previousBudget: Number(r.previousBudget),
          newBudget: Number(r.newBudget),
          delta: Number(r.delta),
          reason: r.reason,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt).slice(0, 10),
        })),
      }),
    }),
  };

  const requirements = project.requirementsDocs[0]?.extractedContent
    ? JSON.stringify(project.requirementsDocs[0].extractedContent)
    : undefined;

  // Fetch active scope baseline (if any)
  const latestScopeBaseline = await (prisma as any).scopeBaseline.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });
  const scopeBaselineId: string | null = latestScopeBaseline?.id ?? null;
  if (latestScopeBaseline) {
    const blReqs: any[] = (latestScopeBaseline.snapshot as any[]) ?? [];
    if (blReqs.length > 0) {
      (projectContext as any).scopeRequirements = blReqs.map((r: any) => `${r.requirementKey}: ${r.statement}`);
      (projectContext as any).scopeBaselineLabel = latestScopeBaseline.label;
    }
  }

  const templateOverride = await resolveTemplate(
    (user as any).orgId,
    (project as any).accountId,
    artifactType
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any;
  try {
    content = await generateArtifact(artifactType, projectContext, requirements, undefined, templateOverride);
  } catch (err: any) {
    console.error(`[artifact] generation failed for ${artifactType}:`, err);
    return NextResponse.json(
      { error: { code: "GENERATION_FAILED", message: err.message ?? "AI generation failed" } },
      { status: 502 }
    );
  }

  const existing = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const newHash = hashArtifactContent(content);

  // Wrap artifact + version creation in a single transaction (BUG-4).
  // Returns the version ID so the post-commit extraction step needs no extra query.
  let artifact;
  let versionId: string;

  if (existing) {
    const currentHash = existing.versions[0]?.contentHash ?? null;
    if (currentHash && currentHash === newHash) {
      return NextResponse.json(
        { noChange: true, currentVersion: existing.currentVersion, artifact: existing },
        { status: 200 }
      );
    }
    const newVersion = existing.currentVersion + 1;
    const parentVersionId = existing.versions[0]?.id ?? null;
    ({ artifact, versionId } = await prisma.$transaction(async (tx) => {
      const a = await tx.artifact.update({
        where: { id: existing.id },
        data: { content, currentVersion: newVersion, status: "draft", ...(scopeBaselineId ? { scopeBaselineId } : {}) },
      });
      const v = await tx.artifactVersion.create({
        data: {
          artifactId: existing.id,
          versionNumber: newVersion,
          content,
          contentHash: newHash,
          source: "ai_regenerated",
          approvalStatus: "unreviewed",
          parentVersionId,
          editedById: user.id,
          appliedTemplateId: templateOverride?.templateId ?? null,
        },
      });
      return { artifact: a, versionId: v.id };
    }));
  } else {
    ({ artifact, versionId } = await prisma.$transaction(async (tx) => {
      const a = await tx.artifact.create({
        data: {
          projectId: id,
          artifactType,
          phase: catalogEntry.phase,
          content,
          currentVersion: 1,
          status: "draft",
          ...(scopeBaselineId ? { scopeBaselineId } : {}),
        },
      });
      const v = await tx.artifactVersion.create({
        data: {
          artifactId: a.id,
          versionNumber: 1,
          content,
          contentHash: newHash,
          source: "ai_generated",
          approvalStatus: "unreviewed",
          parentVersionId: null,
          editedById: user.id,
          appliedTemplateId: templateOverride?.templateId ?? null,
        },
      });
      return { artifact: a, versionId: v.id };
    }));
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
  await syncArtifactToTables(id, artifactType, content).catch((err) => {
    console.error(`[artifact-sync] generate sync failed for ${artifactType}:`, err);
  });

  // BL-P2: extract canonical items async (non-blocking — never delays the response)
  extractAndStoreItems(versionId, artifactType, content).catch((e) => {
    console.error("[item-extractor]", e);
  });

  return NextResponse.json(
    { ...artifact, warnings: guardrailWarnings.length > 0 ? guardrailWarnings : undefined },
    { status: 201 }
  );
}
