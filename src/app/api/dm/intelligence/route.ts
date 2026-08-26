import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeDeliveryScore, type IntelligenceRow } from "@/lib/delivery-intelligence";

const CAN_ACCESS = ["dm", "dh", "admin"];

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  if (!CAN_ACCESS.includes(user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let accountIds: string[] = [];
  if (user.role === "admin") {
    const accounts = await (prisma.orgAccount as any).findMany({
      where: { orgId: user.orgId, deletedAt: null }, select: { id: true },
    });
    accountIds = accounts.map((a: any) => a.id);
  } else {
    const assignments = await (prisma.accountAssignment as any).findMany({
      where: { userId: user.id }, select: { accountId: true },
    });
    accountIds = assignments.map((a: any) => a.accountId);
  }

  const scopeFilter = accountIds.length > 0
    ? [{ accountId: { in: accountIds } }, { accountId: null, programId: null }]
    : [{ accountId: null, programId: null }];

  const projects = await prisma.project.findMany({
    where: { orgId: user.orgId, deletedAt: null, status: { not: "closed" }, OR: scopeFilter },
    include: {
      pmOwner: { select: { id: true, fullName: true } },
      statusReports: {
        orderBy: { reportDate: "desc" }, take: 1,
        include: { healthScore: true },
      },
      milestones: { select: { status: true, dueDate: true } },
      risks: {
        where: { status: "open" },
        select: { probability: true, description: true },
        orderBy: { probability: "desc" },
        take: 1,
      },
      _count: {
        select: {
          risks: { where: { status: "open", probability: { in: ["high", "very_high"] } } },
          issues: { where: { status: "open", severity: { in: ["critical", "high"] } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = Date.now();
  const rows: IntelligenceRow[] = projects.map((p: any) => {
    const hs = p.statusReports[0]?.healthScore ?? null;
    const spi = hs?.spi ?? null;
    const cpi = hs?.cpi ?? null;
    const totalMs = p.milestones.length;
    const overdueMs = p.milestones.filter((m: any) =>
      m.status === "overdue" || (m.dueDate && new Date(m.dueDate).getTime() < now && m.status !== "completed")
    ).length;
    const daysRemaining = p.endDate
      ? Math.ceil((new Date(p.endDate).getTime() - now) / 86400000)
      : null;

    const { score, confidence } = computeDeliveryScore({
      spi, cpi,
      highRisks: p._count.risks,
      criticalIssues: p._count.issues,
      milestonesTotal: totalMs,
      milestonesOverdue: overdueMs,
      daysRemaining,
      runwaySprints: null,
    });

    const rag: "red" | "amber" | "green" = score < 45 ? "red" : score < 70 ? "amber" : "green";
    const riskCount = p._count.risks + p._count.issues;
    const riskExposure: "low" | "medium" | "high" | "critical" =
      riskCount > 4 ? "critical" : riskCount > 2 ? "high" : riskCount > 0 ? "medium" : "low";

    return {
      projectId: p.id,
      projectName: p.name,
      pmId: p.pmOwnerId,
      pmName: p.pmOwner?.fullName ?? "—",
      industry: (p as any).industry ?? null,
      budget: p.budget ?? null,
      currency: p.currency ?? "USD",
      deliveryScore: score,
      rag,
      confidence,
      drivers: {
        spi,
        cpi,
        riskExposure,
        milestoneSlipPct: totalMs > 0 ? overdueMs / totalMs : 0,
        runwayRatio: null,
      },
      topRisk: p.risks[0]?.description ?? null,
      recommendation: "",
    };
  });

  return NextResponse.json(rows.sort((a, b) => a.deliveryScore - b.deliveryScore));
}
