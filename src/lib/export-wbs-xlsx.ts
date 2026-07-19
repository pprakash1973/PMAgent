/**
 * WBS Excel export — ExcelJS implementation.
 * Produces a fully styled, UST-branded workbook with:
 *   Sheet 1: WBS Hierarchy  (level-banded rows, bold phase/deliverable rows)
 *   Sheet 2: WBS Dictionary (work packages, wrapped long-text cells)
 *   Sheet 3: Scope Baseline Summary
 *   Sheet 4: Quality Audit  (Pass=green, Fail=red, Partial=amber)
 */
import ExcelJS from "exceljs";

// ── UST brand palette ───────────────────────────────────────────────────────
const UST = {
  navyFg:    "FFFFFFFF",
  navy:      "FF006E74",   // Dark Teal — header fill
  teal:      "FF0097AC",   // Light Teal — L2 phase rows
  tealLight: "FFB2DDE3",   // very light teal — L3 deliverable rows
  white:     "FFFFFFFF",
  offWhite:  "FFF2F7F8",   // alternating row bg
  softBlack: "FF231F20",
  green:     "FF01B27C",
  greenFg:   "FFFFFFFF",
  amber:     "FFFFC000",
  amberFg:   "FF231F20",
  red:       "FFFC6A59",
  redFg:     "FFFFFFFF",
  muted:     "FF7A7480",
};

function headerFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyHeaderStyle(row: ExcelJS.Row, bgArgb = UST.navy, fgArgb = UST.navyFg) {
  row.eachCell((cell) => {
    cell.fill = headerFill(bgArgb);
    cell.font = { bold: true, color: { argb: fgArgb }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCCD6D7" } },
    };
  });
  row.height = 22;
}

function applyBodyStyle(
  row: ExcelJS.Row,
  bgArgb: string,
  bold = false,
  indent = 0,
  wrapText = false
) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = headerFill(bgArgb);
    cell.font = { bold, color: { argb: UST.softBlack }, size: 10 };
    cell.alignment = { vertical: "middle", wrapText };
    cell.border = {
      bottom: { style: "hair", color: { argb: "FFDDDDDD" } },
    };
  });
  // indent the Element Name column (col C = index 3)
  const nameCell = row.getCell(3);
  nameCell.alignment = { ...nameCell.alignment, indent };
  if (!wrapText) row.height = 18;
}

function freezeRow(sheet: ExcelJS.Worksheet, row = 1) {
  sheet.views = [{ state: "frozen", ySplit: row, topLeftCell: `A${row + 1}` }];
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── Sheet 1: WBS Hierarchy ──────────────────────────────────────────────────
function buildHierarchySheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("WBS Hierarchy");

  ws.columns = [
    { header: "WBS Code",           key: "code",     width: 14 },
    { header: "Level",              key: "level",    width: 8  },
    { header: "Element Name",       key: "name",     width: 42 },
    { header: "Component Type",     key: "type",     width: 16 },
    { header: "Work Package?",      key: "isWP",     width: 14 },
    { header: "Owner",              key: "owner",    width: 22 },
    { header: "Est. Days",          key: "days",     width: 12 },
    { header: "Est. Hours",         key: "hours",    width: 12 },
    { header: "100% Check",         key: "check",    width: 44 },
  ];

  applyHeaderStyle(ws.getRow(1));
  freezeRow(ws, 1);

  let rowIdx = 2;
  for (const phase of content.phases ?? []) {
    // L2 — Phase row
    const pRow = ws.addRow([
      safeStr(phase.id), 2, safeStr(phase.name),
      safeStr(phase.componentType ?? "LoE"), "No",
      safeStr(phase.owner ?? ""), "", "",
      safeStr(phase["100percentCheck"] ?? ""),
    ]);
    applyBodyStyle(pRow, UST.teal, true, 0);
    pRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    pRow.getCell(3).font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    rowIdx++;

    for (const del of phase.deliverables ?? []) {
      // L3 — Deliverable row
      const dRow = ws.addRow([
        safeStr(del.id), 3, safeStr(del.name),
        safeStr(del.componentType ?? "Discrete"), "No",
        safeStr(del.owner ?? ""), "", "",
        safeStr(del["100percentCheck"] ?? ""),
      ]);
      applyBodyStyle(dRow, UST.tealLight, true, 1);
      rowIdx++;

      let altIdx = 0;
      for (const wp of del.workPackages ?? []) {
        const days = Number(wp.estimatedDays) || 0;
        const bg = altIdx % 2 === 0 ? UST.white : UST.offWhite;
        const wRow = ws.addRow([
          safeStr(wp.id), 4, safeStr(wp.name),
          safeStr(wp.componentType ?? "Discrete"), "Yes",
          safeStr(wp.owner ?? ""),
          days || "", days ? days * 8 : "", "",
        ]);
        applyBodyStyle(wRow, bg, false, 2);
        altIdx++;
        rowIdx++;
      }
    }
  }

  // Auto-filter on header row
  ws.autoFilter = { from: "A1", to: "I1" };
}

