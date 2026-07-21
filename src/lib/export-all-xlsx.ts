/**
 * ExcelJS replacements for all remaining SheetJS-based artifact exports.
 *
 * Global formatting standard (per user spec):
 *   - All body cells: Horizontal = General, Vertical = Top, wrapText = true
 *   - Header row: Navy fill, white bold, freeze row 1, auto-filter
 *   - Alternating row shading: white / offWhite
 *   - UST brand palette throughout
 *
 * Exports:
 *   buildRaidRegisterXlsx      — 4 sheets: Risks, Assumptions, Issues, Dependencies
 *   buildScheduleXlsx          — 3 sheets: Project Schedule, Milestone Tracker, Baseline
 *   buildBudgetXlsx            — 4 sheets: Cost Estimates, Budget Baseline, Funding, EVM Tracker
 *   buildRaciMatrixXlsx        — 4 sheets: RACI Matrix, Team Directory, Comm Plan, Legend
 *   buildChangeLogXlsx         — 3 sheets: Change Log, CR Form Template, Impact Analysis
 *   buildLessonsLearnedXlsx    — 2 sheets: Lessons Learned, Summary Dashboard
 *   buildStakeholderRegisterXlsx — 2 sheets: Stakeholder Register, Influence-Interest Matrix
 *   buildResourcePlanXlsx      — 1 sheet: Resource Plan
 *   buildGenericLogXlsx        — 1 sheet: generic key-value table
 */
import ExcelJS from "exceljs";

// ── Palette ──────────────────────────────────────────────────────────────────
const UST = {
  navy:      "FF006E74",
  teal:      "FF0097AC",
  tealLight: "FFB2DDE3",
  white:     "FFFFFFFF",
  offWhite:  "FFF2F7F8",
  softBlack: "FF231F20",
  green:     "FF01B27C",
  greenBg:   "FFD6F5EB",
  amber:     "FFFFC000",
  amberBg:   "FFFFF0CC",
  red:       "FFFC6A59",
  redBg:     "FFFFE8E5",
  grey:      "FFC2BCBE",
  greyBg:    "FFF5F5F5",
  muted:     "FF7A7480",
  navyFg:    "FFFFFFFF",
  darkFg:    "FF231F20",
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Header row: navy bg, white bold, center-aligned, frozen */
function applyHeader(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(UST.navy);
    cell.font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    cell.alignment = { vertical: "top", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCD6D7" } } };
  });
  row.height = 22;
}

/** Body cell: General horizontal, Top vertical, wrapped */
function applyBody(row: ExcelJS.Row, bg: string) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(bg);
    cell.font = { color: { argb: UST.softBlack }, size: 10 };
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
  });
}

/** Title block: single merged navy header */
function addTitle(ws: ExcelJS.Worksheet, title: string, colCount: number) {
  const r = ws.addRow([title]);
  ws.mergeCells(`A${r.number}:${colLetter(colCount)}${r.number}`);
  r.getCell(1).fill = fill(UST.navy);
  r.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 12 };
  r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  r.height = 26;
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function freeze(ws: ExcelJS.Worksheet, row = 1) {
  ws.views = [{ state: "frozen", ySplit: row, topLeftCell: `A${row + 1}` }];
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function bg(alt: number): string {
  return alt % 2 === 0 ? UST.white : UST.offWhite;
}

/** Build a simple table sheet: header row + data rows with standard body style */
function tableSheet(
  ws: ExcelJS.Worksheet,
  headers: string[],
  rows: unknown[][],
  colWidths: number[]
) {
  ws.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] ?? 20 }));
  applyHeader(ws.getRow(1));
  freeze(ws);

  rows.forEach((rowData, idx) => {
    const row = ws.addRow(rowData as ExcelJS.CellValue[]);
    applyBody(row, bg(idx));
  });

  if (headers.length > 0) {
    ws.autoFilter = { from: "A1", to: `${colLetter(headers.length)}1` };
  }
}

// ── Severity/status color helpers ─────────────────────────────────────────────
function sevColors(sev: string): { bg: string; fg: string } {
  switch (sev.toLowerCase()) {
    case "critical": return { bg: UST.red,      fg: UST.navyFg };
    case "high":     return { bg: UST.amber,    fg: UST.darkFg };
    case "medium":   return { bg: UST.tealLight,fg: UST.darkFg };
    default:         return { bg: UST.greenBg,  fg: UST.darkFg };
  }
}

function colorCell(cell: ExcelJS.Cell, bg: string, fg: string) {
  cell.fill = fill(bg);
  cell.font = { bold: true, color: { argb: fg }, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "top", wrapText: false };
}

