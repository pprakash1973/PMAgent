import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;

  const projects = await prisma.project.findMany({
    where: { orgId: user.orgId, deletedAt: null },
    include: {
      pmOwner: { select: { fullName: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 2 },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      _count: { select: { risks: true, issues: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const healthDist = { green: 0, amber: 0, red: 0 };
  for (const p of projects) {
    const h = p.healthStatus as "green" | "amber" | "red";
    if (h in healthDist) healthDist[h]++;
  }

  const atRisk = projects.filter((p) => p.healthStatus === "amber" || p.healthStatus === "red");
  const upcoming = projects
    .flatMap((p) => p.milestones.map((m) => ({ ...m, projectName: p.name, projectId: p.id })))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  return NextResponse.json({
    totalActiveProjects: projects.length,
    healthDistribution: healthDist,
    projects,
    atRiskProjects: atRisk,
    upcomingMilestones: upcoming,
  });
}