// ── Sheet 2: WBS Dictionary ─────────────────────────────────────────────────
function buildDictionarySheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("WBS Dictionary");

  ws.columns = [
    { header: "WBS Code",           key: "code",       width: 12 },
    { header: "Work Package Name",  key: "name",       width: 30 },
    { header: "Description",        key: "desc",       width: 40 },
    { header: "In Scope",           key: "inScope",    width: 30 },
    { header: "Out of Scope",       key: "outScope",   width: 34 },
    { header: "Acceptance Criteria",key: "ac",         width: 38 },
    { header: "Owner",              key: "owner",      width: 20 },
    { header: "Dependencies",       key: "deps",       width: 20 },
    { header: "Est. Days",          key: "days",       width: 12 },
    { header: "Est. Hours",         key: "hours",      width: 12 },
  ];

  applyHeaderStyle(ws.getRow(1));
  freezeRow(ws, 1);

  let altIdx = 0;
  for (const phase of content.phases ?? []) {
    for (const del of phase.deliverables ?? []) {
      for (const wp of del.workPackages ?? []) {
        const days = Number(wp.estimatedDays) || 0;
        const bg = altIdx % 2 === 0 ? UST.white : UST.offWhite;
        const row = ws.addRow([
          safeStr(wp.id),
          safeStr(wp.name),
          safeStr(wp.description),
          safeStr(wp.name) + " completed and accepted",
          safeStr(wp.outOfScope ?? ("Work outside of " + safeStr(del.name))),
          safeStr(wp.acceptanceCriteria ?? "Delivered and signed off by owner"),
          safeStr(wp.owner ?? ""),
          Array.isArray(wp.dependencies) ? wp.dependencies.join(", ") : safeStr(wp.dependencies ?? ""),
          days || "",
          days ? days * 8 : "",
        ]);
        applyBodyStyle(row, bg, false, 0, true);
        row.height = 32;
        altIdx++;
      }
    }
  }

  ws.autoFilter = { from: "A1", to: "J1" };
}

