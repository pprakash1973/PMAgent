import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact, generateDomainContext, type ArtifactTemplateOverride } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";
import { runGuardrails, GuardrailError } from "@/lib/guardrails";
import { syncArtifactToTables } from "@/lib/artifact-sync";
import { hashArtifactContent } from "@/lib/artifact-hash";
import { extractAndStoreItems } from "@/lib/item-extractor";
import { requireProjectAccess } from "@/lib/project-access";

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

// Azure (A4): App Service enforces a hard 230s load-balancer timeout that cannot
// be raised. Stay below it so behaviour matches on Vercel and Azure.
export const maxDuration = 220;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id } = await params;

  // Reset stale "generating" artifacts (> 10 min) — guards against crashed instances
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.artifact.updateMany({
    where: {
      projectId: id,
      status: "generating",
      generationStartedAt: { lt: staleThreshold },
    },
    data: { status: "failed", generationStartedAt: null },
  });

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
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

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

  // ── Guardrail pre-flight ────────────────────────────────────────────────────
  const [existingArtifacts, costEntryCount] = await Promise.all([
    prisma.artifact.findMany({ where: { projectId: id }, select: { artifactType: true } }),
    artifactType === "evm_analysis"
      ? prisma.costEntry.count({ where: { projectId: id } })
      : Promise.resolve(0),
  ]);
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

  // For EVM: fetch actual cost entries ordered by date
  let costEntries: { date: Date; amount: number; category: string }[] = [];
  if (artifactType === "evm_analysis") {
    costEntries = await prisma.costEntry.findMany({
      where: { projectId: id },
      select: { date: true, amount: true, category: true },
      orderBy: { date: "asc" },
    });
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
    industry: project.industry ?? null,
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
    }),
  };

  const requirements = project.requirementsDocs[0]?.extractedContent
    ? JSON.stringify(project.requirementsDocs[0].extractedContent)
    : undefined;

  const templateOverride = await resolveTemplate(
    (user as any).orgId,
    (project as any).accountId,
    artifactType
  );

  // ── Upsert artifact as "generating" and return 202 immediately ────────────
  // Generation runs in the background via after() — the client polls for completion.
  const existingForUpsert = await prisma.artifact.findFirst({
    where: { projectId: id, artifactType },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  let pendingArtifact: any;
  if (existingForUpsert) {
    pendingArtifact = await prisma.artifact.update({
      where: { id: existingForUpsert.id },
      data: { status: "generating", generationStartedAt: new Date() },
    });
  } else {
    pendingArtifact = await prisma.artifact.create({
      data: {
        projectId: id,
        artifactType,
        phase: catalogEntry.phase,
        content: {},
        currentVersion: 0,
        status: "generating",
        generationStartedAt: new Date(),
      },
    });
  }

  // ── Background: domain pre-flight + AI generation + save ──────────────────
  after(async () => {
    try {
      const DOMAIN_AGENT_ARTIFACTS = ["wbs", "resource_plan", "risk_register"];
      let dynamicDomainContext = "";
      if (DOMAIN_AGENT_ARTIFACTS.includes(artifactType) && project.industry && project.description) {
        dynamicDomainContext = await generateDomainContext(project.industry, project.description, project.customer);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any = await generateArtifact(
        artifactType, projectContext, requirements, undefined, dynamicDomainContext, templateOverride
      );

      const newHash = hashArtifactContent(content);

      if (existingForUpsert) {
        const currentHash = (existingForUpsert.versions[0] as any)?.contentHash ?? null;
        const newVersion = existingForUpsert.currentVersion + 1;
        const parentVersionId = existingForUpsert.versions[0]?.id ?? null;

        if (currentHash && currentHash === newHash) {
          // Content identical — just clear generating status
          await prisma.artifact.update({
            where: { id: pendingArtifact.id },
            data: { status: "draft", generationStartedAt: null },
          });
          return;
        }

        await prisma.artifact.update({
          where: { id: pendingArtifact.id },
          data: { content, currentVersion: newVersion, status: "draft", generationStartedAt: null },
        });
        await (prisma.artifactVersion as any).create({
          data: {
            artifactId: pendingArtifact.id,
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
      } else {
        await prisma.artifact.update({
          where: { id: pendingArtifact.id },
          data: { content, currentVersion: 1, status: "draft", generationStartedAt: null },
        });
        await (prisma.artifactVersion as any).create({
          data: {
            artifactId: pendingArtifact.id,
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
      }

      // Mark selection as active
      await prisma.artifactSelection.upsert({
        where: { projectId_artifactType: { projectId: id, artifactType } },
        create: { projectId: id, artifactType, selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
        update: { selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
      });

      // Sync into live DB tables
      await syncArtifactToTables(id, artifactType, content).catch((err) => {
        console.error(`[artifact-sync] generate sync failed for ${artifactType}:`, err);
      });

      // Extract canonical items (non-blocking)
      const latestVersion = await (prisma.artifactVersion as any).findFirst({
        where: { artifactId: pendingArtifact.id },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      if (latestVersion) {
        extractAndStoreItems(latestVersion.id, artifactType, content).catch((e) => {
          console.error("[item-extractor]", e);
        });
      }

      console.log(`[artifact] background generation complete: ${artifactType}`);
    } catch (err: any) {
      console.error(`[artifact] background generation failed for ${artifactType}:`, err);
      await prisma.artifact.update({
        where: { id: pendingArtifact.id },
        data: { status: "failed", generationStartedAt: null },
      }).catch(() => {});
    }
  });

  return NextResponse.json(
    { status: "generating", artifactId: pendingArtifact.id, artifactType },
    { status: 202 }
  );
}