function newWb(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PM Agent · UST";
  wb.created = new Date();
  return wb;
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAID REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildRaidRegisterXlsx(content: any): Promise<Buffer> {
  const wb = newWb();

  // Sheet 1: Risks
  {
    const ws = wb.addWorksheet("Risks");
    tableSheet(ws,
      ["ID", "Category", "Statement (If→Then→Causing)", "Type", "Probability", "Impact", "Score", "Severity", "Strategy", "Response Actions", "Owner", "Status"],
      (content.risks ?? []).map((r: any) => [
        safeStr(r.id), safeStr(r.category), safeStr(r.statement ?? r.description),
        safeStr(r.type ?? "Threat"), safeStr(r.probability), safeStr(r.impact),
        safeStr(r.riskScore ?? ""), safeStr(r.severity ?? ""),
        safeStr(r.strategy), safeStr(r.responseActions),
        safeStr(r.owner), safeStr(r.status),
      ]),
      [8, 16, 55, 10, 12, 12, 10, 12, 18, 50, 20, 12]
    );
  }

  // Sheet 2: Assumptions
  {
    const ws = wb.addWorksheet("Assumptions");
    tableSheet(ws,
      ["ID", "Description", "Category", "Owner", "Validation Date", "Status", "Impact If Wrong"],
      (content.assumptions ?? []).map((a: any) => [
        safeStr(a.id), safeStr(a.description), safeStr(a.category), safeStr(a.owner),
        safeStr(a.validationDate ?? ""), safeStr(a.status), safeStr(a.impactIfWrong ?? ""),
      ]),
      [8, 44, 16, 20, 16, 12, 36]
    );
  }

  // Sheet 3: Issues
  {
    const ws = wb.addWorksheet("Issues");
    tableSheet(ws,
      ["ID", "Category", "Description", "Root Cause", "Severity", "Owner", "Resolution Plan", "Target Date", "Status"],
      (content.issues ?? []).map((i: any) => [
        safeStr(i.id), safeStr(i.category ?? ""), safeStr(i.description), safeStr(i.rootCause ?? ""),
        safeStr(i.severity), safeStr(i.owner), safeStr(i.resolutionPlan ?? i.resolution),
        safeStr(i.targetResolutionDate ?? ""), safeStr(i.status),
      ]),
      [8, 16, 40, 30, 12, 20, 36, 14, 14]
    );
  }

  // Sheet 4: Dependencies
  {
    const ws = wb.addWorksheet("Dependencies");
    tableSheet(ws,
      ["ID", "Type", "Description", "Depends On", "Owner", "Expected Date", "Impact If Delayed", "Status"],
      (content.dependencies ?? []).map((d: any) => [
        safeStr(d.id), safeStr(d.type ?? ""), safeStr(d.description), safeStr(d.dependsOn),
        safeStr(d.owner), safeStr(d.expectedDate ?? ""), safeStr(d.impactIfDelayed ?? ""), safeStr(d.status),
      ]),
      [8, 14, 40, 24, 20, 14, 36, 14]
    );
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE / MILESTONE PLAN
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildScheduleXlsx(content: any): Promise<Buffer> {
  const wb = newWb();
  const milestones = content.milestones ?? [];

  // Sheet 1: Project Schedule
  {
    const ws = wb.addWorksheet("Project Schedule");
    tableSheet(ws,
      ["ID", "WBS", "Activity Name", "Phase", "Owner", "Duration (days)", "Start Date", "End Date", "Predecessors", "% Complete", "Status", "Notes"],
      milestones.map((m: any, idx: number) => [
        safeStr(m.id ?? `M${String(idx + 1).padStart(3, "0")}`),
        safeStr(m.id ?? ""),
        safeStr(m.name),
        safeStr(m.phase ?? ""),
        safeStr(m.owner ?? ""),
        safeStr(m.estimatedDays ?? 0),
        safeStr(m.plannedDate ?? m.startDate ?? m.date ?? ""),
        safeStr(m.forecastDate ?? m.dueDate ?? m.date ?? ""),
        Array.isArray(m.predecessors) ? m.predecessors.join(", ") : safeStr(m.predecessors ?? ""),
        safeStr(m.percentComplete ?? 0),
        safeStr(m.status ?? "Not Started"),
        safeStr(m.notes ?? ""),
      ]),
      [8, 12, 36, 18, 20, 14, 14, 14, 16, 12, 16, 30]
    );
  }

  // Sheet 2: Milestone Tracker
  {
    const ws = wb.addWorksheet("Milestone Tracker");
    tableSheet(ws,
      ["#", "Milestone Name", "Planned Date", "Actual / Forecast Date", "Variance (days)", "Status", "Owner", "Notes"],
      milestones.map((m: any, i: number) => [
        i + 1,
        safeStr(m.name),
        safeStr(m.plannedDate ?? m.date ?? ""),
        safeStr(m.forecastDate ?? m.actualDate ?? m.date ?? ""),
        safeStr(m.variance ?? "0"),
        safeStr(m.status ?? "Not Started"),
        safeStr(m.owner ?? ""),
        safeStr(m.notes ?? ""),
      ]),
      [6, 36, 16, 18, 14, 16, 20, 30]
    );

    // Colour Status column (col 6) per milestone
    milestones.forEach((m: any, i: number) => {
      const row = ws.getRow(i + 2);
      const status = safeStr(m.status ?? "Not Started").toLowerCase();
      const cell = row.getCell(6);
      if (status.includes("complete") || status.includes("done")) colorCell(cell, UST.greenBg, UST.darkFg);
      else if (status.includes("risk") || status.includes("delay")) colorCell(cell, UST.redBg, UST.darkFg);
      else if (status.includes("progress")) colorCell(cell, UST.tealLight, UST.darkFg);
    });
  }

  // Sheet 3: Schedule Baseline
  {
    const ws = wb.addWorksheet("Schedule Baseline");
    ws.columns = [{ width: 36 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 18 }];
    addTitle(ws, "SCHEDULE BASELINE — LOCKED", 5);
    ws.addRow([]);
    const hRow = ws.addRow(["Milestone", "Baseline Start", "Baseline Finish", "Owner", "Phase"]);
    applyHeader(hRow);
    freeze(ws, 3);
    milestones.forEach((m: any, i: number) => {
      const row = ws.addRow([
        safeStr(m.name),
        safeStr(m.plannedDate ?? m.date ?? ""),
        safeStr(m.forecastDate ?? m.dueDate ?? m.date ?? ""),
        safeStr(m.owner ?? ""),
        safeStr(m.phase ?? ""),
      ]);
      applyBody(row, bg(i));
    });
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGET / COST PLAN
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildBudgetXlsx(content: any): Promise<Buffer> {
  const wb = newWb();
  const currency = safeStr(content.currency ?? "USD");
  const summary = content.costSummary ?? {};

  // Sheet 1: Cost Estimates
  {
    const ws = wb.addWorksheet("Cost Estimates");
    const laborRows = (content.laborEstimates ?? []).map((l: any) => [
      "", safeStr(l.resource ?? l.role), safeStr(l.phase), safeStr(l.role),
      safeStr(l.estimatedDays ? l.estimatedDays * 8 : ""),
      safeStr(l.dailyRate ? l.dailyRate / 8 : ""),
      safeStr(l.totalCost ?? ""),
      "15%", "",
      safeStr(l.totalCost ?? ""), "10%", "", "",
      safeStr(l.estimatingMethod ?? "Bottom-Up"), "High",
      safeStr(l.basisOfEstimate ?? ""),
    ]);
    const nlRows = (content.nonLaborCosts ?? []).map((c: any) => [
      "", safeStr(c.description), safeStr(c.phase), safeStr(c.category),
      "1", safeStr(c.amount), safeStr(c.amount),
      "0%", "0", safeStr(c.amount), "5%", "", "",
      "Vendor Quote", "High", "",
    ]);
    tableSheet(ws,
      ["WBS Code", "Work Package / Activity", "Phase", "Resource Type", "Qty / Hours",
        `Unit Rate (${currency})`, `Direct Cost (${currency})`, "Overhead %", `Overhead (${currency})`,
        `Total Cost (${currency})`, "Contingency %", `Contingency (${currency})`,
        `Estimate Total (${currency})`, "Method", "Confidence", "Notes"],
      [...laborRows, ...nlRows],
      [10, 30, 16, 20, 12, 14, 14, 12, 14, 14, 12, 14, 16, 16, 12, 30]
    );
  }

  // Sheet 2: Budget Baseline
  {
    const ws = wb.addWorksheet("Budget Baseline");
    const phases = content.phaseBreakdown ?? [];
    const bac = summary.costBaseline ?? summary.totalBudget ?? 0;
    const rows = [
      ...phases.map((p: any) => [
        safeStr(p.phase),
        safeStr(p.plannedValue ?? ""),
        safeStr(p.cumulativePV ?? ""),
        p.plannedValue && bac ? ((+p.plannedValue / +bac) * 100).toFixed(1) + "%" : "",
      ]),
      [""],
      [`Cost Baseline (BAC)`, safeStr(summary.costBaseline ?? summary.totalBudget ?? ""), "", ""],
      [`Management Reserve`,  safeStr(summary.managementReserve ?? ""), "", ""],
      [`Budget at Completion`, safeStr(summary.totalBudget ?? ""), "", ""],
    ];
    tableSheet(ws,
      ["Phase", `Planned Value (${currency})`, `Cumulative PV (${currency})`, "% of Budget"],
      rows,
      [24, 20, 22, 16]
    );
  }

  // Sheet 3: Funding Requirements
  {
    const ws = wb.addWorksheet("Funding Requirements");
    tableSheet(ws,
      ["Period", `Planned Expenditure (${currency})`, `Cumulative Expenditure (${currency})`,
        `Funding Required (${currency})`, `Cumulative Funding (${currency})`, "Approval Status"],
      (content.fundingRequirements ?? []).map((f: any) => [
        safeStr(f.period), safeStr(f.amount), safeStr(f.cumulativeAmount),
        safeStr(f.amount), safeStr(f.cumulativeAmount), safeStr(f.approvalStatus ?? "Pending"),
      ]),
      [14, 22, 24, 22, 22, 18]
    );
  }

  // Sheet 4: EVM Tracker
  {
    const ws = wb.addWorksheet("EVM Tracker");
    const phases = content.phaseBreakdown ?? [];
    const bac = summary.totalBudget ?? summary.costBaseline ?? 0;
    tableSheet(ws,
      ["Period", `PV (${currency})`, `EV (${currency})`, `AC (${currency})`,
        `SV (${currency})`, `CV (${currency})`, "SPI", "CPI",
        `EAC (${currency})`, `ETC (${currency})`, `VAC (${currency})`, "TCPI", "Notes"],
      (content.evmSetup?.plannedValueByPeriod ?? phases).slice(0, 12).map((p: any) => [
        safeStr(p.period ?? p.phase),
        safeStr(p.pv ?? p.plannedValue ?? ""),
        "", "", "", "", "", "", "", "", safeStr(bac), "", "",
      ]),
      [12, 14, 14, 14, 14, 14, 10, 10, 14, 14, 14, 10, 24]
    );
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RACI MATRIX
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildRaciMatrixXlsx(content: any): Promise<Buffer> {
  const wb = newWb();
  const activities = content.activities ?? [];
  const roles: string[] = content.roles?.length
    ? content.roles
    : Array.from(new Set<string>(activities.flatMap((a: any) => Object.keys(a.roles ?? {}))));

  const raciColors: Record<string, { bg: string; fg: string }> = {
    A: { bg: UST.navy,      fg: UST.navyFg },
    R: { bg: UST.teal,      fg: UST.navyFg },
    C: { bg: UST.tealLight, fg: UST.darkFg },
    I: { bg: UST.offWhite,  fg: UST.darkFg },
  };

  // Sheet 1: RACI Matrix
  {
    const ws = wb.addWorksheet("RACI Matrix");
    if (!activities.length) {
      ws.addRow(["No activity data available"]);
    } else {
      ws.columns = [
        { header: "Phase",                   width: 16 },
        { header: "Deliverable / Activity",  width: 36 },
        ...roles.map((r) => ({ header: r, width: 12 })),
      ];
      applyHeader(ws.getRow(1));
      freeze(ws);

      activities.forEach((a: any, i: number) => {
        const row = ws.addRow([
          safeStr(a.phase ?? ""),
          safeStr(a.activity),
          ...roles.map((r) => safeStr(a.roles?.[r] ?? "—")),
        ]);
        applyBody(row, bg(i));

        // Color each RACI cell
        roles.forEach((r, ri) => {
          const val = safeStr(a.roles?.[r] ?? "").toUpperCase();
          const cell = row.getCell(ri + 3);
          const c = raciColors[val];
          if (c) {
            cell.fill = fill(c.bg);
            cell.font = { bold: true, color: { argb: c.fg }, size: 10 };
            cell.alignment = { horizontal: "center", vertical: "top", wrapText: false };
          }
        });
      });

      // Totals
      ws.addRow([]);
      const totR = ws.addRow(["TOTALS", "Responsible (R)", ...roles.map((r) => activities.filter((a: any) => safeStr(a.roles?.[r]) === "R").length)]);
      applyBody(totR, UST.offWhite);
      totR.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
      const totA = ws.addRow(["", "Accountable (A)", ...roles.map((r) => activities.filter((a: any) => safeStr(a.roles?.[r]) === "A").length)]);
      applyBody(totA, UST.white);

      ws.autoFilter = { from: "A1", to: `${colLetter(roles.length + 2)}1` };
    }
  }

  // Sheet 2: Team Directory
  {
    const ws = wb.addWorksheet("Team Directory");
    const team = content.teamDirectory ?? [];
    tableSheet(ws,
      ["ID", "Name", "Role", "Organization", "Email", "Phone", "Location", "Availability (%)", "Start Date", "End Date", "Reporting To", "Notes"],
      team.map((m: any) => [
        safeStr(m.id), safeStr(m.name), safeStr(m.role), safeStr(m.department ?? m.organization),
        safeStr(m.contact ?? m.email ?? ""), safeStr(m.phone ?? ""), safeStr(m.location ?? ""),
        safeStr(m.allocationPercent ?? ""), safeStr(m.startDate ?? ""), safeStr(m.endDate ?? ""),
        safeStr(m.reportingTo ?? ""), safeStr(m.notes ?? ""),
      ]),
      [8, 22, 22, 20, 26, 16, 16, 14, 14, 14, 20, 24]
    );
  }

  // Sheet 3: Communication Plan
  {
    const ws = wb.addWorksheet("Communication Plan");
    const commItems = content.communicationItems ?? content.communication ?? [];
    const standardComms = [
      ["Weekly Status Report", "Inform stakeholders of progress", "Project Team, Sponsor", "Email / PPTX", "Weekly", "PM", "Email", ""],
      ["Steering Committee Update", "Executive governance", "Steering Committee, Sponsor", "PPTX", "Monthly", "PM", "Meeting", ""],
      ["Risk Review Meeting", "Review and update risk register", "PM, Tech Lead, Risk Owners", "XLSX", "Bi-weekly", "PM", "Meeting", ""],
      ["Change Control Board", "Approve/reject change requests", "CCB Members", "XLSX / Email", "As Needed", "PM", "Meeting", ""],
      ["Project Close Report", "Formal closure and lessons learned", "All Stakeholders", "PPTX", "End of Project", "PM", "Meeting", ""],
    ];
    tableSheet(ws,
      ["Communication Item", "Purpose", "Audience", "Format", "Frequency", "Responsible", "Delivery Method", "Notes"],
      commItems.length
        ? commItems.map((c: any) => [
            safeStr(c.name ?? c.communication), safeStr(c.purpose), safeStr(c.audience),
            safeStr(c.format ?? ""), safeStr(c.frequency ?? ""),
            safeStr(c.owner ?? c.responsible ?? ""), safeStr(c.channel ?? c.deliveryMethod ?? ""),
            safeStr(c.notes ?? ""),
          ])
        : standardComms,
      [30, 36, 30, 14, 14, 20, 18, 24]
    );
  }

  // Sheet 4: RACI Legend
  {
    const ws = wb.addWorksheet("RACI Legend");
    ws.columns = [{ width: 6 }, { width: 18 }, { width: 60 }];
    const hRow = ws.addRow(["Code", "Meaning", "Description"]);
    applyHeader(hRow);
    freeze(ws);
    const legendData = [
      ["R", "Responsible",  "Does the work. Can have multiple R per row."],
      ["A", "Accountable",  "Owns the outcome. Exactly ONE per row — no exceptions."],
      ["C", "Consulted",    "Provides input before decisions. Two-way communication."],
      ["I", "Informed",     "Notified of outcomes. One-way communication."],
      ["—", "Not involved", "No role in this activity."],
    ];
    legendData.forEach(([code, meaning, desc], i) => {
      const row = ws.addRow([code, meaning, desc]);
      applyBody(row, bg(i));
      const c = raciColors[code];
      if (c) {
        row.getCell(1).fill = fill(c.bg);
        row.getCell(1).font = { bold: true, color: { argb: c.fg }, size: 10 };
        row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
      }
    });
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE LOG
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildChangeLogXlsx(content: any): Promise<Buffer> {
  const wb = newWb();
  const changes = content.changes ?? content.changeRequests ?? [];

  const ccbColors: Record<string, { bg: string; fg: string }> = {
    approved:  { bg: UST.greenBg,  fg: UST.darkFg },
    rejected:  { bg: UST.redBg,    fg: UST.darkFg },
    deferred:  { bg: UST.amberBg,  fg: UST.darkFg },
    pending:   { bg: UST.greyBg,   fg: UST.darkFg },
  };
  const priColors: Record<string, { bg: string; fg: string }> = {
    critical: { bg: UST.red,      fg: UST.navyFg },
    high:     { bg: UST.amber,    fg: UST.darkFg },
    medium:   { bg: UST.tealLight,fg: UST.darkFg },
    low:      { bg: UST.greenBg,  fg: UST.darkFg },
  };

  // Sheet 1: Change Log
  {
    const ws = wb.addWorksheet("Change Log");
    const cols = [
      "CR #", "Date Raised", "Raised By", "Change Title", "Category", "Priority", "Description",
      "Justification", "Impact — Scope", "Impact — Schedule (days)", "Impact — Cost",
      "Impact — Quality", "Impact — Risk", "Analysis Date", "Analyzed By",
      "Recommended Action", "CCB Decision", "Decision Date", "Decision By",
      "Implementation Status", "Implemented Date", "Baseline Updated", "Notes",
    ];
    ws.columns = cols.map((h, i) => ({
      header: h,
      width: [8,14,20,30,14,12,40,36,28,18,16,28,28,14,20,18,14,14,20,18,16,16,30][i] ?? 16,
    }));
    applyHeader(ws.getRow(1));
    freeze(ws);

    changes.forEach((c: any, i: number) => {
      const decision = safeStr(c.ccbDecision ?? c.status ?? "Pending");
      const priority = safeStr(c.priority ?? "Medium");
      const row = ws.addRow([
        safeStr(c.id ?? `CR-${String(i + 1).padStart(3, "0")}`),
        safeStr(c.dateRaised ?? c.date ?? ""), safeStr(c.raisedBy ?? c.requestedBy ?? ""),
        safeStr(c.title ?? c.description ?? ""), safeStr(c.category ?? "Scope"),
        priority, safeStr(c.description ?? ""), safeStr(c.justification ?? ""),
        safeStr(c.scopeImpact ?? ""), safeStr(c.scheduleImpact ?? "0"),
        safeStr(c.costImpact ?? "0"), safeStr(c.qualityImpact ?? ""), safeStr(c.riskImpact ?? ""),
        safeStr(c.analysisDate ?? ""), safeStr(c.analyzedBy ?? ""),
        safeStr(c.recommendedAction ?? "Pending"), decision,
        safeStr(c.decisionDate ?? ""), safeStr(c.decisionBy ?? ""),
        safeStr(c.implementationStatus ?? "Not Started"), safeStr(c.implementedDate ?? ""),
        safeStr(c.baselineUpdated ?? "No"), safeStr(c.notes ?? ""),
      ]);
      applyBody(row, bg(i));

      // Color Priority (col 6) and CCB Decision (col 17)
      const pc = priColors[priority.toLowerCase()];
      if (pc) colorCell(row.getCell(6), pc.bg, pc.fg);
      const dc = ccbColors[decision.toLowerCase()];
      if (dc) colorCell(row.getCell(17), dc.bg, dc.fg);
    });

    ws.autoFilter = { from: "A1", to: `W1` };
  }

  // Sheet 2: CR Form Template
  {
    const ws = wb.addWorksheet("CR Form Template");
    ws.columns = [{ width: 28 }, { width: 60 }];
    addTitle(ws, "PROJECT CHANGE REQUEST", 2);

    const formRows = [
      ["CR #:", "[Auto-generated]"], ["Date:", ""], ["Project Name:", ""], ["Project Phase:", ""], [""],
      ["SECTION 1: CHANGE DESCRIPTION"],
      ["Change Title:", ""], ["Category:", "Scope / Schedule / Cost / Quality / Resource / Technical / Regulatory"],
      ["Priority:", "Critical / High / Medium / Low"],
      ["Description of Change:", ""], ["Justification / Business Case:", ""], [""],
      ["SECTION 2: IMPACT ANALYSIS"],
      ["Schedule Impact:", "Increase / Decrease / No change — _____ days"],
      ["Cost Impact:", "Increase / Decrease / No change — $ _______"],
      ["Scope Impact:", ""], ["Quality Impact:", ""], ["Risk Impact:", ""], [""],
      ["SECTION 3: RECOMMENDATION"],
      ["PM Recommendation:", "Approve / Reject / Defer"], ["Analysis Notes:", ""], [""],
      ["SECTION 4: CCB DECISION"],
      ["Decision:", "Approved / Rejected / Deferred"], ["Decision Date:", ""], ["Approved By:", ""],
      ["Conditions / Notes:", ""], [""],
      ["SECTION 5: IMPLEMENTATION"],
      ["Action Plan:", ""], ["Owner:", ""], ["Target Date:", ""], ["Status:", ""],
      ["Completion Date:", ""], ["Baseline Updated:", "Yes / No"],
    ];
    formRows.forEach((r) => {
      const row = ws.addRow(r as ExcelJS.CellValue[]);
      if (r.length === 1 && r[0] && String(r[0]).startsWith("SECTION")) {
        row.getCell(1).fill = fill(UST.teal);
        row.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
        row.getCell(2).fill = fill(UST.teal);
        ws.mergeCells(`A${row.number}:B${row.number}`);
        row.height = 20;
      } else {
        row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
        row.getCell(1).fill = fill(UST.offWhite);
        row.getCell(2).fill = fill(UST.white);
        row.getCell(2).alignment = { vertical: "top", wrapText: true };
        row.height = 20;
      }
    });
  }

  // Sheet 3: Impact Analysis Template
  {
    const ws = wb.addWorksheet("Impact Analysis");
    ws.columns = [{ width: 28 }, { width: 60 }];
    addTitle(ws, "CHANGE IMPACT ANALYSIS TEMPLATE", 2);

    const sections = [
      ["SCOPE IMPACT", ["WBS elements affected:", "Deliverables changed:", "Scope boundary changes:"]],
      ["SCHEDULE IMPACT", ["Activities delayed/added:", "Critical path impact:", "New project end date:"]],
      ["COST IMPACT", ["Additional labor hours:", "Additional material costs:", "Cost breakdown by WBS:"]],
      ["RISK IMPACT", ["New risks introduced:", "Existing risks affected:"]],
      ["RECOMMENDATION", ["PM Recommendation:", "Rationale:", "Alternatives considered:"]],
      ["IMPLEMENTATION PLAN", ["Steps:", "Owner:", "Timeline:"]],
    ] as [string, string[]][];

    ws.addRow(["CR #:", ""]);
    ws.addRow(["Change Title:", ""]);
    ws.addRow(["Requested By:", ""]);

    for (const [sectionTitle, fields] of sections) {
      ws.addRow([]);
      const secRow = ws.addRow([sectionTitle, ""]);
      ws.mergeCells(`A${secRow.number}:B${secRow.number}`);
      secRow.getCell(1).fill = fill(UST.teal);
      secRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
      secRow.height = 20;

      fields.forEach((f) => {
        const row = ws.addRow([f, ""]);
        row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
        row.getCell(1).fill = fill(UST.offWhite);
        row.getCell(2).fill = fill(UST.white);
        row.getCell(2).alignment = { vertical: "top", wrapText: true };
        row.height = 24;
      });
    }
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LESSONS LEARNED
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildLessonsLearnedXlsx(content: any): Promise<Buffer> {
  const wb = newWb();
  const lessons = content.lessonsLearned ?? [];

  const typeColors: Record<string, { bg: string; fg: string }> = {
    success:     { bg: UST.greenBg, fg: UST.darkFg },
    improvement: { bg: UST.tealLight, fg: UST.darkFg },
  };
  const impactColors: Record<string, { bg: string; fg: string }> = {
    high:   { bg: UST.red,      fg: UST.navyFg },
    medium: { bg: UST.amber,    fg: UST.darkFg },
    low:    { bg: UST.greenBg,  fg: UST.darkFg },
  };

  // Sheet 1: Lessons Learned Register
  {
    const ws = wb.addWorksheet("Lessons Learned");
    const headers = [
      "LL #", "Date Captured", "Captured By", "Project Phase", "Knowledge Area",
      "Category", "Type", "Lesson Title", "Situation", "Action Taken",
      "Result", "Lesson", "Recommendation", "Applicability", "Impact Level",
      "Status", "OPA Update",
    ];
    ws.columns = headers.map((h, i) => ({
      header: h,
      width: [8,14,20,16,22,14,14,30,36,36,30,40,36,24,14,14,12][i] ?? 16,
    }));
    applyHeader(ws.getRow(1));
    freeze(ws);

    lessons.forEach((l: any, i: number) => {
      const typeVal = safeStr(l.type ?? "Improvement");
      const impactVal = safeStr(l.impact ?? l.impactLevel ?? "Medium");
      const row = ws.addRow([
        safeStr(l.id ?? `LL-${String(i + 1).padStart(3, "0")}`),
        safeStr(l.dateCaptured ?? ""), safeStr(l.capturedBy ?? ""),
        safeStr(l.phase ?? l.projectPhase ?? ""), safeStr(l.knowledgeArea ?? ""),
        safeStr(l.category ?? "Process"), typeVal,
        safeStr(l.title ?? l.lesson?.slice(0, 50) ?? ""),
        safeStr(l.situation ?? ""), safeStr(l.actionTaken ?? ""),
        safeStr(l.result ?? ""), safeStr(l.lesson ?? l.description ?? ""),
        safeStr(l.recommendation ?? ""), safeStr(l.applicability ?? "All Projects"),
        impactVal, safeStr(l.status ?? "Captured"), safeStr(l.opaUpdate ?? "No"),
      ]);
      applyBody(row, bg(i));

      const tc = typeColors[typeVal.toLowerCase().includes("success") ? "success" : "improvement"];
      if (tc) colorCell(row.getCell(7), tc.bg, tc.fg);
      const ic = impactColors[impactVal.toLowerCase()];
      if (ic) colorCell(row.getCell(15), ic.bg, ic.fg);
    });

    ws.autoFilter = { from: "A1", to: "Q1" };
  }

  // Sheet 2: Summary Dashboard
  {
    const ws = wb.addWorksheet("Summary Dashboard");
    ws.columns = [{ width: 30 }, { width: 50 }];
    addTitle(ws, "LESSONS LEARNED SUMMARY DASHBOARD", 2);
    ws.addRow([]);

    const successCount = lessons.filter((l: any) => safeStr(l.type).toLowerCase().includes("success")).length;
    const improveCount = lessons.length - successCount;
    const kaTally = new Map<string, number>();
    lessons.forEach((l: any) => {
      const ka = safeStr(l.knowledgeArea || "Other");
      kaTally.set(ka, (kaTally.get(ka) ?? 0) + 1);
    });

    const kv: [string, string | number, string][] = [
      ["Total Lessons Captured", lessons.length, UST.offWhite],
      ["Successes (do more)", successCount, UST.greenBg],
      ["Improvements (do differently)", improveCount, UST.tealLight],
    ];
    for (const [label, val, rowBg] of kv) {
      const row = ws.addRow([label, val]);
      row.getCell(1).fill = fill(rowBg); row.getCell(2).fill = fill(rowBg);
      row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
      row.height = 18;
    }

    ws.addRow([]);
    const kaH = ws.addRow(["Knowledge Area", "Count"]);
    applyHeader(kaH);
    let alt = 0;
    for (const [ka, cnt] of kaTally.entries()) {
      const row = ws.addRow([ka, cnt]);
      applyBody(row, bg(alt++));
    }

    ws.addRow([]);
    const hiH = ws.addRow(["High-Impact Lessons", ""]);
    applyHeader(hiH);
    ws.mergeCells(`A${hiH.number}:B${hiH.number}`);
    let hiAlt = 0;
    lessons.filter((l: any) => safeStr(l.impact ?? l.impactLevel).toLowerCase() === "high").slice(0, 5).forEach((l: any) => {
      const row = ws.addRow(["HIGH", safeStr(l.lesson ?? l.title)]);
      applyBody(row, bg(hiAlt++));
      colorCell(row.getCell(1), UST.red, UST.navyFg);
    });
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAKEHOLDER REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildStakeholderRegisterXlsx(content: any): Promise<Buffer> {
  const wb = newWb();

  // Sheet 1: Stakeholder Register
  {
    const ws = wb.addWorksheet("Stakeholder Register");
    tableSheet(ws,
      ["ID", "Name", "Title", "Organization", "Email", "Influence", "Interest", "Quadrant",
        "Current Engagement", "Desired Engagement", "Influence Strategy", "Communication Needs", "Notes"],
      (content.stakeholders ?? []).map((s: any) => [
        safeStr(s.id), safeStr(s.name), safeStr(s.title ?? s.role), safeStr(s.organization),
        safeStr(s.contact ?? s.email ?? ""), safeStr(s.power ?? s.influence), safeStr(s.interest),
        safeStr(s.quadrant ?? ""), safeStr(s.currentEngagement ?? s.engagementLevel ?? ""),
        safeStr(s.desiredEngagement ?? ""), safeStr(s.influenceStrategy ?? ""),
        safeStr(s.communicationNeeds ?? s.communicationPlan ?? ""), safeStr(s.notes ?? ""),
      ]),
      [8, 22, 22, 20, 26, 12, 12, 20, 18, 18, 36, 36, 24]
    );
  }

  // Sheet 2: Influence-Interest Matrix
  {
    const ws = wb.addWorksheet("Influence-Interest Matrix");
    ws.columns = [{ width: 22 }, { width: 28 }, { width: 28 }];

    const hRow = ws.addRow(["Influence \\ Interest", "HIGH Interest", "LOW Interest"]);
    applyHeader(hRow);
    freeze(ws);

    const quadrantFills: Record<string, string> = {
      "Manage Closely": UST.navy, "Keep Satisfied": UST.teal,
      "Keep Informed": UST.tealLight, "Monitor": UST.offWhite,
    };
    const quadrantFg: Record<string, string> = {
      "Manage Closely": UST.navyFg, "Keep Satisfied": UST.navyFg,
      "Keep Informed": UST.darkFg, "Monitor": UST.darkFg,
    };

    const grid = [
      ["HIGH Influence", "Manage Closely", "Keep Satisfied"],
      ["LOW Influence",  "Keep Informed",  "Monitor"],
    ];
    grid.forEach((rowData) => {
      const row = ws.addRow(rowData);
      row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
      row.getCell(1).fill = fill(UST.offWhite);
      [2, 3].forEach((c) => {
        const q = rowData[c - 1];
        row.getCell(c).fill = fill(quadrantFills[q] ?? UST.white);
        row.getCell(c).font = { bold: true, color: { argb: quadrantFg[q] ?? UST.darkFg }, size: 10 };
        row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
      });
      row.height = 32;
    });

    ws.addRow([]);

    // Stakeholder placement list
    const listH = ws.addRow(["Stakeholder", "Quadrant", ""]);
    applyHeader(listH);
    (content.stakeholders ?? []).forEach((s: any, i: number) => {
      const q = safeStr(s.quadrant ?? "Monitor");
      const row = ws.addRow([safeStr(s.name), q, ""]);
      applyBody(row, bg(i));
      const qFg = quadrantFg[q] ?? UST.darkFg;
      const qBg = quadrantFills[q] ?? UST.white;
      row.getCell(2).fill = fill(qBg);
      row.getCell(2).font = { bold: true, color: { argb: qFg }, size: 10 };
    });
  }

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE PLAN
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildResourcePlanXlsx(content: any): Promise<Buffer> {
  const wb = newWb();
  const ws = wb.addWorksheet("Resource Plan");
  const resources = content.teamDirectory ?? content.resources ?? content.team ?? [];

  tableSheet(ws,
    ["ID", "Name", "Role", "Department", "Skills", "Allocation %", "Start Date", "End Date", "Location", "Daily Rate", "Currency", "Notes"],
    resources.map((r: any) => [
      safeStr(r.id), safeStr(r.name), safeStr(r.role), safeStr(r.department ?? r.organization ?? ""),
      Array.isArray(r.skills) ? r.skills.join(", ") : safeStr(r.skills ?? ""),
      safeStr(r.allocationPercent ?? r.allocation ?? ""), safeStr(r.startDate ?? ""), safeStr(r.endDate ?? ""),
      safeStr(r.location ?? ""), safeStr(r.dailyRate ?? r.costPerMonth ?? r.rate ?? ""),
      safeStr(r.currency ?? "USD"), safeStr(r.notes ?? ""),
    ]),
    [8, 22, 22, 20, 36, 14, 14, 14, 16, 14, 10, 24]
  );

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC LOG (action_log, decision_log, assumption_log, benefits_register)
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildGenericLogXlsx(
  content: any,
  sheetName: string,
  keys: string[],
  headers: string[]
): Promise<Buffer> {
  const wb = newWb();
  const ws = wb.addWorksheet(sheetName);
  const items: any[] = (Object.values(content)[0] as any[]) ?? [];

  tableSheet(ws, headers,
    items.map((item) => keys.map((k) => safeStr(item[k]))),
    headers.map((h) => Math.min(Math.max(h.length + 4, 14), 40))
  );

  return toBuffer(wb);
}
