export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPptx } from "@/lib/export-pptx";

const CAN_STEERING_DECK = ["delivery_manager", "delivery_head", "admin"];

function ragFromIndex(v: number | null | undefined): string {
  if (v == null) return "green";
  if (v >= 0.95) return "green";
  if (v >= 0.85) return "amber";
  return "red";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;
  if (!CAN_STEERING_DECK.includes(user.role)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { projectIds } = await req.json();
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return NextResponse.json({ error: { code: "NO_PROJECTS" } }, { status: 400 });
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, orgId: user.orgId, deletedAt: null },
    include: {
      pmOwner: { select: { fullName: true } },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      risks: { where: { status: "open" }, take: 3 },
      issues: { where: { status: "open" }, take: 3 },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
    },
  });

  if (projects.length === 0) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
  const spis = projects.map((p) => p.statusReports[0]?.healthScore?.spi).filter((v): v is number => v != null);
  const cpis = projects.map((p) => p.statusReports[0]?.healthScore?.cpi).filter((v): v is number => v != null);
  const avgSpi = spis.length ? spis.reduce((a, b) => a + b, 0) / spis.length : null;
  const avgCpi = cpis.length ? cpis.reduce((a, b) => a + b, 0) / cpis.length : null;

  const dashboardProjects = projects.map((p) => {
    const spi = p.statusReports[0]?.healthScore?.spi;
    const cpi = p.statusReports[0]?.healthScore?.cpi;
    const overall = p.healthStatus;
    return {
      name: p.name,
      scheduleRag: spi != null ? ragFromIndex(spi) : overall,
      costRag: cpi != null ? ragFromIndex(cpi) : overall,
      scopeRag: overall,
      qualityRag: overall,
    };
  });

  const allRisks = projects.flatMap((p) => p.risks.map((r) => ({
    description: `[${p.name}] ${r.description}`, severity: r.impact, owner: r.owner ?? p.pmOwner.fullName, status: r.status,
  })));
  const allIssues = projects.flatMap((p) => p.issues.map((i) => ({
    description: `[${p.name}] ${i.description}`, severity: i.severity, owner: i.owner ?? p.pmOwner.fullName, status: i.status,
  })));

  const decisions = projects
    .filter((p) => p.healthStatus === "red")
    .map((p) => `Approve intervention plan for ${p.name} — currently Critical (SPI ${p.statusReports[0]?.healthScore?.spi?.toFixed(2) ?? "—"}, CPI ${p.statusReports[0]?.healthScore?.cpi?.toFixed(2) ?? "—"})`);

  const nextMilestone = projects
    .flatMap((p) => p.milestones.map((m) => ({ name: `${m.name} (${p.name})`, date: m.dueDate })))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  const content = {
    asOfDate: new Date().toISOString().slice(0, 10),
    projects: dashboardProjects,
    bac: totalBudget ? `$${totalBudget.toLocaleString()}` : "TBD",
    cpi: avgCpi != null ? avgCpi.toFixed(2) : null,
    spi: avgSpi != null ? avgSpi.toFixed(2) : null,
    percentComplete: null,
    nextMilestone: nextMilestone ? { name: nextMilestone.name, date: new Date(nextMilestone.date).toLocaleDateString() } : undefined,
    risks: allRisks,
    issues: allIssues,
    decisions,
  };

  const deckTitle = projects.length === 1 ? projects[0].name : `Steering Committee — ${projects.length} Projects`;

  try {
    const buf = await buildPptx("executive_dashboard", content, deckTitle);
    const safeName = `Steering-Committee-Deck_${new Date().toISOString().slice(0, 10)}`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeName}.pptx"`,
      },
    });
  } catch (err: any) {
    console.error("steering-deck export error:", err);
    return NextResponse.json({ error: err.message || "Deck generation failed" }, { status: 500 });
  }
}
