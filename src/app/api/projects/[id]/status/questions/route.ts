import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateStatusQuestions } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      risks: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 5 },
      issues: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 5 },
      milestones: { orderBy: { dueDate: "asc" }, take: 5 },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      scheduleTasks: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Compute live SPI from schedule
  let liveSpi: number | null = null;
  if (project.scheduleTasks.length > 0) {
    const today = Date.now();
    let pv = 0, ev = 0;
    for (const t of project.scheduleTasks) {
      const s = new Date(t.baselineStart).getTime();
      const f = new Date(t.baselineFinish).getTime();
      const dur = f - s;
      const plannedPct = today <= s ? 0 : today >= f ? 1 : dur > 0 ? (today - s) / dur : 0;
      pv += t.baselineDays * plannedPct;
      ev += t.baselineDays * (t.percentComplete / 100);
    }
    liveSpi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  }

  // Overdue tasks
  const today = new Date();
  const overdueTasks = project.scheduleTasks.filter(
    (t) => t.percentComplete < 100 && new Date(t.baselineFinish) < today
  );

  const lastReport = project.statusReports[0];

  const projectContext = {
    name: project.name,
    customer: project.customer,
    methodology: project.methodology,
    industry: project.industry,
    projectSize: project.projectSize,
    budget: project.budget,
    currency: project.currency,
    startDate: project.startDate,
    endDate: project.endDate,
    healthStatus: project.healthStatus,
    teamSize: project.teamSize,
    openRisks: project.risks.length,
    topRisks: project.risks.slice(0, 3).map((r) => ({ description: r.description, probability: r.probability, impact: r.impact })),
    openIssues: project.issues.length,
    topIssues: project.issues.slice(0, 3).map((i) => ({ description: i.description, severity: i.severity })),
    upcomingMilestones: project.milestones.slice(0, 3).map((m) => ({ name: m.name, dueDate: m.dueDate, status: m.status })),
    scheduledTasks: project.scheduleTasks.length,
    overdueTasks: overdueTasks.length,
    overdueTaskNames: overdueTasks.slice(0, 3).map((t) => t.name),
    liveSpi,
    lastRagStatus: lastReport?.ragStatus ?? null,
    lastHealthScore: lastReport?.healthScore?.compositeScore ?? null,
    lastReportDate: lastReport?.reportDate ?? null,
    daysToDeadline: project.endDate
      ? Math.round((new Date(project.endDate).getTime() - Date.now()) / 86400000)
      : null,
  };

  try {
    const questions = await generateStatusQuestions(projectContext);
    return NextResponse.json({ questions, projectContext });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
