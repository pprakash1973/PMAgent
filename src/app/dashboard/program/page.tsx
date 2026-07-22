import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import PgmDashboardClient, { type PgmProject, type PgmProgram, type TrendPoint } from "./pgm-dashboard-client";

const CAN_PROGRAM = ["pgm", "admin"];

function computeWeeksInRag(reports: Array<{ healthScore: { ragStatus: string | null } | null; reportDate: Date }>, currentRag: string): number {
  let count = 0;
  for (const r of reports) {
    const rag = r.healthScore?.ragStatus ?? "green";
    if (rag === currentRag) count++;
    else break;
  }
  return count;
}

export default async function ProgramDashboardPage() {
  const session = await auth();
  const user = session!.user as any;
  if (!CAN_PROGRAM.includes(user.role)) redirect("/dashboard");

  const assignments = await prisma.programAssignment.findMany({
    where: { userId: user.id },
    include: {
      program: {
        include: {
          client: { include: { cluster: true } },
          projects: {
            where: { deletedAt: null },
            include: {
              pmOwner: { select: { id: true, fullName: true } },
              scheduleTasks: {
                select: { baselineStart: true, baselineFinish: true, baselineDays: true, percentComplete: true },
              },
              costEntries: { select: { amount: true } },
              statusReports: {
                orderBy: { reportDate: "desc" },
                take: 8,
                include: { healthScore: true },
              },
              _count: { select: { risks: true, issues: true } },
            },
          },
        },
      },
    },
  });

  const now = Date.now();

  const programs = assignments.map((a) => a.program);

  // Build PgmProject[] — one entry per project across all programs
  const pgmProjects: PgmProject[] = [];

  for (const prog of programs) {
    for (const p of prog.projects) {
      // Live EVM
      let pv = 0, ev = 0;
      for (const t of p.scheduleTasks) {
        if (!t.baselineStart || !t.baselineFinish) continue;
        const s = new Date(t.baselineStart).getTime();
        const f = new Date(t.baselineFinish).getTime();
        const dur = f - s;
        const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
        pv += t.baselineDays * plannedPct;
        ev += t.baselineDays * (t.percentComplete / 100);
      }
      const liveSpi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
      const storedSpi = p.statusReports[0]?.healthScore?.spi ?? null;
      const storedCpi = p.statusReports[0]?.healthScore?.cpi ?? null;
      const spi = liveSpi ?? storedSpi;

      const schedPct = p.scheduleTasks.length
        ? Math.round(p.scheduleTasks.reduce((s, t) => s + t.percentComplete, 0) / p.scheduleTasks.length)
        : 0;
      const totalSpent = p.costEntries.reduce((s, e) => s + e.amount, 0);
      const budPct = p.budget && p.budget > 0 ? Math.round((totalSpent / p.budget) * 100) : 0;

      let rag: "red" | "amber" | "green" = (p.healthStatus as any) ?? "green";
      if (spi !== null) {
        if (spi < 0.8) rag = "red";
        else if (spi < 0.9 && rag === "green") rag = "amber";
      }

      const lastReport = p.statusReports[0] ?? null;
      const weeksInRag = computeWeeksInRag(
        p.statusReports as any,
        rag
      );

      pgmProjects.push({
        id:           p.id,
        name:         p.name,
        code:         (p as any).code ?? "",
        programId:    prog.id,
        programName:  prog.name,
        clientName:   (prog.client as any)?.name ?? "—",
        pmName:       p.pmOwner.fullName,
        pmId:         p.pmOwner.id,
        phase:        (p as any).currentPhase ?? "initiation",
        status:       p.status ?? "active",
        rag,
        spi,
        cpi:          storedCpi ?? null,
        schedPct,
        budPct,
        budget:       p.budget ?? null,
        riskCount:    p._count.risks,
        issueCount:   p._count.issues,
        lastReportDate: lastReport ? new Date(lastReport.reportDate).toISOString() : null,
        weeksInRag,
      });
    }
  }

  // Build PgmProgram[] — rollup per program
  const pgmPrograms: PgmProgram[] = programs.map((prog) => {
    const projs = pgmProjects.filter((p) => p.programId === prog.id);
    const redCount   = projs.filter((p) => p.rag === "red").length;
    const amberCount = projs.filter((p) => p.rag === "amber").length;
    const ragRollup: "red" | "amber" | "green" =
      redCount > 0 ? "red" : amberCount > 0 ? "amber" : "green";
    const totalBudget = projs.reduce((s, p) => s + (p.budget ?? 0), 0);
    const totalBudPct = projs.length
      ? Math.round(projs.reduce((s, p) => s + p.budPct, 0) / projs.length)
      : 0;
    return {
      id:                prog.id,
      name:              prog.name,
      clientName:        (prog.client as any)?.name ?? "—",
      clusterName:       (prog.client as any)?.cluster?.name ?? "—",
      ragRollup,
      projectCount:      projs.length,
      budgetConsumedPct: totalBudPct,
      prevRagRollup:     null,
    };
  });

  // Build 6-month trend from all status reports across scope
  const allReports = programs.flatMap((prog) =>
    prog.projects.flatMap((p) => p.statusReports)
  );
  const trends: TrendPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const label = d.toLocaleString("en", { month: "short" });
    const yr = d.getFullYear(), mo = d.getMonth();
    const periodReports = allReports.filter((r) => {
      const rd = new Date(r.reportDate);
      return rd.getFullYear() === yr && rd.getMonth() === mo;
    });
    const spiVals = periodReports.map((r) => r.healthScore?.spi ?? null).filter((v): v is number => v !== null);
    const cpiVals = periodReports.map((r) => r.healthScore?.cpi ?? null).filter((v): v is number => v !== null);
    const greenCount = periodReports.filter((r) => r.healthScore?.ragStatus === "green").length;
    return {
      label,
      avgSpi:    spiVals.length ? Math.round(spiVals.reduce((a, b) => a + b, 0) / spiVals.length * 100) / 100 : null,
      avgCpi:    cpiVals.length ? Math.round(cpiVals.reduce((a, b) => a + b, 0) / cpiVals.length * 100) / 100 : null,
      greenPct:  periodReports.length ? Math.round(greenCount / periodReports.length * 100) : null,
    };
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PgmDashboardClient
        projects={pgmProjects}
        programs={pgmPrograms}
        trends={trends}
        userName={user.name ?? user.email ?? "PgM"}
      />
    </div>
  );
}
