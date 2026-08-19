import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateStatusSummary } from "@/lib/ai";
import { assertStatusIntegrity, computeHealthScore, computeAgileHealthScore } from "@/lib/status-integrity";
import { z } from "zod";

// Bounds user-supplied status input — arbitrary keys allowed for question answers,
// but value types and sizes are constrained to prevent oversized payloads (BUG-5).
const PreviewResultSchema = z.object({
  summary:          z.string().max(5000),
  ragStatus:        z.string().max(20),
  recommendations:  z.array(z.string().max(1000)).max(10),
  accomplishments:  z.array(z.string().max(1000)).max(10),
  nextWeekPlan:     z.array(z.string().max(1000)).max(10),
  metricsNarrative: z.string().max(5000),
});

const StatusInputSchema = z.object({
  preview: z.boolean().optional(),
  ragStatus: z.string().max(10).optional(),
  // Structured Q&A payload sent by the questionnaire UI (array of objects)
  questionnaire: z.array(z.object({
    category: z.string().max(100),
    question: z.string().max(500),
    answer: z.string().max(2000),
  })).max(30).optional(),
  // Cached preview result — when present on a save call (preview:false), skip the AI call
  previewResult: PreviewResultSchema.optional(),
}).catchall(
  z.union([
    z.string().max(2000),
    z.array(z.string().max(500)).max(20),
    z.number(),
    z.boolean(),
    z.null(),
  ])
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as { id: string; orgId: string };
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (project.orgId !== user.orgId) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

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

  const user = session.user as { id: string; orgId: string };
  const { id } = await params;

  // Validate and bound the incoming payload before any processing (BUG-5)
  const body = await req.json();
  const parsed = StatusInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }
  // Strip previewResult from the stored payload — it's a transport-only field
  const { previewResult: cachedPreview, ...rawInput } = parsed.data;

  const [project, openRiskCount, openImpedimentCount] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        risks: { where: { status: "open" }, take: 5 },
        milestones: { orderBy: { dueDate: "asc" }, take: 3 },
      },
    }),
    // Accurate risk count — not capped by the take:5 used for context (BUG-2)
    prisma.risk.count({ where: { projectId: id, status: "open" } }),
    prisma.impediment.count({ where: { projectId: id, resolvedAt: null } }),
  ]);
  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Org-level ownership check (SEC-3)
  if (project.orgId !== user.orgId) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

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
    const totalBaseHours = scheduleTasks.reduce((s, t) => s + (t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8), 0);
    let pv = 0, ev = 0;
    let overdueCount = 0;
    for (const t of scheduleTasks) {
      const taskHours = t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 0) * 8;
      const s = new Date(t.baselineStart).getTime();
      const f = new Date(t.baselineFinish).getTime();
      const dur = f - s;
      const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
      pv += taskHours * plannedPct;
      ev += taskHours * (t.percentComplete / 100);
      if (t.percentComplete < 100 && new Date(t.baselineFinish) < todayDate) overdueCount++;
    }
    // Guard: only report SPI once at least 3% of baseline has elapsed.
    // Near-zero pv (project just started) produces inflated ratios (e.g. 7.22) that
    // mislead dashboards. Cap at 3.00 as a hard ceiling.
    const minPvThreshold = totalBaseHours * 0.03;
    const spi =
      pv > 0 && pv >= minPvThreshold
        ? Math.min(3.0, Math.round((ev / pv) * 100) / 100)
        : null;
    const sv = Math.round((ev - pv) * 10) / 10;
    computedSpi = spi;
    // Live cost CPI from cost entries if available
    const totalAC = costEntries.reduce((s, e) => s + e.amount, 0);
    if (totalAC > 0 && bac > 0 && totalBaseHours > 0) {
      const evCost = scheduleTasks.reduce((s, t) => {
        const taskHours = t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8;
        const pc = t.plannedCost ?? (bac * taskHours / totalBaseHours);
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
  // On save calls (preview:false), reuse the cached preview result if the client
  // sent it back — avoids a redundant AI round-trip that can cause save to hang.
  if (!preview && cachedPreview) {
    aiResult = { ...cachedPreview, assumptions: [], conflicts: [] };
  } else {
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
  }

  // WP-3 (DEF-002): Enforce GR-11 thresholds in code — model RAG verdict is an input, not final word
  const { ragStatus: correctedRagStatus, violations } = assertStatusIntegrity(aiResult, {
    spi: computedSpi,
    cpi: computedCpi,
  });

  // WP-5 (DEF-006): Health score computed deterministically from measured inputs
  const isAgile = project!.deliveryMethod === "agile_scrum" || project!.methodology === "agile_scrum";
  let healthScore: number;
  if (isAgile) {
    // For agile projects fetch sprint completion rate and budget burn
    const completedSprints = await prisma.sprint.findMany({
      where: { projectId: id, state: "completed" },
      orderBy: { sprintNumber: "desc" },
      take: 2,
    });
    let avgCompletionRate: number | null = null;
    if (completedSprints.length > 0) {
      const validSprints = completedSprints.filter(s => (s.committedPoints ?? s.plannedCapacityPoints ?? 0) > 0);
      if (validSprints.length > 0) {
        avgCompletionRate = validSprints.reduce((sum, s) => {
          const committed = s.committedPoints ?? s.plannedCapacityPoints ?? 0;
          return sum + (committed > 0 ? (s.acceptedPoints ?? 0) / committed : 0);
        }, 0) / validSprints.length;
      }
    }
    const bac = project!.budget ?? 0;
    const totalActual = costEntries.reduce((s, e) => s + e.amount, 0);
    const burnPct = bac > 0 ? (totalActual / bac) * 100 : null;
    healthScore = computeAgileHealthScore({
      avgCompletionRate,
      burnPct,
      openImpediments: openImpedimentCount,
      openRisks: openRiskCount,
    });
  } else {
    healthScore = computeHealthScore({
      spi:          computedSpi,
      cpi:          computedCpi,
      overdueTasks: liveEVM?.overdueTasks ?? 0,
      openRisks:    openRiskCount,
    });
  }

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
  const report = await prisma.statusReport.create({
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
