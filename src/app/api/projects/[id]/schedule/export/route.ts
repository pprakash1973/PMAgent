export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function buildScheduleSheet(wb: XLSX.WorkBook, tasks: any[]) {
  const headers = [
    "WBS Code", "Task Name", "Phase", "Owner",
    "Baseline Start", "Baseline Finish", "Baseline Days",
    "Actual Start", "Actual Finish",
    "% Complete", "Status",
  ];

  const rows: any[][] = [headers];
  for (const t of tasks) {
    rows.push([
      t.wbsCode ?? "",
      t.name ?? "",
      t.phase ?? "",
      t.owner ?? "",
      fmtDate(t.baselineStart),
      fmtDate(t.baselineFinish),
      t.baselineDays ?? "",
      fmtDate(t.actualStart),
      fmtDate(t.actualFinish),
      t.percentComplete ?? 0,
      t.status ?? "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 36, 18, 18, 14, 14, 14, 14, 14, 12, 14]);
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
}

function computeEVM(tasks: any[]) {
  const today = Date.now();
  let totalPV = 0;
  let totalEV = 0;

  for (const t of tasks) {
    const planned = t.baselineDays ?? 0;
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;

    let plannedPct: number;
    if (today <= s) plannedPct = 0;
    else if (today >= f) plannedPct = 1;
    else plannedPct = dur > 0 ? (today - s) / dur : 0;

    totalPV += planned * plannedPct;
    totalEV += planned * (t.percentComplete / 100);
  }

  const spi = totalPV > 0 ? totalEV / totalPV : null;
  const sv = totalEV - totalPV;

  return {
    pv: Math.round(totalPV * 10) / 10,
    ev: Math.round(totalEV * 10) / 10,
    sv: Math.round(sv * 10) / 10,
    spi: spi !== null ? Math.round(spi * 100) / 100 : null,
  };
}

function buildEVMSheet(wb: XLSX.WorkBook, tasks: any[], projectName: string) {
  const kpi = computeEVM(tasks);
  const total = tasks.reduce((s, t) => s + (t.baselineDays ?? 0), 0);
  const done = tasks.filter(t => t.status === "complete").length;
  const inProg = tasks.filter(t => t.status === "in_progress").length;
  const notStarted = tasks.filter(t => t.status === "not_started").length;
  const overallPct = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length)
    : 0;

  const rows: any[][] = [
    ["EVM Summary — " + projectName],
    [],
    ["Metric", "Value", "Unit"],
    ["Planned Value (PV)", kpi.pv, "task-days"],
    ["Earned Value (EV)", kpi.ev, "task-days"],
    ["Schedule Variance (SV)", kpi.sv, "task-days (EV−PV)"],
    ["Schedule Performance Index (SPI)", kpi.spi ?? "N/A", kpi.spi !== null ? (kpi.spi >= 1 ? "On / Ahead of schedule" : "Behind schedule") : ""],
    [],
    ["Task Counts", "Value", ""],
    ["Total Tasks", tasks.length, ""],
    ["Total Baseline Days", total, "days"],
    ["Complete", done, "tasks"],
    ["In Progress", inProg, "tasks"],
    ["Not Started", notStarted, "tasks"],
    ["Overall % Complete", overallPct, "%"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [38, 14, 32]);
  XLSX.utils.book_append_sheet(wb, ws, "EVM Summary");
}

function buildPhaseSheet(wb: XLSX.WorkBook, tasks: any[]) {
  const phaseMap = new Map<string, { total: number; done: number; days: number; tasks: number }>();
  for (const t of tasks) {
    const ph = t.phase ?? "Unassigned";
    if (!phaseMap.has(ph)) phaseMap.set(ph, { total: 0, done: 0, days: 0, tasks: 0 });
    const e = phaseMap.get(ph)!;
    e.tasks += 1;
    e.days += t.baselineDays ?? 0;
    e.done += t.percentComplete;
    e.total += 100;
  }

  const headers = ["Phase", "Tasks", "Baseline Days", "% Complete", "Status"];
  const rows: any[][] = [headers];
  for (const [ph, e] of phaseMap) {
    const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
    const status = pct === 100 ? "Complete" : pct > 0 ? "In Progress" : "Not Started";
    rows.push([ph, e.tasks, e.days, pct, status]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [24, 10, 16, 14, 14]);
  XLSX.utils.book_append_sheet(wb, ws, "Phase Summary");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const user = session.user as any;

  const project = await prisma.project.findUnique({
    where: { id, orgId: user.orgId, deletedAt: null },
  });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });

  const wb = XLSX.utils.book_new();
  buildScheduleSheet(wb, tasks);
  buildEVMSheet(wb, tasks, project.name);
  buildPhaseSheet(wb, tasks);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = project.name.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `Schedule_${safeName}_${date}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
