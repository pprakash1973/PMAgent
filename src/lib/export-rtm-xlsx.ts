/**
 * RTM Excel export — ExcelJS implementation.
 * Sheet 1: Requirements Traceability Matrix (color-coded status + traceability)
 * Sheet 2: Traceability Gaps
 * Sheet 3: Summary Dashboard
 */
import ExcelJS from "exceljs";

const UST = {
  navy:       "FF006E74",
  teal:       "FF0097AC",
  tealLight:  "FFB2DDE3",
  white:      "FFFFFFFF",
  offWhite:   "FFF2F7F8",
  softBlack:  "FF231F20",
  green:      "FF01B27C",
  greenDark:  "FF005C41",
  amber:      "FFFFC000",
  red:        "FFFC6A59",
  grey:       "FFC2BCBE",
  muted:      "FF7A7480",
  navyFg:     "FFFFFFFF",
  darkFg:     "FF231F20",
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function headerStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = fill(UST.navy);
    cell.font = { bold: true, color: { argb: UST.navyFg }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCD6D7" } } };
  });
  row.height = 22;
}

function bodyStyle(row: ExcelJS.Row, bgArgb: string, bold = false, wrap = false) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(bgArgb);
    cell.font = { bold, color: { argb: UST.softBlack }, size: 10 };
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
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function statusColors(status: string): { bg: string; fg: string } {
  switch (status.toLowerCase()) {
    case "accepted":    return { bg: UST.greenDark, fg: UST.white };
    case "verified":    return { bg: UST.green,     fg: UST.navyFg };
    case "implemented": return { bg: UST.teal,      fg: UST.navyFg };
    case "in progress": return { bg: UST.tealLight, fg: UST.darkFg };
    default:            return { bg: UST.grey,      fg: UST.darkFg };
  }
}

function traceColors(ts: string): { bg: string; fg: string } {
  switch (ts.toLowerCase()) {
    case "fully traced":     return { bg: UST.green, fg: UST.navyFg };
    case "partially traced": return { bg: UST.amber, fg: UST.darkFg };
    default:                 return { bg: UST.red,   fg: UST.navyFg };
  }
}

function impactColors(impact: string): { bg: string; fg: string } {
  switch (impact.toLowerCase()) {
    case "high":   return { bg: UST.red,   fg: UST.navyFg };
    case "medium": return { bg: UST.amber, fg: UST.darkFg };
    default:       return { bg: UST.green, fg: UST.navyFg };
  }
}

// ── Sheet 1: RTM ─────────────────────────────────────────────────────────────
function buildRtmSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("RTM");

  ws.columns = [
    { header: "Req ID",               key: "id",                 width: 10 },
    { header: "Category",             key: "category",           width: 16 },
    { header: "Source",               key: "source",             width: 16 },
    { header: "Requirement",          key: "requirementStatement",width: 48 },
    { header: "Priority",             key: "priority",           width: 14 },
    { header: "Complexity",           key: "complexity",         width: 12 },
    { header: "WBS Ref",              key: "wbsRef",             width: 20 },
    { header: "Milestone",            key: "milestone",          width: 20 },
    { header: "Deliverable",          key: "deliverable",        width: 22 },
    { header: "Acceptance Criteria",  key: "acceptanceCriteria", width: 40 },
    { header: "Validation Method",    key: "validationMethod",   width: 18 },
    { header: "Owner",                key: "owner",              width: 20 },
    { header: "Status",               key: "status",             width: 14 },
    { header: "Traceability",         key: "traceabilityStatus", width: 16 },
    { header: "Notes",                key: "notes",              width: 30 },
  ];

  headerStyle(ws.getRow(1));
  freeze(ws);

  const requirements: any[] = content.requirements ?? [];
  let altIdx = 0;
  for (const req of requirements) {
    const bg = altIdx % 2 === 0 ? UST.white : UST.offWhite;
    const row = ws.addRow([
      safeStr(req.id),
      safeStr(req.category),
      safeStr(req.source),
      safeStr(req.requirementStatement),
      safeStr(req.priority),
      safeStr(req.complexity),
      safeStr(req.wbsRef),
      safeStr(req.milestone),
      safeStr(req.deliverable),
      safeStr(req.acceptanceCriteria),
      safeStr(req.validationMethod),
      safeStr(req.owner),
      safeStr(req.status),
      safeStr(req.traceabilityStatus),
      safeStr(req.notes),
    ]);
    bodyStyle(row, bg, false, true);
    row.height = 36;

    // Color Status cell (col 13)
    const sc = statusColors(safeStr(req.status));
    const statusCell = row.getCell(13);
    statusCell.fill = fill(sc.bg);
    statusCell.font = { bold: true, color: { argb: sc.fg }, size: 10 };
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    // Color Traceability cell (col 14)
    const tc = traceColors(safeStr(req.traceabilityStatus));
    const traceCell = row.getCell(14);
    traceCell.fill = fill(tc.bg);
    traceCell.font = { bold: true, color: { argb: tc.fg }, size: 10 };
    traceCell.alignment = { horizontal: "center", vertical: "middle" };

    altIdx++;
  }

  ws.autoFilter = { from: "A1", to: "O1" };
  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });
}