// ── Sheet 3: Scope Baseline Summary ─────────────────────────────────────────
function buildScopeBaselineSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("Scope Baseline Summary");
  ws.columns = [{ width: 32 }, { width: 22 }, { width: 18 }];

  const sbs = content.scopeBaselineSummary ?? {};
  let totalDays = 0;
  let totalWPs = 0;
  for (const p of content.phases ?? []) {
    for (const d of p.deliverables ?? []) {
      for (const wp of d.workPackages ?? []) {
        totalDays += Number(wp.estimatedDays) || 0;
        totalWPs++;
      }
    }
  }

  // Title row
  const titleRow = ws.addRow(["SCOPE BASELINE SUMMARY", "", ""]);
  ws.mergeCells(`A${titleRow.number}:C${titleRow.number}`);
  titleRow.getCell(1).fill = headerFill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 28;

  ws.addRow([]);

  const kvRows: [string, string | number][] = [
    ["Project",                safeStr(content.projectName)],
    ["WBS Top-Level Code",     safeStr(content.wbsCode ?? "1")],
    ["Structuring Approach",   safeStr(content.structuringApproach ?? sbs.structuringApproach ?? "")],
    ["Total Components",       sbs.totalComponents ?? ""],
    ["Total Work Packages",    sbs.totalWorkPackages ?? totalWPs],
    ["Total Estimated Days",   sbs.totalEstimatedDays ?? totalDays],
    ["Total Estimated Hours",  (sbs.totalEstimatedDays ?? totalDays) * 8],
    ["Max Depth (levels)",     sbs.maxDepth ?? 4],
  ];

  for (const [label, value] of kvRows) {
    const row = ws.addRow([label, value, ""]);
    row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
    row.getCell(2).font = { color: { argb: UST.softBlack }, size: 10 };
    row.getCell(1).fill = headerFill(UST.offWhite);
    row.height = 18;
  }

  ws.addRow([]);

  // Phase breakdown sub-table
  const phaseHeader = ws.addRow(["Phase", "Work Packages", "Est. Days"]);
  applyHeaderStyle(phaseHeader, UST.teal, UST.navyFg);

  for (const p of content.phases ?? []) {
    const wpCount = (p.deliverables ?? []).reduce(
      (s: number, d: any) => s + (d.workPackages ?? []).length, 0
    );
    const pDays = (p.deliverables ?? []).reduce(
      (s: number, d: any) => s + (d.workPackages ?? []).reduce(
        (s2: number, wp: any) => s2 + (Number(wp.estimatedDays) || 0), 0
      ), 0
    );
    const row = ws.addRow([safeStr(p.name), wpCount, pDays]);
    row.getCell(1).font = { color: { argb: UST.softBlack }, size: 10 };
    row.getCell(2).font = { color: { argb: UST.softBlack }, size: 10 };
    row.getCell(3).font = { color: { argb: UST.softBlack }, size: 10 };
    row.height = 18;
  }

  ws.addRow([]);

  const noteRow = ws.addRow(["Note", safeStr(
    sbs.note ??
    "Scope baseline = Scope Statement + WBS + WBS Dictionary. Changes after approval require formal change control."
  )]);
  noteRow.getCell(1).font = { bold: true, italic: true, color: { argb: UST.muted }, size: 9 };
  noteRow.getCell(2).font = { italic: true, color: { argb: UST.muted }, size: 9 };
  noteRow.getCell(2).alignment = { wrapText: true };
  noteRow.height = 32;
  ws.mergeCells(`B${noteRow.number}:C${noteRow.number}`);
}

// ── Sheet 4: Quality Audit ───────────────────────────────────────────────────
function buildQualityAuditSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("Quality Audit");

  ws.columns = [
    { header: "#",             key: "num",      width: 6  },
    { header: "Quality Check", key: "check",    width: 50 },
    { header: "Result",        key: "result",   width: 12 },
    { header: "Evidence",      key: "evidence", width: 56 },
  ];

  applyHeaderStyle(ws.getRow(1));
  freezeRow(ws, 1);

  const audit: any[] = content.qualityAudit ?? [];
  if (audit.length === 0) {
    const row = ws.addRow(["—", "Quality audit not generated — re-generate WBS to include audit", "N/A", ""]);
    applyBodyStyle(row, UST.offWhite);
    return;
  }

  for (const q of audit) {
    const result = safeStr(q.result).toLowerCase();
    const row = ws.addRow([
      safeStr(q.check),
      safeStr(q.description),
      safeStr(q.result),
      safeStr(q.evidence),
    ]);
    applyBodyStyle(row, UST.white, false, 0, true);
    row.height = 28;

    // Color-code the Result cell
    const resultCell = row.getCell(3);
    if (result === "pass") {
      resultCell.fill = headerFill(UST.green);
      resultCell.font = { bold: true, color: { argb: UST.greenFg }, size: 10 };
    } else if (result === "fail") {
      resultCell.fill = headerFill(UST.red);
      resultCell.font = { bold: true, color: { argb: UST.redFg }, size: 10 };
    } else {
      // Partial / N/A
      resultCell.fill = headerFill(UST.amber);
      resultCell.font = { bold: true, color: { argb: UST.amberFg }, size: 10 };
    }
    resultCell.alignment = { horizontal: "center", vertical: "middle" };
  }

  ws.autoFilter = { from: "A1", to: "D1" };
}

// ── Public entry point ───────────────────────────────────────────────────────
export async function buildWbsXlsx(content: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PM Agent · UST";
  wb.created = new Date();

  buildHierarchySheet(wb, content);
  buildDictionarySheet(wb, content);
  buildScopeBaselineSheet(wb, content);
  buildQualityAuditSheet(wb, content);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
