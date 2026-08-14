import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = session.user as any;
  if (!["dm", "pgm", "dh", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  // Build scope filter matching the user's role (same logic as dm/triage route)
  let projectScope: object = {};
  if (user.role === "admin") {
    projectScope = { orgId: user.orgId };
  } else if (user.role === "dh") {
    const clusterIds = (await prisma.clusterAssignment.findMany({
      where: { userId: user.id }, select: { clusterId: true },
    })).map(a => a.clusterId);
    projectScope = clusterIds.length > 0
      ? { account: { clusterId: { in: clusterIds } } }
      : { orgId: user.orgId };
  } else if (user.role === "pgm") {
    const programIds = (await prisma.programAssignment.findMany({
      where: { userId: user.id }, select: { programId: true },
    })).map(a => a.programId);
    projectScope = { programId: { in: programIds } };
  } else {
    // dm
    const accountIds = (await prisma.accountAssignment.findMany({
      where: { userId: user.id }, select: { accountId: true },
    })).map(a => a.accountId);
    projectScope = { accountId: { in: accountIds } };
  }

  const [project, risks, issues, actionItems, milestones, latestReport] = await Promise.all([
    prisma.project.findFirst({
      where: { id, ...projectScope, deletedAt: null },
      select: {
        name: true, healthStatus: true, currentPhase: true,
        budget: true, currency: true, startDate: true, endDate: true,
        engagementType: true,
        pmOwner: { select: { fullName: true } },
        costEntries: { select: { amount: true } },
        scheduleTasks: { select: { percentComplete: true, status: true } },
      },
    }),
    prisma.risk.findMany({
      where: { projectId: id, status: "open" },
      select: { description: true, probability: true, impact: true },
      orderBy: [{ probability: "desc" }, { impact: "desc" }],
      take: 5,
    }),
    prisma.issue.findMany({
      where: { projectId: id, status: "open" },
      select: { description: true, severity: true },
      orderBy: { severity: "asc" },
      take: 5,
    }),
    prisma.actionItem.findMany({
      where: { projectId: id, status: { in: ["open", "acknowledged", "in_progress", "blocked"] } },
      select: { title: true, priority: true, dueDate: true, status: true },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 10,
    }),
    prisma.milestone.findMany({
      where: { projectId: id },
      select: { name: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.statusReport.findFirst({
      where: { projectId: id },
      orderBy: { reportDate: "desc" },
      include: { healthScore: true },
    }),
  ]);

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hs = latestReport?.healthScore ?? null;
  const totalSpent = project.costEntries.reduce((s, e) => s + e.amount, 0);
  const burnPct = project.budget && project.budget > 0
    ? Math.round((totalSpent / project.budget) * 100)
    : null;
  const completedTasks = project.scheduleTasks.filter(t => t.status === "complete").length;
  const totalTasks = project.scheduleTasks.length;
  const scheduleCompletionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;
  const avgPct = totalTasks > 0
    ? Math.round(project.scheduleTasks.reduce((s, t) => s + t.percentComplete, 0) / totalTasks)
    : null;

  const prompt = `You are a senior delivery management consultant reviewing this project for a Delivery Manager.

PROJECT: ${project.name}
PM: ${project.pmOwner?.fullName ?? "Unknown"}
Phase: ${project.currentPhase.replace(/_/g, " ")}
Health: ${project.healthStatus.toUpperCase()}
Engagement: ${project.engagementType?.replace(/_/g, " ") ?? "Unknown"}
Start: ${project.startDate ? new Date(project.startDate).toDateString() : "—"}
End: ${project.endDate ? new Date(project.endDate).toDateString() : "—"}
Budget: ${project.budget ? `${project.currency} ${project.budget.toLocaleString()}` : "Not set"}
Budget burned: ${burnPct !== null ? `${burnPct}%` : "No cost data"}
Schedule progress: ${avgPct !== null ? `${avgPct}% avg task completion` : "No schedule data"}${scheduleCompletionPct !== null ? `, ${scheduleCompletionPct}% tasks complete` : ""}
SPI: ${hs?.spi !== null && hs?.spi !== undefined ? hs.spi.toFixed(2) : "—"}
CPI: ${hs?.cpi !== null && hs?.cpi !== undefined ? hs.cpi.toFixed(2) : "—"}
Composite score: ${hs?.compositeScore !== null && hs?.compositeScore !== undefined ? hs.compositeScore.toFixed(0) + "/100" : "—"}

OPEN RISKS (${risks.length}):
${risks.map(r => `- ${r.description} [prob: ${r.probability}, impact: ${r.impact}]`).join("\n") || "None"}

OPEN ISSUES (${issues.length}):
${issues.map(i => `- [${i.severity}] ${i.description}`).join("\n") || "None"}

OPEN ACTION ITEMS (${actionItems.length}):
${actionItems.map(a => `- [${a.priority.toUpperCase()}] ${a.title} (${a.status})`).join("\n") || "None"}

MILESTONES:
${milestones.map(m => `- ${m.name}: ${new Date(m.dueDate).toDateString()} [${m.status}]`).join("\n") || "None"}

Write a concise DM-facing project review in this EXACT JSON format:
{
  "healthBullets": ["bullet 1", "bullet 2", "bullet 3"],
  "pmProductivityScore": 7,
  "pmProductivityRationale": "one sentence",
  "areasToImprove": ["area 1", "area 2", "area 3"]
}

Rules:
- healthBullets: 3-4 factual bullets on project health, delivery progress, financial status, risks
- pmProductivityScore: integer 1-10 based on completion rates, action item closure, risk management. Be specific and fair.
- pmProductivityRationale: one sentence explaining the score
- areasToImprove: 2-4 specific, actionable areas the PM should focus on
- Be direct and professional. Reference actual data from above (task completion %, SPI/CPI, number of risks/issues).
- Do not be generic. Tailor to this specific project's situation.`;

  let result = {
    healthBullets: ["Project health data loaded."],
    pmProductivityScore: null as number | null,
    pmProductivityRationale: null as string | null,
    areasToImprove: [] as string[],
  };

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      result = {
        healthBullets: parsed.healthBullets ?? result.healthBullets,
        pmProductivityScore: parsed.pmProductivityScore ?? null,
        pmProductivityRationale: parsed.pmProductivityRationale ?? null,
        areasToImprove: parsed.areasToImprove ?? [],
      };
    }
  } catch {
    result.healthBullets = ["AI summary unavailable — check API connection."];
  }

  return NextResponse.json(result);
}
