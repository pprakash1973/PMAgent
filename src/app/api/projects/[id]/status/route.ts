import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateStatusSummary } from "@/lib/ai";

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

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const projectContext = {
    name: project.name,
    methodology: project.methodology,
    budget: project.budget,
    startDate: project.startDate,
    endDate: project.endDate,
  };

  let aiResult;
  try {
    aiResult = await generateStatusSummary(rawInput, projectContext);
  } catch {
    aiResult = {
      summary: "Status report submitted. AI summary generation failed — please review manually.",
      ragStatus: rawInput.ragStatus || "amber",
      healthScore: 60,
      recommendations: [],
    };
  }

  // Compute SPI from live schedule tasks if they exist; otherwise fall back to manual entry
  const scheduleTasks = await prisma.scheduleTask.findMany({ where: { projectId: id } });
  let computedSpi: number | null = null;
  if (scheduleTasks.length > 0) {
    const today = Date.now();
    let pv = 0, ev = 0;
    for (const t of scheduleTasks) {
      const s = new Date(t.baselineStart).getTime();
      const f = new Date(t.baselineFinish).getTime();
      const dur = f - s;
      const plannedPct = today <= s ? 0 : today >= f ? 1 : dur > 0 ? (today - s) / dur : 0;
      pv += t.baselineDays * plannedPct;
      ev += t.baselineDays * (t.percentComplete / 100);
    }
    computedSpi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  }

  const report = await prisma.statusReport.create({
    data: {
      projectId: id,
      ragStatus: aiResult.ragStatus,
      aiSummary: aiResult.summary,
      rawInput,
      submittedAt: new Date(),
      healthScore: {
        create: {
          compositeScore: aiResult.healthScore,
          ragStatus: aiResult.ragStatus,
          spi: computedSpi ?? rawInput.spi ?? null,
          cpi: rawInput.cpi || null,
        },
      },
    },
    include: { healthScore: true },
  });

  // Update project health
  await prisma.project.update({
    where: { id },
    data: { healthStatus: aiResult.ragStatus },
  });

  return NextResponse.json({ report, recommendations: aiResult.recommendations }, { status: 201 });
}
