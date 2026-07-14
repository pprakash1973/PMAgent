export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askPortfolio } from "@/lib/ai";

const PORTFOLIO_ROLES = ["delivery_manager", "delivery_head", "admin"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;

  const { question } = await req.json();
  if (!question) return NextResponse.json({ error: { code: "MISSING_QUESTION" } }, { status: 400 });

  const isPortfolioRole = PORTFOLIO_ROLES.includes(user.role);

  const projects = await prisma.project.findMany({
    where: {
      orgId: user.orgId,
      deletedAt: null,
      ...(isPortfolioRole ? {} : { pmOwnerId: user.id }),
    },
    include: {
      pmOwner: { select: { fullName: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 3 },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      risks: { where: { status: "open" }, orderBy: { probability: "desc" }, take: 5 },
      issues: { where: { status: "open" }, take: 5 },
      _count: { select: { risks: true, issues: true, artifacts: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const summary = projects.map((p) => ({
    name: p.name,
    code: p.code,
    pmOwner: p.pmOwner.fullName,
    methodology: p.methodology,
    health: p.healthStatus,
    budget: p.budget,
    currency: p.currency,
    teamSize: p.teamSize,
    startDate: p.startDate,
    endDate: p.endDate,
    spi: p.statusReports[0]?.healthScore?.spi ?? null,
    cpi: p.statusReports[0]?.healthScore?.cpi ?? null,
    latestStatusSummary: p.statusReports[0]?.aiSummary ?? null,
    openRisksCount: p._count.risks,
    openIssuesCount: p._count.issues,
    artifactsGenerated: p._count.artifacts,
    topOpenRisks: p.risks.map((r) => ({ description: r.description, probability: r.probability, impact: r.impact, owner: r.owner })),
    openIssues: p.issues.map((i) => ({ description: i.description, severity: i.severity, owner: i.owner })),
    upcomingMilestones: p.milestones.map((m) => ({ name: m.name, dueDate: m.dueDate, status: m.status })),
  }));

  const context = {
    user: { name: user.name, role: user.role },
    scope: isPortfolioRole ? "full-portfolio" : "own-projects",
    projectCount: projects.length,
    projects: summary,
  };

  const response = await askPortfolio(question, context, user.role);
  return NextResponse.json({ response });
}
