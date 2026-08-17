import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact, type ArtifactTemplateOverride } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";
import { runGuardrails, GuardrailError } from "@/lib/guardrails";
import { syncArtifactToTables } from "@/lib/artifact-sync";
import { hashArtifactContent } from "@/lib/artifact-hash";
import { extractAndStoreItems } from "@/lib/item-extractor";
import type { Prisma } from "@prisma/client";

// ── Template resolution with 60-second in-process cache ───────────────────────
type TemplateCache = { value: ArtifactTemplateOverride | undefined; expiresAt: number };
const templateCache = new Map<string, TemplateCache>();

async function resolveTemplate(
  orgId: string | null | undefined,
  accountId: string | null | undefined,
  artifactType: string
): Promise<ArtifactTemplateOverride | undefined> {
  if (!orgId) return undefined;
  const key = `${orgId}:${accountId ?? ""}:${artifactType}`;
  const cached = templateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

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
  let value: ArtifactTemplateOverride | undefined;
  if (candidates.length > 0) {
    const pick = candidates.find((t: any) => t.scope === "account" && t.artifactType === artifactType)
      ?? candidates.find((t: any) => t.scope === "account" && t.artifactType === "all")
      ?? candidates.find((t: any) => t.scope === "global" && t.artifactType === artifactType)
      ?? candidates[0];
    if (pick.systemAddendum?.trim() || pick.userAddendum?.trim()) {
      value = { systemAddendum: pick.systemAddendum, userAddendum: pick.userAddendum, templateId: pick.id };
    }
  }
  templateCache.set(key, { value, expiresAt: Date.now() + 60_000 });
  return value;
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
  if (project.orgId !== user.orgId) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const catalogEntry = ARTIFACT_CATALOG.find((a) => a.type === artifactType);
  if (!catalogEntry) return NextResponse.json({ error: { code: "INVALID_ARTIFACT" } }, { status: 400 });

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
    if (guardrailWarnings.length > 0) console.warn(`[guardrails] ${artifactType}:`, guardrailWarnings);
  } catch (err) {
    if (err instanceof GuardrailError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 422 }
      );
    }
    throw err;
  }

  // ── RTM / EVM extra data ────────────────────────────────────────────────────
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

  // ── Parallel pre-AI queries (scope baseline + template — independent) ───────
  const [latestScopeBaseline, templateOverride] = await Promise.all([
    (prisma as any).scopeBaseline.findFirst({
      where: { projectId: id },
      orderBy: { version: "desc" },
    }),
    resolveTemplate((user as any).orgId, (project as any).accountId, artifactType),
  ]);

  const scopeBaselineId: string | null = latestScopeBaseline?.id ?? null;

  // ── Build project context ───────────────────────────────────────────────────
  const projectContext: Record<string, unknown> = {
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
    ...(artifactType === "traceability_matrix" && { scheduleTasks, wbsStructure: wbsContent }),
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

  if (latestScopeBaseline) {
    const blReqs: any[] = (latestScopeBaseline.snapshot as any[]) ?? [];
    if (blReqs.length > 0) {
      projectContext.scopeRequirements = blReqs.map((r: any) => `${r.requirementKey}: ${r.statement}`);
      projectContext.scopeBaselineLabel = latestScopeBaseline.label;
    }
  }

  const requirements = project.requirementsDocs[0]?.extractedContent
    ? JSON.stringify(project.requirementsDocs[0].extractedContent)
    : undefined;

  // ── SSE stream — start immediately so the browser sees tokens as they arrive ─
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        // Generate — tokens are forwarded to the client as they arrive
        const content = await generateArtifact(
          artifactType,
          projectContext,
          requirements,
          undefined,
          templateOverride,
          (chunk) => send({ chunk })
        );

        send({ status: "saving" });

        // ── Persist to DB ──────────────────────────────────────────────────────
        const existing = await prisma.artifact.findFirst({
          where: { projectId: id, artifactType },
          include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        });
        const newHash = hashArtifactContent(content);
        const jsonContent = content as Prisma.InputJsonValue;

        let artifact: any;
        let versionId: string;

        if (existing) {
          const currentHash = existing.versions[0]?.contentHash ?? null;
          if (currentHash && currentHash === newHash) {
            if (scopeBaselineId && (existing as any).scopeBaselineId !== scopeBaselineId) {
              await prisma.artifact.update({ where: { id: existing.id }, data: { scopeBaselineId } });
            }
            send({ done: true, noChange: true, artifact: existing });
            return;
          }
          const newVersion = existing.currentVersion + 1;
          const parentVersionId = existing.versions[0]?.id ?? null;
          ({ artifact, versionId } = await prisma.$transaction(async (tx) => {
            const a = await tx.artifact.update({
              where: { id: existing.id },
              data: { content: jsonContent, currentVersion: newVersion, status: "draft", ...(scopeBaselineId ? { scopeBaselineId } : {}) },
            });
            const v = await tx.artifactVersion.create({
              data: {
                artifactId: existing.id,
                versionNumber: newVersion,
                content: jsonContent,
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
                content: jsonContent,
                currentVersion: 1,
                status: "draft",
                ...(scopeBaselineId ? { scopeBaselineId } : {}),
              },
            });
            const v = await tx.artifactVersion.create({
              data: {
                artifactId: a.id,
                versionNumber: 1,
                content: jsonContent,
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

        await prisma.artifactSelection.upsert({
          where: { projectId_artifactType: { projectId: id, artifactType } },
          create: { projectId: id, artifactType, selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
          update: { selectionStatus: "active", selectedById: user.id, selectedAt: new Date() },
        });

        // Fire-and-forget — do NOT await; these must never delay the response
        syncArtifactToTables(id, artifactType, content).catch((err) =>
          console.error(`[artifact-sync] generate sync failed for ${artifactType}:`, err)
        );
        extractAndStoreItems(versionId, artifactType, content).catch((e) =>
          console.error("[item-extractor]", e)
        );

        send({
          done: true,
          artifact: { ...artifact, warnings: guardrailWarnings.length > 0 ? guardrailWarnings : undefined },
        });
      } catch (err: any) {
        console.error(`[artifact] generation failed for ${artifactType}:`, err);
        send({ error: err.message ?? "AI generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
