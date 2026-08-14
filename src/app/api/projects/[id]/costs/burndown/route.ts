import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { computeEvm, computePvAt } from "@/lib/evm";

// Returns weekly EVM series: { date, pv, ev, ac, cpi, spi }[]
// plus summary: { bac, totalAC, totalEV, cpi, spi, eac, vac, etc }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [project, tasks, entries] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.scheduleTask.findMany({ where: { projectId: id }, orderBy: { baselineStart: "asc" } }),
    prisma.costEntry.findMany({ where: { projectId: id }, orderBy: { date: "asc" } }),
  ]);

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── EVM summary via shared utility (canonical formula) ──────────────────────
  const evm = computeEvm(tasks, entries, project.budget);
  const { bac, evNow: currentEV, pvNow, totalAC } = evm;

  // ── Weekly time-series (PM-specific; DM/DH don't need this) ─────────────────
  const totalBaseHours = tasks.reduce(
    (s, t) => s + (t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8),
    0,
  );

  const projectStart = tasks.length
    ? new Date(Math.min(...tasks.map((t) => new Date(t.baselineStart).getTime())))
    : (project.startDate ?? new Date());
  const projectEnd = tasks.length
    ? new Date(Math.max(...tasks.map((t) => new Date(t.baselineFinish).getTime())))
    : (project.endDate ?? new Date());

  const weeks: Date[] = [];
  const cur = new Date(projectStart);
  cur.setDate(cur.getDate() - cur.getDay());
  while (cur <= projectEnd) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  const today = new Date();
  if (!weeks.length || weeks[weeks.length - 1] < today) {
    const extra = new Date(today);
    extra.setDate(extra.getDate() - extra.getDay());
    if (!weeks.length || weeks[weeks.length - 1].getTime() !== extra.getTime()) {
      weeks.push(extra);
    }
  }

  function acAt(d: Date): number {
    return entries.filter(e => new Date(e.date) <= d).reduce((s, e) => s + e.amount, 0);
  }

  const series = weeks.map((w) => {
    const pv = computePvAt(tasks, bac, totalBaseHours, w.getTime());
    const ac = acAt(w);
    const evApprox = w <= today && pvNow > 0 ? Math.min(currentEV, currentEV * (pv / pvNow)) : 0;
    return {
      date: w.toISOString().slice(0, 10),
      pv:  Math.round(pv  * 100) / 100,
      ev:  Math.round(evApprox * 100) / 100,
      ac:  Math.round(ac  * 100) / 100,
      cpi: ac > 0 ? Math.round((evApprox / ac) * 100) / 100 : null,
      spi: pv > 0 ? Math.round((evApprox / pv) * 100) / 100 : null,
    };
  });

  const eac = evm.eac;
  const etc = eac !== null ? Math.round((eac - totalAC) * 100) / 100 : null;
  const vac = eac !== null ? Math.round((bac - eac) * 100) / 100 : null;

  return NextResponse.json({
    summary: {
      bac,
      totalAC,
      totalEV: evm.evNow,
      pvNow,
      cpi: evm.cpi,
      spi: evm.spi,
      eac,
      etc,
      vac,
      cv:  evm.cv,
      sv:  evm.sv,
      percentSpent: bac > 0 ? Math.round((totalAC / bac) * 1000) / 10 : 0,
      currency: project.currency ?? "USD",
    },
    series,
    entries: entries.map((e) => ({
      id: e.id,
      date: new Date(e.date).toISOString().slice(0, 10),
      amount: e.amount,
      category: e.category,
      description: e.description,
    })),
  });
}
