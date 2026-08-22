import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifact } from "@/lib/ai";
import { normaliseProbImpact } from "@/lib/artifact-sync";

export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: true,
      requirementsDocs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project || (project as any).orgId !== user.orgId)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Build project context (mirrors artifact route)
  const projectContext: Record<string, unknown> = {
    name: project.name,
    code: (project as any).code,
    customer: (project as any).customer,
    methodology: (project as any).methodology,
    budget: (project as any).budget,
    currency: (project as any).currency,
    startDate: project.startDate,
    endDate: project.endDate,
    description: project.description,
    milestones: project.milestones,
  };

  const latestScopeBaseline = await (prisma as any).scopeBaseline.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });
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

  // Generate risks from AI
  const content = await generateArtifact("risk_register", projectContext, requirements) as any;
  const aiRisks: any[] = content.risks ?? [];
  if (aiRisks.length === 0)
    return NextResponse.json({ added: 0, message: "AI returned no risks." });

  // Fetch existing risk descriptions for dedup (normalised lowercase)
  const existing = await prisma.risk.findMany({
    where: { projectId: id },
    select: { description: true, riskId: true },
    orderBy: { createdAt: "asc" },
  });
  const existingDescs = new Set(existing.map((r) => r.description.toLowerCase().trim()));
  const nextSeq = existing.length;

  // Keep only risks whose description doesn't already exist
  const newRisks = aiRisks.filter((r: any) => {
    const desc = String(r.statement ?? r.description ?? "").toLowerCase().trim();
    return desc.length > 0 && !existingDescs.has(desc);
  });

  if (newRisks.length === 0)
    return NextResponse.json({ added: 0, message: "No new risks identified — all risks already exist." });

  await prisma.risk.createMany({
    data: newRisks.map((r: any, idx: number) => ({
      projectId: id,
      riskId: `R-${String(nextSeq + idx + 1).padStart(3, "0")}`,
      description: String(r.statement ?? r.description ?? ""),
      category: r.category ?? null,
      probability: normaliseProbImpact(r.probability),
      impact: normaliseProbImpact(r.impact),
      status: "open",
      owner: r.owner ?? null,
      mitigation: Array.isArray(r.responseActions)
        ? r.responseActions.join("; ")
        : (r.mitigation ?? r.strategy ?? null),
      dueDate: r.dueDate ? new Date(r.dueDate) : null,
      requirementRef: r.requirementRef ?? "General",
    })),
  });

  return NextResponse.json({ added: newRisks.length });
  } catch (err: any) {
    console.error("[regenerate risks]", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
