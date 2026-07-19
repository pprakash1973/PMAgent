/**
 * Risk Register + Issue Register — ExcelJS exports with UST branding.
 *
 * Risk Register (4 sheets):
 *   1. Risk Register  — full PMBOK 11.2–11.4 columns, severity color-coded
 *   2. P×I Heat Map   — 5×5 grid, cell-colored by score band
 *   3. Response Plan  — Critical/High/Medium risks with mitigation + contingency
 *   4. Risk Dashboard — KPI summary + category breakdown
 *
 * Issue Register (2 sheets):
 *   1. Issue Register — full columns, severity + status color-coded
 *   2. Issue Summary  — counts by severity and category
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
  purple:    "FF881E87",
  purpleBg:  "FFF5D6F5",
  grey:      "FFC2BCBE",
  greyBg:    "FFF5F5F5",
  muted:     "FF7A7480",
  navyFg:    "FFFFFFFF",
  darkFg:    "FF231F20",
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = fill(UST.navy);
    cell.font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCD6D7" } } };
  });
  row.height = 22;
}

function applyBody(row: ExcelJS.Row, bg: string, wrap = false) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(bg);
    cell.font = { color: { argb: UST.softBlack }, size: 10 };
    cell.alignment = { vertical: "middle", wrapText: wrap };
    cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
  });
  if (!wrap) row.height = 18;
}

function freeze(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: "frozen", ySplit: 1, topLeftCell: "A2" }];
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Severity → colors
function severityFill(sev: string): { bg: string; fg: string } {
  switch (sev.toLowerCase()) {
    case "critical": return { bg: UST.red,    fg: UST.navyFg };
    case "high":     return { bg: UST.amber,  fg: UST.darkFg };
    case "medium":   return { bg: UST.teal,   fg: UST.navyFg };
    default:         return { bg: UST.green,  fg: UST.navyFg };
  }
}

// Risk level → colors (same mapping as severity but labeled differently)
function riskLevelFill(level: string): { bg: string; fg: string } {
  switch (level.toLowerCase()) {
    case "critical": return { bg: UST.red,      fg: UST.navyFg };
    case "high":     return { bg: UST.amber,    fg: UST.darkFg };
    case "medium":   return { bg: UST.tealLight,fg: UST.darkFg };
    default:         return { bg: UST.greenBg,  fg: UST.darkFg };
  }
}

// P×I score → fill color for heat map
function heatFill(score: number): string {
  if (score >= 15) return UST.red;
  if (score >= 10) return UST.amber;
  if (score >= 5)  return UST.tealLight;
  return UST.greenBg;
}

function heatFg(score: number): string {
  if (score >= 10) return UST.navyFg;
  return UST.darkFg;
}

// Issue status → colors
function statusFill(status: string): { bg: string; fg: string } {
  switch (status.toLowerCase()) {
    case "resolved":
    case "closed":    return { bg: UST.greenBg,  fg: UST.darkFg };
    case "escalated": return { bg: UST.red,       fg: UST.navyFg };
    case "in progress": return { bg: UST.tealLight, fg: UST.darkFg };
    case "open":      return { bg: UST.amberBg,  fg: UST.darkFg };
    default:          return { bg: UST.greyBg,   fg: UST.darkFg };
  }
}

// ── RISK REGISTER ─────────────────────────────────────────────────────────────

function buildRiskRegisterSheet(wb: ExcelJS.Workbook, risks: any[]) {
  const ws = wb.addWorksheet("Risk Register");

  ws.columns = [
    { header: "Risk ID",          key: "id",          width: 10 },
    { header: "Category",         key: "category",    width: 16 },
    { header: "Type",             key: "type",        width: 10 },
    { header: "Risk Description", key: "statement",   width: 50 },
    { header: "Probability (1-5)",key: "prob",        width: 14 },
    { header: "Impact (1-5)",     key: "impact",      width: 12 },
    { header: "Risk Score",       key: "score",       width: 12 },
    { header: "Risk Level",       key: "level",       width: 12 },
    { header: "Owner",            key: "owner",       width: 20 },
    { header: "Response Strategy",key: "strategy",    width: 18 },
    { header: "Response Actions", key: "actions",     width: 44 },
    { header: "Contingency Plan", key: "contingency", width: 38 },
    { header: "Trigger",          key: "trigger",     width: 28 },
    { header: "Residual Score",   key: "residual",    width: 14 },
    { header: "Status",           key: "status",      width: 12 },
    { header: "Date Identified",  key: "date",        width: 16 },
    { header: "Notes",            key: "notes",       width: 28 },
  ];

  applyHeader(ws.getRow(1));
  freeze(ws);

  let alt = 0;
  for (const r of risks) {
    const bg = alt % 2 === 0 ? UST.white : UST.offWhite;
    const level = safeStr(r.severity ?? r.riskLevel ?? "");
    const row = ws.addRow([
      safeStr(r.id),
      safeStr(r.category),
      safeStr(r.type ?? "Threat"),
      safeStr(r.statement ?? r.description),
      safeStr(r.probabilityScore ?? r.probability ?? ""),
      safeStr(r.impactScore ?? r.impact ?? ""),
      safeStr(r.riskScore ?? ""),
      level,
      safeStr(r.owner),
      safeStr(r.strategy),
      safeStr(r.responseActions),
      safeStr(r.contingencyPlan),
      safeStr(r.trigger),
      safeStr(r.residualRiskScore ?? ""),
      safeStr(r.status ?? "Open"),
      safeStr(r.dueDate ?? r.dateIdentified ?? ""),
      safeStr(r.notes ?? ""),
    ]);
    applyBody(row, bg, true);
    row.height = 32;

    // Color the Risk Level cell (col 8)
    if (level) {
      const lc = riskLevelFill(level);
      const lCell = row.getCell(8);
      lCell.fill = fill(lc.bg);
      lCell.font = { bold: true, color: { argb: lc.fg }, size: 10 };
      lCell.alignment = { horizontal: "center", vertical: "middle" };
    }
    alt++;
  }

  ws.autoFilter = { from: "A1", to: "Q1" };
}

function buildPxISheet(wb: ExcelJS.Workbook, risks: any[]) {
  const ws = wb.addWorksheet("P×I Heat Map");

  ws.columns = [
    { width: 20 },
    { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 },
  ];

  const impactLabels = ["", "1 — Very Low", "2 — Low", "3 — Medium", "4 — High", "5 — Very High"];
  const hRow = ws.addRow(impactLabels);
  hRow.eachCell((cell, col) => {
    cell.fill = fill(col === 1 ? UST.softBlack : UST.navy);
    cell.font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  hRow.height = 22;

  const probLabels: Record<number, string> = {
    5: "5 — Very High",
    4: "4 — High",
    3: "3 — Medium",
    2: "2 — Low",
    1: "1 — Very Low",
  };

  for (let p = 5; p >= 1; p--) {
    const rowData: (string | number)[] = [probLabels[p]];
    for (let i = 1; i <= 5; i++) {
      const score = p * i;
      const label = score >= 15 ? "CRITICAL" : score >= 10 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
      const ids = risks
        .filter((r) => +safeStr(r.probabilityScore ?? r.probability ?? 0) === p && +safeStr(r.impactScore ?? r.impact ?? 0) === i)
        .map((r) => safeStr(r.id))
        .join(", ");
      rowData.push(`${label} (${score})${ids ? "\n" + ids : ""}`);
    }
    const row = ws.addRow(rowData);
    row.height = ids_present(rowData) ? 40 : 28;

    // Style probability label cell
    row.getCell(1).fill = fill(UST.softBlack);
    row.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

    for (let i = 1; i <= 5; i++) {
      const score = p * i;
      const cell = row.getCell(i + 1);
      cell.fill = fill(heatFill(score));
      cell.font = { bold: true, color: { argb: heatFg(score) }, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }

  // Axis label
  const axisRow = ws.addRow(["← Probability", "← Impact →", "", "", "", ""]);
  axisRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: UST.muted }, size: 9 };
  });

  // Legend
  ws.addRow([]);
  const legend = [
    ["CRITICAL (≥15)", UST.red,      UST.navyFg],
    ["HIGH (10–14)",   UST.amber,    UST.darkFg],
    ["MEDIUM (5–9)",   UST.tealLight,UST.darkFg],
    ["LOW (1–4)",      UST.greenBg,  UST.darkFg],
  ] as [string, string, string][];
  for (const [label, bg, fg] of legend) {
    const row = ws.addRow([label, "", "", "", "", ""]);
    row.getCell(1).fill = fill(bg);
    row.getCell(1).font = { bold: true, color: { argb: fg }, size: 10 };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.height = 20;
  }
}

function ids_present(row: (string | number)[]): boolean {
  return row.slice(1).some((v) => String(v).includes("\n"));
}

function buildResponsePlanSheet(wb: ExcelJS.Workbook, risks: any[]) {
  const ws = wb.addWorksheet("Response Plan");

  ws.columns = [
    { header: "Risk ID",           key: "id",          width: 10 },
    { header: "Risk Description",  key: "desc",        width: 36 },
    { header: "Risk Level",        key: "level",       width: 12 },
    { header: "Response Strategy", key: "strategy",    width: 18 },
    { header: "Mitigation Actions",key: "actions",     width: 44 },
    { header: "Contingency Plan",  key: "contingency", width: 40 },
    { header: "Trigger",           key: "trigger",     width: 28 },
    { header: "Owner",             key: "owner",       width: 20 },
    { header: "Due Date",          key: "due",         width: 14 },
    { header: "Cost Reserve",      key: "reserve",     width: 14 },
    { header: "Status",            key: "status",      width: 14 },
  ];

  applyHeader(ws.getRow(1));
  freeze(ws);

  const filtered = risks.filter((r) =>
    ["critical", "high", "medium"].includes(safeStr(r.severity ?? r.riskLevel ?? "").toLowerCase())
  );

  let alt = 0;
  for (const r of filtered) {
    const bg = alt % 2 === 0 ? UST.white : UST.offWhite;
    const level = safeStr(r.severity ?? r.riskLevel ?? "");
    const row = ws.addRow([
      safeStr(r.id),
      safeStr(r.statement ?? r.description).slice(0, 120),
      level,
      safeStr(r.strategy),
      safeStr(r.responseActions),
      safeStr(r.contingencyPlan),
      safeStr(r.trigger),
      safeStr(r.owner),
      safeStr(r.dueDate ?? ""),
      safeStr(r.contingencyReserve ?? ""),
      safeStr(r.status ?? "Planned"),
    ]);
    applyBody(row, bg, true);
    row.height = 36;

    if (level) {
      const lc = riskLevelFill(level);
      const lCell = row.getCell(3);
      lCell.fill = fill(lc.bg);
      lCell.font = { bold: true, color: { argb: lc.fg }, size: 10 };
      lCell.alignment = { horizontal: "center", vertical: "middle" };
    }
    alt++;
  }

  ws.autoFilter = { from: "A1", to: "K1" };
}

function buildRiskDashboardSheet(wb: ExcelJS.Workbook, content: any, risks: any[]) {
  const ws = wb.addWorksheet("Risk Dashboard");
  ws.columns = [{ width: 28 }, { width: 18 }];

  const titleRow = ws.addRow(["RISK DASHBOARD SUMMARY", ""]);
  ws.mergeCells(`A1:B1`);
  titleRow.getCell(1).fill = fill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 28;

  ws.addRow([]);

  const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const catMap = new Map<string, number>();
  for (const r of risks) {
    const sev = safeStr(r.severity ?? r.riskLevel ?? "");
    const capSev = sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();
    if (capSev in counts) counts[capSev]++;
    const cat = safeStr(r.category) || "Unknown";
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
  }

  const kv: [string, string | number, string][] = [
    ["Total Risks",      risks.length,       UST.offWhite],
    ["Critical",         counts.Critical,    UST.redBg],
    ["High",             counts.High,        UST.amberBg],
    ["Medium",           counts.Medium,      UST.tealLight],
    ["Low",              counts.Low,         UST.greenBg],
    ["Top Risk",         safeStr((content.riskExposureSummary?.topRisk) ?? risks[0]?.statement ?? risks[0]?.description ?? ""), UST.offWhite],
    ["Risk Appetite",    safeStr(content.riskAppetite ?? ""), UST.offWhite],
  ];

  for (const [label, value, bg] of kv) {
    const row = ws.addRow([label, value]);
    row.getCell(1).fill = fill(bg);
    row.getCell(2).fill = fill(bg);
    row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
    row.getCell(2).font = { color: { argb: UST.softBlack }, size: 10 };
    row.height = 18;
  }

  ws.addRow([]);

  const catHeader = ws.addRow(["Category", "Count"]);
  applyHeader(catHeader);

  let alt = 0;
  for (const [cat, cnt] of catMap.entries()) {
    const row = ws.addRow([cat, cnt]);
    applyBody(row, alt % 2 === 0 ? UST.white : UST.offWhite);
    alt++;
  }
}

export async function buildRiskRegisterXlsx(content: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PM Agent · UST";
  wb.created = new Date();

  const risks: any[] = content.risks ?? [];
  buildRiskRegisterSheet(wb, risks);
  buildPxISheet(wb, risks);
  buildResponsePlanSheet(wb, risks);
  buildRiskDashboardSheet(wb, content, risks);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── ISSUE REGISTER ────────────────────────────────────────────────────────────

function buildIssueRegisterSheet(wb: ExcelJS.Workbook, issues: any[]) {
  const ws = wb.addWorksheet("Issue Register");

  ws.columns = [
    { header: "Issue ID",            key: "id",           width: 10 },
    { header: "Title",               key: "title",        width: 28 },
    { header: "Category",            key: "category",     width: 16 },
    { header: "Severity",            key: "severity",     width: 12 },
    { header: "Description",         key: "description",  width: 44 },
    { header: "Business Impact",     key: "impact",       width: 36 },
    { header: "Root Cause",          key: "rootCause",    width: 36 },
    { header: "Raised By",           key: "raisedBy",     width: 18 },
    { header: "Date Raised",         key: "dateRaised",   width: 14 },
    { header: "Owner",               key: "owner",        width: 20 },
    { header: "Resolution Plan",     key: "resolution",   width: 44 },
    { header: "Target Date",         key: "targetDate",   width: 14 },
    { header: "Actual Resolved",     key: "actualDate",   width: 14 },
    { header: "Escalation Path",     key: "escalation",   width: 24 },
    { header: "Status",              key: "status",       width: 14 },
    { header: "Resolution Notes",    key: "resNotes",     width: 36 },
    { header: "Lessons Learned",     key: "lessons",      width: 36 },
  ];

  applyHeader(ws.getRow(1));
  freeze(ws);

  let alt = 0;
  for (const issue of issues) {
    const bg = alt % 2 === 0 ? UST.white : UST.offWhite;
    const sev = safeStr(issue.severity ?? "");
    const status = safeStr(issue.status ?? "Open");

    const row = ws.addRow([
      safeStr(issue.id),
      safeStr(issue.title ?? ""),
      safeStr(issue.category ?? ""),
      sev,
      safeStr(issue.description ?? ""),
      safeStr(issue.impact ?? ""),
      safeStr(issue.rootCause ?? ""),
      safeStr(issue.raisedBy ?? ""),
      safeStr(issue.dateRaised ?? ""),
      safeStr(issue.owner ?? ""),
      safeStr(issue.resolutionPlan ?? issue.resolution ?? ""),
      safeStr(issue.targetResolutionDate ?? issue.dueDate ?? ""),
      safeStr(issue.actualResolutionDate ?? ""),
      safeStr(issue.escalationPath ?? ""),
      status,
      safeStr(issue.resolution ?? ""),
      safeStr(issue.lessonsLearned ?? ""),
    ]);

    applyBody(row, bg, true);
    row.height = 36;

    // Color Severity cell (col 4)
    if (sev) {
      const sc = severityFill(sev);
      const sevCell = row.getCell(4);
      sevCell.fill = fill(sc.bg);
      sevCell.font = { bold: true, color: { argb: sc.fg }, size: 10 };
      sevCell.alignment = { horizontal: "center", vertical: "middle" };
    }

    // Color Status cell (col 15)
    if (status) {
      const stc = statusFill(status);
      const stCell = row.getCell(15);
      stCell.fill = fill(stc.bg);
      stCell.font = { bold: true, color: { argb: stc.fg }, size: 10 };
      stCell.alignment = { horizontal: "center", vertical: "middle" };
    }

    alt++;
  }

  ws.autoFilter = { from: "A1", to: "Q1" };
}

function buildIssueSummarySheet(wb: ExcelJS.Workbook, issues: any[]) {
  const ws = wb.addWorksheet("Issue Summary");
  ws.columns = [{ width: 26 }, { width: 16 }];

  const titleRow = ws.addRow(["ISSUE SUMMARY", ""]);
  ws.mergeCells(`A1:B1`);
  titleRow.getCell(1).fill = fill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 28;

  ws.addRow([]);

  const sevCounts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const statusCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();

  for (const issue of issues) {
    const sev = (safeStr(issue.severity ?? "")).toLowerCase();
    const capSev = sev.charAt(0).toUpperCase() + sev.slice(1);
    if (capSev in sevCounts) sevCounts[capSev]++;
    const st = safeStr(issue.status ?? "Open");
    statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1);
    const cat = safeStr(issue.category ?? "Unknown");
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }

  // By severity
  const sevHeader = ws.addRow(["Severity", "Count"]);
  applyHeader(sevHeader);

  const sevRows: [string, number, string, string][] = [
    ["Critical", sevCounts.Critical, UST.red,      UST.navyFg],
    ["High",     sevCounts.High,     UST.amber,    UST.darkFg],
    ["Medium",   sevCounts.Medium,   UST.tealLight,UST.darkFg],
    ["Low",      sevCounts.Low,      UST.greenBg,  UST.darkFg],
  ];
  for (const [label, cnt, bg, fg] of sevRows) {
    const row = ws.addRow([label, cnt]);
    row.getCell(1).fill = fill(bg);
    row.getCell(2).fill = fill(bg);
    row.getCell(1).font = { bold: true, color: { argb: fg }, size: 10 };
    row.getCell(2).font = { color: { argb: fg }, size: 10 };
    row.height = 18;
  }

  ws.addRow([]);

  // By status
  const stHeader = ws.addRow(["Status", "Count"]);
  applyHeader(stHeader);
  let alt = 0;
  for (const [st, cnt] of statusCounts.entries()) {
    const row = ws.addRow([st, cnt]);
    applyBody(row, alt % 2 === 0 ? UST.white : UST.offWhite);
    alt++;
  }

  ws.addRow([]);

  // By category
  const catHeader = ws.addRow(["Category", "Count"]);
  applyHeader(catHeader);
  alt = 0;
  for (const [cat, cnt] of catCounts.entries()) {
    const row = ws.addRow([cat, cnt]);
    applyBody(row, alt % 2 === 0 ? UST.white : UST.offWhite);
    alt++;
  }
}

export async function buildIssueRegisterXlsx(content: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PM Agent · UST";
  wb.created = new Date();

  const issues: any[] = content.issues ?? [];
  buildIssueRegisterSheet(wb, issues);
  buildIssueSummarySheet(wb, issues);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
