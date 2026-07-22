import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const CAN_PROGRAM = ["pgm", "admin"];

export async function GET() {
  const session = await auth();
  const user = session?.user as any;
  if (!user || !CAN_PROGRAM.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
                take: 4,
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
  const projects = [];

  for (const a of assignments) {
    const prog = a.program;
    for (const p of prog.projects) {
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

      projects.push({
        id:             p.id,
        name:           p.name,
        code:           (p as any).code ?? "",
        programName:    prog.name,
        clientName:     (prog.client as any)?.name ?? "—",
        pmName:         p.pmOwner.fullName,
        pmId:           p.pmOwner.id,
        phase:          (p as any).currentPhase ?? "initiation",
        status:         p.status ?? "active",
        rag,
        spi,
        cpi:            storedCpi ?? null,
        schedPct,
        budPct,
        budget:         p.budget ?? null,
        riskCount:      p._count.risks,
        issueCount:     p._count.issues,
        lastReportDate: p.statusReports[0] ? new Date(p.statusReports[0].reportDate).toISOString() : null,
      });
    }
  }

  return NextResponse.json({ projects });
}
