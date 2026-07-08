export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

// ── helpers ──────────────────────────────────────────────────────────────────

function headerRow(ws: XLSX.WorkSheet, headers: string[], startRow = 1) {
  headers.forEach((h, i) => {
    const cell: XLSX.CellObject = { v: h, t: "s" };
    ws[XLSX.utils.encode_cell({ r: startRow - 1, c: i })] = cell;
  });
  if (!ws["!ref"]) ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(cur.toLocaleDateString("en-US", { month: "short", year: "numeric" }));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

// ── sheet builders ────────────────────────────────────────────────────────────

/** Fixed Price — budget vs actuals burndown by month */
function buildFixedPrice(wb: XLSX.WorkBook, project: any) {
  const months = project.startDate && project.endDate
    ? monthsBetween(new Date(project.startDate), new Date(project.endDate))
    : Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);

  const budget = project.budget ?? 0;
  const monthly = budget / months.length;

  // Summary sheet
  const summary = XLSX.utils.aoa_to_sheet([
    ["Cost Burndown Tracker — Fixed Price"],
    [],
    ["Project", project.name],
    ["Customer", project.customer ?? "—"],
    ["Contract Value", budget],
    ["Currency", project.currency ?? "USD"],
    ["Start Date", project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"],
    ["End Date", project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"],
    ["Duration (months)", months.length],
    [],
    ["Instructions", "Enter actual monthly costs in the 'Actual Spend' column of the Burndown sheet."],
    ["", "Remaining Budget and % Burned will update automatically."],
  ]);
  setColWidths(summary, [22, 30]);
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  // Burndown sheet
  const rows: any[][] = [
    ["Month", "Planned Cumulative Budget ($)", "Actual Cumulative Spend ($)", "Remaining Budget ($)", "% Budget Burned", "Monthly Planned ($)", "Monthly Actual ($)", "Monthly Variance ($)"],
  ];
  months.forEach((m, i) => {
    const planCum = `${monthly * (i + 1)}`;
    // Actual cumulative = sum of G2..G{row} — user fills column G
    const row = i + 2; // excel row (1-indexed, row 1 = header)
    rows.push([
      m,
      { f: `${(monthly * (i + 1)).toFixed(2)}` },           // B: planned cumulative
      { f: `IF(G${row}="","",SUM($G$2:G${row}))` },         // C: actual cumulative
      { f: `$B$3-IF(C${row}="",B${row},C${row})` },         // D: remaining (uses contract value in summary B3... we embed it directly)
      { f: `IF(C${row}="","",C${row}/$B$3)` },              // E: % burned
      monthly.toFixed(2),                                     // F: monthly planned
      "",                                                     // G: monthly actual (user fills)
      { f: `IF(G${row}="","",F${row}-G${row})` },           // H: variance
    ]);
  });

  const burndown = XLSX.utils.aoa_to_sheet(rows);
  // Embed contract value directly so D/E formulas work standalone
  // Override D and E to reference the actual budget value
  months.forEach((_, i) => {
    const row = i + 2;
    const dCell = XLSX.utils.encode_cell({ r: row - 1, c: 3 });
    const eCell = XLSX.utils.encode_cell({ r: row - 1, c: 4 });
    burndown[dCell] = { f: `${budget}-IF(C${row}="",B${row},C${row})`, t: "n" };
    burndown[eCell] = { f: `IF(C${row}="","",C${row}/${budget})`, t: "n" };
  });
  setColWidths(burndown, [16, 26, 26, 22, 18, 20, 20, 22]);
  XLSX.utils.book_append_sheet(wb, burndown, "Burndown");

  // Milestones sheet
  const msRows: any[][] = [["Milestone", "Due Date", "Status", "Budget Impact ($)", "Notes"]];
  (project.milestones ?? []).forEach((m: any) => {
    msRows.push([m.name, new Date(m.dueDate).toLocaleDateString(), m.status, "", ""]);
  });
  const ms = XLSX.utils.aoa_to_sheet(msRows);
  setColWidths(ms, [30, 14, 12, 18, 30]);
  XLSX.utils.book_append_sheet(wb, ms, "Milestones");
}

/** Time & Material — weekly hours × rate tracker */
function buildTM(wb: XLSX.WorkBook, project: any) {
  const summary = XLSX.utils.aoa_to_sheet([
    ["Cost Burndown Tracker — Time & Material"],
    [],
    ["Project", project.name],
    ["Customer", project.customer ?? "—"],
    ["Budget Cap", project.budget ?? "Open"],
    ["Currency", project.currency ?? "USD"],
    ["Start Date", project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"],
    ["End Date", project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"],
    [],
    ["Instructions", "1. Add each resource in the 'Rate Card' sheet."],
    ["", "2. Log weekly hours in the 'Weekly Hours Log' sheet."],
    ["", "3. The 'Cost Summary' sheet auto-calculates total cost."],
  ]);
  setColWidths(summary, [22, 35]);
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  // Rate card
  const rateRows = [
    ["Resource Name", "Role", "Hourly Rate ($)", "Daily Rate ($)", "Notes"],
    ...Array.from({ length: 10 }, () => ["", "", "", { f: "IF(C2<>\"\",C2*8,\"\")" }, ""]),
  ];
  const rate = XLSX.utils.aoa_to_sheet(rateRows);
  // Fix daily rate formulas per row
  for (let i = 2; i <= 11; i++) {
    rate[XLSX.utils.encode_cell({ r: i - 1, c: 3 })] = { f: `IF(C${i}<>"",C${i}*8,"")`, t: "n" };
  }
  setColWidths(rate, [24, 20, 16, 16, 24]);
  XLSX.utils.book_append_sheet(wb, rate, "Rate Card");

  // Weekly hours log
  const weeks = project.startDate && project.endDate
    ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (7 * 86400000))
    : 26;
  const weekCols = Array.from({ length: Math.min(weeks, 52) }, (_, i) => `Wk ${i + 1}`);
  const hoursRows = [
    ["Resource Name", "Role", "Rate ($/hr)", ...weekCols, "Total Hours", "Total Cost ($)"],
    ...Array.from({ length: 10 }, (_, ri) => {
      const dataRow = ri + 2;
      const lastWkCol = XLSX.utils.encode_col(2 + weekCols.length);
      return [
        "", "", "",
        ...weekCols.map(() => ""),
        { f: `SUM(D${dataRow}:${lastWkCol}${dataRow})` },
        { f: `IF(C${dataRow}<>"",C${dataRow}*${XLSX.utils.encode_col(3 + weekCols.length)}${dataRow},"")` },
      ];
    }),
  ];
  const hours = XLSX.utils.aoa_to_sheet(hoursRows);
  setColWidths(hours, [24, 16, 14, ...weekCols.map(() => 7), 14, 16]);
  XLSX.utils.book_append_sheet(wb, hours, "Weekly Hours Log");

  // Monthly cost summary
  const months = project.startDate && project.endDate
    ? monthsBetween(new Date(project.startDate), new Date(project.endDate))
    : Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);
  const costRows: any[][] = [
    ["Month", "Hours Logged", "Cost Incurred ($)", "Cumulative Cost ($)", "Budget Remaining ($)", "Notes"],
    ...months.map((m, i) => {
      const row = i + 2;
      const cap = project.budget ?? 0;
      return [
        m, "", "",
        { f: `IF(C${row}="","",SUM($C$2:C${row}))` },
        cap ? { f: `IF(D${row}="","",${cap}-D${row})` } : "N/A (Open T&M)",
        "",
      ];
    }),
    [],
    ["TOTAL", { f: `SUM(B2:B${months.length + 1})` }, { f: `SUM(C2:C${months.length + 1})` }],
  ];
  const cost = XLSX.utils.aoa_to_sheet(costRows);
  setColWidths(cost, [16, 14, 20, 22, 22, 24]);
  XLSX.utils.book_append_sheet(wb, cost, "Monthly Cost Summary");
}

/** Managed Services — monthly fee vs actual cost */
function buildManagedServices(wb: XLSX.WorkBook, project: any) {
  const months = project.startDate && project.endDate
    ? monthsBetween(new Date(project.startDate), new Date(project.endDate))
    : Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);

  const summary = XLSX.utils.aoa_to_sheet([
    ["Cost Burndown Tracker — Managed Services"],
    [],
    ["Project", project.name],
    ["Customer", project.customer ?? "—"],
    ["Annual Contract Value", project.budget ?? "—"],
    ["Monthly Service Fee", project.budget ? (project.budget / 12).toFixed(2) : "—"],
    ["Currency", project.currency ?? "USD"],
    ["Start Date", project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"],
    ["End Date", project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"],
    [],
    ["Instructions", "Enter actual monthly delivery cost in 'Actual Cost ($)' column."],
    ["", "Margin and SLA columns help track profitability and service health."],
  ]);
  setColWidths(summary, [24, 32]);
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const monthlyFee = project.budget ? project.budget / 12 : 0;
  const rows: any[][] = [
    ["Month", "Service Fee Invoiced ($)", "Actual Delivery Cost ($)", "Gross Margin ($)", "Margin %", "Cumulative Revenue ($)", "Cumulative Cost ($)", "SLA Met (Y/N)", "Incidents", "Notes"],
    ...months.map((m, i) => {
      const row = i + 2;
      return [
        m,
        monthlyFee.toFixed(2),
        "",                                                          // C: actual cost (user fills)
        { f: `IF(C${row}="","",B${row}-C${row})` },                // D: margin $
        { f: `IF(C${row}="","",D${row}/B${row})` },                // E: margin %
        { f: `SUM($B$2:B${row})` },                                 // F: cumulative revenue
        { f: `IF(C${row}="","",SUM($C$2:C${row}))` },              // G: cumulative cost
        "", "", "",
      ];
    }),
    [],
    ["TOTAL",
      { f: `SUM(B2:B${months.length + 1})` },
      { f: `SUM(C2:C${months.length + 1})` },
      { f: `SUM(D2:D${months.length + 1})` },
      { f: `IF(B${months.length + 2}<>0,D${months.length + 2}/B${months.length + 2},"")` },
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [14, 22, 22, 18, 12, 22, 20, 14, 12, 24]);
  XLSX.utils.book_append_sheet(wb, ws, "Monthly Tracker");

  // SLA tracker
  const slaRows: any[][] = [
    ["SLA Metric", "Target", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    ["Uptime %", "99.9%", ...Array(12).fill("")],
    ["Response Time (hrs)", "4", ...Array(12).fill("")],
    ["Resolution Time (hrs)", "24", ...Array(12).fill("")],
    ["Customer Satisfaction", "4.5/5", ...Array(12).fill("")],
    ["Incidents Resolved", "100%", ...Array(12).fill("")],
  ];
  const sla = XLSX.utils.aoa_to_sheet(slaRows);
  setColWidths(sla, [26, 14, ...Array(12).fill(8)]);
  XLSX.utils.book_append_sheet(wb, sla, "SLA Tracker");
}

/** Staff Augmentation — headcount cost tracker */
function buildStaffAug(wb: XLSX.WorkBook, project: any) {
  const months = project.startDate && project.endDate
    ? monthsBetween(new Date(project.startDate), new Date(project.endDate))
    : Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);

  const summary = XLSX.utils.aoa_to_sheet([
    ["Cost Burndown Tracker — Staff Augmentation"],
    [],
    ["Project", project.name],
    ["Customer", project.customer ?? "—"],
    ["Budget Cap", project.budget ?? "Open"],
    ["Currency", project.currency ?? "USD"],
    ["Team Size", project.teamSize ?? "—"],
    ["Start Date", project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"],
    ["End Date", project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"],
    [],
    ["Instructions", "1. Fill in the 'Resource Roster' sheet with each resource and their monthly rate."],
    ["", "2. Log monthly actuals per resource in the 'Monthly Cost Log'."],
    ["", "3. The Burndown sheet tracks total cost vs budget."],
  ]);
  setColWidths(summary, [22, 35]);
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  // Resource roster
  const rosterRows: any[][] = [
    ["Resource ID", "Name", "Role / Skill", "Vendor / Agency", "Monthly Rate ($)", "Start Date", "End Date", "Duration (months)", "Total Cost ($)", "Status"],
    ...Array.from({ length: 15 }, (_, i) => {
      const row = i + 2;
      return [
        `R${String(i + 1).padStart(3, "0")}`, "", "", "",
        "",                                                       // E: monthly rate
        "", "",                                                   // F, G: dates
        { f: `IF(AND(F${row}<>"",G${row}<>""),DATEDIF(F${row},G${row},"M"),"")` },  // H: duration
        { f: `IF(AND(E${row}<>"",H${row}<>""),E${row}*H${row},"")` },               // I: total cost
        "Active",
      ];
    }),
    [],
    ["TOTAL", "", "", "", "", "", "", "", { f: `SUM(I2:I16)` }, ""],
  ];
  const roster = XLSX.utils.aoa_to_sheet(rosterRows);
  setColWidths(roster, [12, 22, 22, 20, 16, 13, 13, 16, 14, 10]);
  XLSX.utils.book_append_sheet(wb, roster, "Resource Roster");

  // Monthly cost log
  const logHeaders = ["Resource", "Role", "Monthly Rate ($)", ...months, "Total ($)"];
  const logRows: any[][] = [logHeaders];
  for (let ri = 0; ri < 15; ri++) {
    const row = ri + 2;
    const lastMonthCol = XLSX.utils.encode_col(2 + months.length);
    logRows.push(["", "", "", ...months.map(() => ""), { f: `SUM(D${row}:${lastMonthCol}${row})` }]);
  }
  const lastDataRow = 16;
  const totalRow: any[] = ["TOTAL", "", { f: `SUM(C2:C${lastDataRow})` }];
  for (let mi = 0; mi < months.length; mi++) {
    const col = XLSX.utils.encode_col(3 + mi);
    totalRow.push({ f: `SUM(${col}2:${col}${lastDataRow})` });
  }
  totalRow.push({ f: `SUM(D${lastDataRow + 2}:${XLSX.utils.encode_col(2 + months.length)}${lastDataRow + 2})` });
  logRows.push([]);
  logRows.push(totalRow);
  const log = XLSX.utils.aoa_to_sheet(logRows);
  setColWidths(log, [22, 18, 16, ...months.map(() => 12), 14]);
  XLSX.utils.book_append_sheet(wb, log, "Monthly Cost Log");

  // Burndown
  const burnRows: any[][] = [
    ["Month", "Planned Headcount Cost ($)", "Actual Cost ($)", "Cumulative Actual ($)", "Budget Remaining ($)", "Variance ($)"],
    ...months.map((m, i) => {
      const row = i + 2;
      const cap = project.budget ?? 0;
      const planned = cap ? (cap / months.length).toFixed(2) : "";
      return [
        m, planned, "",
        { f: `IF(C${row}="","",SUM($C$2:C${row}))` },
        cap ? { f: `IF(D${row}="","",${cap}-D${row})` } : "N/A",
        planned ? { f: `IF(C${row}="","",B${row}-C${row})` } : "",
      ];
    }),
  ];
  const burn = XLSX.utils.aoa_to_sheet(burnRows);
  setColWidths(burn, [14, 26, 20, 22, 22, 18]);
  XLSX.utils.book_append_sheet(wb, burn, "Burndown");
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { milestones: { orderBy: { dueDate: "asc" } } },
  });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wb = XLSX.utils.book_new();

  switch (project.projectType) {
    case "time_and_material": buildTM(wb, project); break;
    case "managed_services":  buildManagedServices(wb, project); break;
    case "staff_aug":         buildStaffAug(wb, project); break;
    default:                  buildFixedPrice(wb, project); break;  // fixed_price + fallback
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = project.name.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  const filename = `${safeName}_Cost_Burndown.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
