import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Returns weekly EVM series: { date, pv, ev, ac, cpi, spi, eac }[]
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

  const bac = project.budget ?? 0;

  // ── Planned Value curve ─────────────────────────────────────────────────────
  // Distribute each task's planned cost linearly across its baseline duration.
  // If no plannedCost on tasks, distribute BAC proportionally by baselineDays.
  const totalBaseDays = tasks.reduce((s, t) => s + (t.baselineDays || 1), 0);

  function taskPlannedCost(t: (typeof tasks)[0]): number {
    if (t.plannedCost != null && t.plannedCost > 0) return t.plannedCost;
    if (bac > 0 && totalBaseDays > 0) return (bac * (t.baselineDays || 1)) / totalBaseDays;
    return 0;
  }

  // Determine date range
  const projectStart = tasks.length
    ? new Date(Math.min(...tasks.map((t) => new Date(t.baselineStart).getTime())))
    : (project.startDate ?? new Date());
  const projectEnd = tasks.length
    ? new Date(Math.max(...tasks.map((t) => new Date(t.baselineFinish).getTime())))
    : (project.endDate ?? new Date());

  // Build weekly buckets
  const weeks: Date[] = [];
  const cur = new Date(projectStart);
  cur.setDate(cur.getDate() - cur.getDay()); // align to Sunday
  while (cur <= projectEnd) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  // Always include at least today
  const today = new Date();
  if (!weeks.length || weeks[weeks.length - 1] < today) {
    const extra = new Date(today);
    extra.setDate(extra.getDate() - extra.getDay());
    if (!weeks.length || weeks[weeks.length - 1].getTime() !== extra.getTime()) {
      weeks.push(extra);
    }
  }

  // PV: cumulative planned value at each week boundary
  function pvAt(d: Date): number {
    return tasks.reduce((sum, t) => {
      const start = new Date(t.baselineStart).getTime();
      const end = new Date(t.baselineFinish).getTime();
      const dT = d.getTime();
      if (dT <= start) return sum;
      if (dT >= end) return sum + taskPlannedCost(t);
      const elapsed = dT - start;
      const total = end - start || 1;
      return sum + taskPlannedCost(t) * (elapsed / total);
    }, 0);
  }

  // EV: Σ(plannedCost × %complete) — snapshot at today, constant across time
  const currentEV = tasks.reduce((s, t) => s + taskPlannedCost(t) * (t.percentComplete / 100), 0);

  // AC: cumulative actual cost from entries up to each date
  function acAt(d: Date): number {
    return entries
      .filter((e) => new Date(e.date) <= d)
      .reduce((s, e) => s + e.amount, 0);
  }

  const totalAC = entries.reduce((s, e) => s + e.amount, 0);
  const cpi = totalAC > 0 ? currentEV / totalAC : 1;
  const pvNow = pvAt(today);
  const spi = pvNow > 0 ? currentEV / pvNow : 1;
  const eac = cpi > 0 ? bac / cpi : bac;
  const etc = eac - totalAC;
  const vac = bac - eac;
  const cv = currentEV - totalAC;
  const sv = currentEV - pvNow;

  const series = weeks.map((w) => {
    const pv = pvAt(w);
    const ac = acAt(w);
    // EV at past weeks: use % complete * planned (we only have current %, not historical)
    // Approximate: if w <= today, use currentEV scaled by pv/pvNow
    const evApprox = w <= today && pvNow > 0 ? Math.min(currentEV, currentEV * (pvAt(w) / pvNow)) : 0;
    const weekCpi = ac > 0 ? evApprox / ac : null;
    const weekSpi = pv > 0 ? evApprox / pv : null;
    return {
      date: w.toISOString().slice(0, 10),
      pv: Math.round(pv * 100) / 100,
      ev: Math.round(evApprox * 100) / 100,
      ac: Math.round(ac * 100) / 100,
      cpi: weekCpi != null ? Math.round(weekCpi * 100) / 100 : null,
      spi: weekSpi != null ? Math.round(weekSpi * 100) / 100 : null,
    };
  });

  return NextResponse.json({
    summary: {
      bac: Math.round(bac * 100) / 100,
      totalAC: Math.round(totalAC * 100) / 100,
      totalEV: Math.round(currentEV * 100) / 100,
      pvNow: Math.round(pvNow * 100) / 100,
      cpi: Math.round(cpi * 1000) / 1000,
      spi: Math.round(spi * 1000) / 1000,
      eac: Math.round(eac * 100) / 100,
      etc: Math.round(etc * 100) / 100,
      vac: Math.round(vac * 100) / 100,
      cv: Math.round(cv * 100) / 100,
      sv: Math.round(sv * 100) / 100,
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
