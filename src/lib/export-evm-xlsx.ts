/**
 * EVM Analysis Excel export — ExcelJS implementation.
 * Sheet 1: EVM Calculations  (per-period + cumulative, green/red conditional)
 * Sheet 2: S-Curve & Dashboard (KPI callouts + RAG + line chart)
 * Sheet 3: Verdict            (narrative + interpretation table)
 */
import ExcelJS from "exceljs";

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
  muted:     "FF7A7480",
  navyFg:    "FFFFFFFF",
  darkFg:    "FF231F20",
  inputYellow: "FFFFF2CC",
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function headerRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = fill(UST.navy);
    cell.font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCD6D7" } } };
  });
  row.height = 22;
}

function freeze(ws: ExcelJS.Worksheet, rows = 2) {
  ws.views = [{ state: "frozen", ySplit: rows, topLeftCell: `A${rows + 1}` }];
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function ragColors(rag: string): { bg: string; fg: string } {
  switch (rag.toLowerCase()) {
    case "green": return { bg: UST.green, fg: UST.navyFg };
    case "amber": return { bg: UST.amber, fg: UST.darkFg };
    default:      return { bg: UST.red,   fg: UST.navyFg };
  }
}

function indexColor(val: number): string {
  return val >= 1 ? UST.greenBg : UST.redBg;
}

function varianceColor(val: number): string {
  return val >= 0 ? UST.greenBg : UST.redBg;
}

// ── Sheet 1: EVM Calculations ─────────────────────────────────────────────────
function buildCalcSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("EVM Calculations");
  const currency = safeStr(content.currency || "$");

  // Title row
  const titleRow = ws.addRow([`EVM CALCULATIONS — ${safeStr(content.projectName)}`]);
  ws.mergeCells(`A1:V1`);
  titleRow.getCell(1).fill = fill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 12 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 26;

  // Header row
  const headers = [
    "Period", "Label",
    `PV (${currency})`, `EV (${currency})`, `AC (${currency})`,
    `SV (${currency})`, `CV (${currency})`, "SV%", "CV%",
    "SPI", "CPI",
    `Cum PV`, `Cum EV`, `Cum AC`,
    `Cum SV`, `Cum CV`, "Cum SPI", "Cum CPI",
  ];
  const hRow = ws.addRow(headers);
  headerRow(hRow);
  freeze(ws, 2);

  ws.columns = [
    { key: "period",   width: 12 },
    { key: "label",    width: 22 },
    { key: "pv",       width: 14 },
    { key: "ev",       width: 14 },
    { key: "ac",       width: 14 },
    { key: "sv",       width: 14 },
    { key: "cv",       width: 14 },
    { key: "svpct",    width: 10 },
    { key: "cvpct",    width: 10 },
    { key: "spi",      width: 10 },
    { key: "cpi",      width: 10 },
    { key: "cpv",      width: 14 },
    { key: "cev",      width: 14 },
    { key: "cac",      width: 14 },
    { key: "csv",      width: 14 },
    { key: "ccv",      width: 14 },
    { key: "cspi",     width: 10 },
    { key: "ccpi",     width: 10 },
  ];

  const numFmt = `#,##0.00`;
  const pctFmt = `0.0%`;
  const idxFmt = `0.000`;

  const periods: any[] = content.periods ?? [];
  let altIdx = 0;
  for (const p of periods) {
    const bg = altIdx % 2 === 0 ? UST.white : UST.offWhite;
    const row = ws.addRow([
      safeStr(p.period),
      safeStr(p.periodLabel),
      safeNum(p.pv), safeNum(p.ev), safeNum(p.ac),
      safeNum(p.sv), safeNum(p.cv),
      safeNum(p.svPct) / 100, safeNum(p.cvPct) / 100,
      safeNum(p.spi), safeNum(p.cpi),
      safeNum(p.cumPv), safeNum(p.cumEv), safeNum(p.cumAc),
      safeNum(p.cumSv), safeNum(p.cumCv),
      safeNum(p.cumSpi), safeNum(p.cumCpi),
    ]);

    row.eachCell((cell) => {
      cell.fill = fill(bg);
      cell.font = { color: { argb: UST.softBlack }, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
    row.height = 18;

    // Format numbers
    for (let c = 3; c <= 7; c++) row.getCell(c).numFmt = numFmt;
    for (let c = 12; c <= 16; c++) row.getCell(c).numFmt = numFmt;
    row.getCell(8).numFmt = pctFmt;
    row.getCell(9).numFmt = pctFmt;
    row.getCell(10).numFmt = idxFmt;
    row.getCell(11).numFmt = idxFmt;
    row.getCell(17).numFmt = idxFmt;
    row.getCell(18).numFmt = idxFmt;

    // Color variances and indices
    row.getCell(6).fill = fill(varianceColor(safeNum(p.sv)));
    row.getCell(7).fill = fill(varianceColor(safeNum(p.cv)));
    row.getCell(8).fill = fill(varianceColor(safeNum(p.svPct)));
    row.getCell(9).fill = fill(varianceColor(safeNum(p.cvPct)));
    row.getCell(10).fill = fill(indexColor(safeNum(p.spi)));
    row.getCell(11).fill = fill(indexColor(safeNum(p.cpi)));
    row.getCell(15).fill = fill(varianceColor(safeNum(p.cumSv)));
    row.getCell(16).fill = fill(varianceColor(safeNum(p.cumCv)));
    row.getCell(17).fill = fill(indexColor(safeNum(p.cumSpi)));
    row.getCell(18).fill = fill(indexColor(safeNum(p.cumCpi)));

    // Left-align text columns
    row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };

    altIdx++;
  }

  ws.autoFilter = { from: "A2", to: "R2" };
}

// ── Sheet 2: Dashboard ────────────────────────────────────────────────────────
function buildDashboardSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("S-Curve & Dashboard");
  const currency = safeStr(content.currency || "$");
  const fc = content.forecast ?? {};
  const rag = safeStr(fc.ragStatus || "Red");
  const ragC = ragColors(rag);

  ws.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }];

  // Title
  const titleRow = ws.addRow(["EVM DASHBOARD", "", "", ""]);
  ws.mergeCells(`A1:D1`);
  titleRow.getCell(1).fill = fill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 28;

  ws.addRow([]);

  // RAG badge
  const ragRow = ws.addRow(["Overall Status", rag, "", ""]);
  ws.mergeCells(`B${ragRow.number}:D${ragRow.number}`);
  ragRow.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 11 };
  ragRow.getCell(2).fill = fill(ragC.bg);
  ragRow.getCell(2).font = { bold: true, color: { argb: ragC.fg }, size: 14 };
  ragRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
  ragRow.height = 26;

  ws.addRow([]);

  // Key metrics sub-header
  const kpiHeader = ws.addRow(["Metric", "Value", "Formula", "Interpretation"]);
  headerRow(kpiHeader);

  const numFmt = `#,##0.00`;
  const kpis = content.interpretationTable ?? [];

  if (kpis.length === 0) {
    // Fallback: build from forecast object
    const fallback = [
      { metric: "BAC",           formula: "Budget at Completion",   value: safeNum(content.bac),          interpretation: "Total approved budget" },
      { metric: "EAC",           formula: "BAC / CPI",              value: safeNum(fc.eac),               interpretation: `Projected total cost. ${safeNum(fc.eac) > safeNum(content.bac) ? "Over budget" : "Under budget"}` },
      { metric: "ETC",           formula: "EAC − AC",               value: safeNum(fc.etc),               interpretation: "Remaining cost needed" },
      { metric: "VAC (Cost)",    formula: "BAC − EAC",              value: safeNum(fc.vacCost),           interpretation: safeNum(fc.vacCost) < 0 ? "Projected overrun" : "Projected saving" },
      { metric: "SAC",           formula: "Planned months / SPI",   value: safeNum(fc.sac).toFixed(1) + " months", interpretation: `Projected duration. Planned end: ${safeStr(content.forecastEndDate || fc.projectedEndDate)}` },
      { metric: "VAC (Schedule)",formula: "Planned months − SAC",   value: safeNum(fc.vacSchedule).toFixed(1) + " months", interpretation: safeNum(fc.vacSchedule) < 0 ? "Behind schedule" : "Ahead of schedule" },
      { metric: "TCPI",          formula: "(BAC−EV)/(BAC−AC)",      value: safeNum(fc.tcpi).toFixed(3),   interpretation: safeNum(fc.tcpi) > 1.10 ? "Recovery unrealistic at current rate — recommend re-baseline or scope action" : "Recovery achievable" },
    ];
    let alt = 0;
    for (const k of fallback) {
      const row = ws.addRow([k.metric, k.value, k.formula, k.interpretation]);
      const bg = alt % 2 === 0 ? UST.white : UST.offWhite;
      row.eachCell((cell) => {
        cell.fill = fill(bg);
        cell.font = { color: { argb: UST.softBlack }, size: 10 };
        cell.alignment = { vertical: "middle", wrapText: false };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
      row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
      row.height = 18;
      alt++;
    }
  } else {
    let alt = 0;
    for (const k of kpis) {
      const row = ws.addRow([safeStr(k.metric), safeStr(k.value), safeStr(k.formula), safeStr(k.interpretation)]);
      const bg = alt % 2 === 0 ? UST.white : UST.offWhite;
      row.eachCell((cell) => {
        cell.fill = fill(bg);
        cell.font = { color: { argb: UST.softBlack }, size: 10 };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
      row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
      row.height = 22;
      alt++;
    }
  }

  ws.addRow([]);

  // S-Curve data table for chart
  const chartHeader = ws.addRow(["Period", `PV (${currency})`, `EV (${currency})`, `AC (${currency})`]);
  headerRow(chartHeader);

  const periods: any[] = content.periods ?? [];
  const pvData: ExcelJS.CellValue[] = [];
  const evData: ExcelJS.CellValue[] = [];
  const acData: ExcelJS.CellValue[] = [];
  const labels: ExcelJS.CellValue[] = [];
  const chartStartRow = ws.rowCount + 1;

  for (const p of periods) {
    const row = ws.addRow([safeStr(p.period), safeNum(p.cumPv), safeNum(p.cumEv), safeNum(p.cumAc)]);
    row.height = 16;
    pvData.push(safeNum(p.cumPv));
    evData.push(safeNum(p.cumEv));
    acData.push(safeNum(p.cumAc));
    labels.push(safeStr(p.period));
  }

  // Note: S-curve data table is ready above — select cols A-D and insert a Line chart in Excel to visualise.
}

// ── Sheet 3: Verdict ──────────────────────────────────────────────────────────
function buildVerdictSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("Verdict");
  ws.columns = [{ width: 26 }, { width: 72 }];

  const v = content.verdict ?? {};

  // Title
  const titleRow = ws.addRow(["EVM VERDICT", ""]);
  ws.mergeCells(`A1:B1`);
  titleRow.getCell(1).fill = fill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 28;

  ws.addRow([]);

  const sections: [string, string, string][] = [
    ["Cost Health",       safeStr(v.costHealth),       UST.teal],
    ["Schedule Health",   safeStr(v.scheduleHealth),   UST.teal],
    ["Recovery Outlook",  safeStr(v.recoveryOutlook),  UST.amber],
  ];

  for (const [label, text, accent] of sections) {
    const labelRow = ws.addRow([label, ""]);
    ws.mergeCells(`A${labelRow.number}:B${labelRow.number}`);
    labelRow.getCell(1).fill = fill(accent);
    labelRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 11 };
    labelRow.getCell(1).alignment = { vertical: "middle" };
    labelRow.height = 22;

    const bodyRow = ws.addRow(["", text]);
    ws.mergeCells(`A${bodyRow.number}:B${bodyRow.number}`);
    bodyRow.getCell(1).fill = fill(UST.offWhite);
    bodyRow.getCell(1).font = { color: { argb: UST.softBlack }, size: 10 };
    bodyRow.getCell(1).alignment = { vertical: "middle", wrapText: true };
    bodyRow.height = 48;

    ws.addRow([]);
  }

  // Recommended actions
  const actLabel = ws.addRow(["Recommended Actions", ""]);
  ws.mergeCells(`A${actLabel.number}:B${actLabel.number}`);
  actLabel.getCell(1).fill = fill(UST.navy);
  actLabel.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 11 };
  actLabel.height = 22;

  const actions: string[] = v.recommendedActions ?? [];
  for (let i = 0; i < actions.length; i++) {
    const row = ws.addRow([`${i + 1}.`, actions[i]]);
    row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
    row.getCell(2).font = { color: { argb: UST.softBlack }, size: 10 };
    row.getCell(1).fill = fill(i % 2 === 0 ? UST.white : UST.offWhite);
    row.getCell(2).fill = fill(i % 2 === 0 ? UST.white : UST.offWhite);
    row.getCell(2).alignment = { vertical: "middle", wrapText: true };
    row.height = 30;
  }

  ws.addRow([]);

  // Derivation note
  const noteRow = ws.addRow(["Derivation Method", safeStr(content.derivationMethod)]);
  noteRow.getCell(1).font = { bold: true, italic: true, color: { argb: UST.muted }, size: 9 };
  noteRow.getCell(2).font = { italic: true, color: { argb: UST.muted }, size: 9 };
  noteRow.getCell(2).alignment = { wrapText: true };
  noteRow.height = 32;
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function buildEvmXlsx(content: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PM Agent · UST";
  wb.created = new Date();

  buildCalcSheet(wb, content);
  buildDashboardSheet(wb, content);
  buildVerdictSheet(wb, content);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