// ── Sheet 2: Traceability Gaps ────────────────────────────────────────────────
function buildGapsSheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("Traceability Gaps");

  ws.columns = [
    { header: "Gap ID",        key: "gapId",          width: 10 },
    { header: "Description",   key: "description",    width: 54 },
    { header: "Impact",        key: "impact",         width: 12 },
    { header: "Recommendation",key: "recommendation", width: 54 },
  ];

  headerStyle(ws.getRow(1));
  freeze(ws);

  const gaps: any[] = content.traceabilityGaps ?? [];
  if (gaps.length === 0) {
    const row = ws.addRow(["—", "No traceability gaps identified.", "—", "—"]);
    bodyStyle(row, UST.offWhite);
  } else {
    let altIdx = 0;
    for (const gap of gaps) {
      const bg = altIdx % 2 === 0 ? UST.white : UST.offWhite;
      const row = ws.addRow([
        safeStr(gap.gapId),
        safeStr(gap.description),
        safeStr(gap.impact),
        safeStr(gap.recommendation),
      ]);
      bodyStyle(row, bg, false, true);
      row.height = 32;

      const ic = impactColors(safeStr(gap.impact));
      const impactCell = row.getCell(3);
      impactCell.fill = fill(ic.bg);
      impactCell.font = { bold: true, color: { argb: ic.fg }, size: 10 };
      impactCell.alignment = { horizontal: "center", vertical: "middle" };

      altIdx++;
    }
  }

  ws.autoFilter = { from: "A1", to: "D1" };
  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });
}

// ── Sheet 3: Summary ──────────────────────────────────────────────────────────
function buildSummarySheet(wb: ExcelJS.Workbook, content: any) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 28 }, { width: 18 }];

  const s = content.summary ?? {};
  const reqs: any[] = content.requirements ?? [];

  // Derive counts if summary object is sparse
  const totalReqs = s.totalRequirements ?? reqs.length;
  const fullyTraced = s.fullyTraced ?? reqs.filter((r) => r.traceabilityStatus?.toLowerCase() === "fully traced").length;
  const partiallyTraced = s.partiallyTraced ?? reqs.filter((r) => r.traceabilityStatus?.toLowerCase() === "partially traced").length;
  const notTraced = s.notTraced ?? reqs.filter((r) => r.traceabilityStatus?.toLowerCase() === "not traced").length;

  // Title
  const titleRow = ws.addRow(["RTM SUMMARY", ""]);
  ws.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
  titleRow.getCell(1).fill = fill(UST.navy);
  titleRow.getCell(1).font = { bold: true, color: { argb: UST.navyFg }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 28;

  ws.addRow([]);

  const kv: [string, string | number][] = [
    ["Project",               safeStr(content.projectName)],
    ["Document Version",      safeStr(content.documentVersion ?? "1.0")],
    ["Prepared Date",         safeStr(content.preparedDate ?? "")],
    ["Total Requirements",    totalReqs],
    ["Functional",            s.functional ?? reqs.filter((r) => r.category?.toLowerCase() === "functional").length],
    ["Non-Functional",        s.nonFunctional ?? reqs.filter((r) => r.category?.toLowerCase() === "non-functional").length],
    ["Business Rules",        s.businessRules ?? reqs.filter((r) => r.category?.toLowerCase() === "business rule").length],
    ["Fully Traced",          fullyTraced],
    ["Partially Traced",      partiallyTraced],
    ["Not Traced",            notTraced],
    ["Traceability Gaps",     (content.traceabilityGaps ?? []).length],
  ];

  for (const [label, value] of kv) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: UST.softBlack }, size: 10 };
    row.getCell(2).font = { color: { argb: UST.softBlack }, size: 10 };
    row.getCell(1).fill = fill(UST.offWhite);
    row.height = 18;
  }

  ws.addRow([]);

  // Category breakdown
  const catHeader = ws.addRow(["Category", "Count"]);
  headerStyle(catHeader);
  catHeader.height = 22;

  const catMap = new Map<string, number>();
  for (const r of reqs) {
    const c = safeStr(r.category) || "Unknown";
    catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }
  let altIdx = 0;
  for (const [cat, cnt] of catMap.entries()) {
    const row = ws.addRow([cat, cnt]);
    bodyStyle(row, altIdx % 2 === 0 ? UST.white : UST.offWhite);
    altIdx++;
  }

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function buildRtmXlsx(content: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PM Agent · UST";
  wb.created = new Date();

  buildRtmSheet(wb, content);
  buildGapsSheet(wb, content);
  buildSummarySheet(wb, content);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
