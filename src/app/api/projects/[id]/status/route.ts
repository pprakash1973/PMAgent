import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateStatusSummary } from "@/lib/ai";
import { assertStatusIntegrity, computeHealthScore } from "@/lib/status-integrity";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const reports = await prisma.statusReport.findMany({
    where: { projectId: id },
    include: { healthScore: true },
    orderBy: { reportDate: "desc" },
    take: 10,
  });

  return NextResponse.json(reports);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const rawInput = await req.json();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      risks: { where: { status: "open" }, take: 5 },
      milestones: { orderBy: { dueDate: "asc" }, take: 3 },
    },
  });
  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const projectContext = {
    name: project.name,
    methodology: project.methodology,
    budget: project.budget,
    currency: project.currency,
    startDate: project.startDate,
    endDate: project.endDate,
    healthStatus: project.healthStatus,
    openRisks: project.risks.length,
  };

  const preview = rawInput.preview === true;

  // Compute full EVM from live schedule tasks + cost entries
  const [scheduleTasks, costEntries] = await Promise.all([
    prisma.scheduleTask.findMany({ where: { projectId: id } }),
    prisma.costEntry.findMany({ where: { projectId: id } }),
  ]);
  let computedSpi: number | null = null;
  let computedCpi: number | null = null;
  let liveEVM: { pv: number; ev: number; sv: number; spi: number | null; overdueTasks: number; ac?: number; cpi?: number | null } | undefined;
  if (scheduleTasks.length > 0) {
    const now = Date.now();
    const todayDate = new Date();
    const bac = project.budget ?? 0;
    const totalBaseDays = scheduleTasks.reduce((s, t) => s + (t.baselineDays || 1), 0);
    let pv = 0, ev = 0;
    let overdueCount = 0;
    for (const t of scheduleTasks) {
      const s = new Date(t.baselineStart).getTime();
      const f = new Date(t.baselineFinish).getTime();
      const dur = f - s;
      const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
      pv += t.baselineDays * plannedPct;
      ev += t.baselineDays * (t.percentComplete / 100);
      if (t.percentComplete < 100 && new Date(t.baselineFinish) < todayDate) overdueCount++;
    }
    const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
    const sv = Math.round((ev - pv) * 10) / 10;
    computedSpi = spi;
    // Live cost CPI from cost entries if available
    const totalAC = costEntries.reduce((s, e) => s + e.amount, 0);
    if (totalAC > 0 && bac > 0 && totalBaseDays > 0) {
      const evCost = scheduleTasks.reduce((s, t) => {
        const pc = t.plannedCost ?? (bac * (t.baselineDays || 1) / totalBaseDays);
        return s + pc * (t.percentComplete / 100);
      }, 0);
      computedCpi = evCost > 0 ? Math.round((evCost / totalAC) * 1000) / 1000 : null;
    }
    liveEVM = { pv: Math.round(pv * 10) / 10, ev: Math.round(ev * 10) / 10, sv, spi, overdueTasks: overdueCount, ac: totalAC, cpi: computedCpi };
  }

  let aiResult: {
    summary: string;
    ragStatus: string;
    recommendations: string[];
    accomplishments: string[];
    nextWeekPlan: string[];
    metricsNarrative: string;
    assumptions: string[];
    conflicts: string[];
  };
  try {
    aiResult = await generateStatusSummary(rawInput, projectContext, liveEVM);
  } catch {
    aiResult = {
      summary: "Status report submitted. AI summary generation failed — please review manually.",
      ragStatus: (rawInput.ragStatus as string) || "amber",
      recommendations: [] as string[],
      accomplishments: [] as string[],
      nextWeekPlan: [] as string[],
      metricsNarrative: "",
      assumptions: [] as string[],
      conflicts: [] as string[],
    };
  }

  // WP-3 (DEF-002): Enforce GR-11 thresholds in code — model RAG verdict is an input, not final word
  const { ragStatus: correctedRagStatus, violations } = assertStatusIntegrity(aiResult, {
    spi: computedSpi,
    cpi: computedCpi,
  });

  // WP-5 (DEF-006): Health score computed deterministically from measured inputs
  const healthScore = computeHealthScore({
    spi:          computedSpi,
    cpi:          computedCpi,
    overdueTasks: liveEVM?.overdueTasks ?? 0,
    openRisks:    project.risks.length,
  });

  // Preview mode: return AI result without touching the DB
  if (preview) {
    return NextResponse.json({
      recommendations:  aiResult.recommendations,
      accomplishments:  aiResult.accomplishments,
      nextWeekPlan:     aiResult.nextWeekPlan,
      metricsNarrative: aiResult.metricsNarrative,
      summary:          aiResult.summary,
      ragStatus:        correctedRagStatus,
      healthScore,
      spi:              computedSpi ?? null,
      cpi:              computedCpi ?? null,
      violations,
    });
  }

  const savedAt = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report = await (prisma.statusReport as any).create({
    data: {
      projectId:  id,
      ragStatus:  correctedRagStatus,
      aiSummary:  aiResult.summary,
      rawInput,
      submittedAt: savedAt,
      violations:  violations.length > 0 ? violations : undefined,
      healthScore: {
        create: {
          compositeScore: healthScore,
          ragStatus:      correctedRagStatus,
          spi:            computedSpi ?? null,
          cpi:            computedCpi ?? null,
        },
      },
    },
    include: { healthScore: true },
  });

  await prisma.project.update({
    where: { id },
    data: { healthStatus: correctedRagStatus },
  });

  return NextResponse.json({
    report,
    savedAt:          savedAt.toISOString(),
    recommendations:  aiResult.recommendations,
    accomplishments:  aiResult.accomplishments,
    nextWeekPlan:     aiResult.nextWeekPlan,
    metricsNarrative: aiResult.metricsNarrative,
    summary:          aiResult.summary,
    ragStatus:        correctedRagStatus,
    healthScore,
    violations,
  }, { status: 201 });
}
