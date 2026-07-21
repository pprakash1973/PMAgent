// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require("pptxgenjs");

// ── UST Brand Palette ──────────────────────────────────────────────────────────
const PETROL     = "003C51";   // nav rail, cover backgrounds
const TEAL       = "006E74";   // primary — headers, badges, key shapes
const TEAL_L     = "0097AC";   // secondary accent
const SOFT_BLACK = "231F20";   // body text
const WHITE      = "FFFFFF";
const WASH       = "F2F7F8";   // light background wash
const MID_WASH   = "D7E0E3";   // borders, dividers
const DARK_GRAY  = "7A7480";   // secondary text / de-emphasised
const GREEN      = "01B27C";   // RAG Green / On Track
const AMBER_CLR  = "DBD3BD";   // RAG Amber background tint
const AMBER_TXT  = "B07C10";   // RAG Amber text
const RED        = "FC6A59";   // RAG Red / Alert

function ragFill(s: string): string {
  const v = (s ?? "").toLowerCase();
  if (v === "green" || v === "on track") return GREEN;
  if (v === "amber" || v === "at risk") return "FFC000";
  return RED;
}
function ragLabel(s: string): string {
  const v = (s ?? "").toLowerCase();
  if (v === "green" || v === "on track") return "ON TRACK";
  if (v === "amber" || v === "at risk") return "AT RISK";
  return "CRITICAL";
}

function safeStr(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const FOOTER_TEXT = "Confidential and Proprietary. © 2026 UST Global Inc";

// ── Shared slide helpers ───────────────────────────────────────────────────────

function addFooter(slide: any, projectName: string, pageNum: number) {
  slide.addText([
    { text: projectName + "  |  ", options: { bold: false } },
    { text: FOOTER_TEXT + "  |  ", options: { bold: false } },
    { text: String(pageNum), options: { bold: true } },
  ], {
    x: 0.3, y: 7.0, w: 12.73, h: 0.3,
    fontSize: 7, color: DARK_GRAY, align: "left",
  });
}

function titleSlide(pptx: any, title: string, subtitle: string, projectName: string) {
  const slide = pptx.addSlide();
  slide.background = { color: PETROL };
  // horizontal accent line
  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.5, w: 2.2, h: 0.06, fill: { color: TEAL_L } });
  slide.addText("UST", { x: 0.5, y: 0.4, w: 2, h: 0.5, fontSize: 20, bold: true, color: WHITE });
  slide.addText(title, { x: 0.5, y: 1.3, w: 11.8, h: 1.8, fontSize: 36, bold: true, color: WHITE, align: "left", valign: "middle", fontFace: "Aptos" });
  slide.addText(subtitle, { x: 0.5, y: 3.3, w: 11.8, h: 0.6, fontSize: 16, color: MID_WASH, align: "left", fontFace: "Aptos" });
  slide.addText(projectName, { x: 0.5, y: 4.0, w: 11.8, h: 0.4, fontSize: 13, color: TEAL_L, align: "left", fontFace: "Aptos" });
  slide.addText(FOOTER_TEXT, { x: 0.5, y: 6.9, w: 12.2, h: 0.3, fontSize: 7, color: DARK_GRAY });
}

function contentSlide(pptx: any, title: string, projectName: string, pageNum: number): any {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  // Teal header bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.72, fill: { color: TEAL } });
  slide.addText(title, { x: 0.3, y: 0, w: 12.73, h: 0.72, fontSize: 18, bold: true, color: WHITE, valign: "middle", fontFace: "Aptos" });
  addFooter(slide, projectName, pageNum);
  return slide;
}

function sectionDivider(pptx: any, title: string, projectName: string) {
  const slide = pptx.addSlide();
  slide.background = { color: PETROL };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.4, w: 13.33, h: 0.06, fill: { color: TEAL_L, transparency: 40 } });
  slide.addText(title, { x: 0.5, y: 2.4, w: 12.33, h: 1.2, fontSize: 28, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  slide.addText(projectName, { x: 0.5, y: 6.9, w: 12.33, h: 0.3, fontSize: 7, color: DARK_GRAY });
}

function bulletSlide(pptx: any, title: string, bullets: string[], projectName: string, pageNum: number) {
  const slide = contentSlide(pptx, title, projectName, pageNum);
  const items = bullets.slice(0, 10).map((b) => ({
    text: b,
    options: { bullet: { code: "2022" }, fontSize: 13, color: SOFT_BLACK, paraSpaceAfter: 8, fontFace: "Aptos" },
  }));
  slide.addText(items, { x: 0.4, y: 0.85, w: 12.5, h: 5.8 });
}

function tableSlide(pptx: any, title: string, headers: string[], rows: string[][], projectName: string, pageNum: number) {
  const slide = contentSlide(pptx, title, projectName, pageNum);
  const tableRows = [
    headers.map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: PETROL }, fontSize: 9, fontFace: "Aptos" } })),
    ...rows.slice(0, 12).map((r, ri) =>
      r.map((cell) => ({
        text: cell,
        options: { fontSize: 8.5, color: SOFT_BLACK, fill: { color: ri % 2 === 0 ? WHITE : WASH }, fontFace: "Aptos" },
      }))
    ),
  ];
  slide.addTable(tableRows, { x: 0.3, y: 0.85, w: 12.73, colW: headers.map(() => 12.73 / headers.length), border: { color: MID_WASH } });
}

function kpiStrip(pptx: any, slide: any, kpis: { label: string; value: string; sub?: string; dark?: boolean }[], y = 1.0) {
  const w = 12.73 / kpis.length;
  kpis.forEach((k, i) => {
    const x = 0.3 + i * w;
    const bg = k.dark ? PETROL : WASH;
    const valColor = k.dark ? WHITE : TEAL;
    const lblColor = k.dark ? MID_WASH : DARK_GRAY;
    slide.addShape(pptx.ShapeType.rect, { x, y, w: w - 0.15, h: 1.5, fill: { color: bg }, line: { color: MID_WASH, width: 0.75 } });
    slide.addText(k.value, { x, y: y + 0.1, w: w - 0.15, h: 0.8, fontSize: 26, bold: true, color: valColor, align: "center", fontFace: "Aptos" });
    slide.addText(k.label, { x, y: y + 0.9, w: w - 0.15, h: 0.3, fontSize: 9, color: lblColor, align: "center", fontFace: "Aptos" });
    if (k.sub) slide.addText(k.sub, { x, y: y + 1.2, w: w - 0.15, h: 0.25, fontSize: 8, color: lblColor, align: "center", italic: true, fontFace: "Aptos" });
  });
}

// ── PMI STATUS REPORT (pmi-status) ───────────────────────────────────────────
// Enhanced: Cover (split-panel + RAG panel), Exec Summary (4-card RAG + KPI strip),
// Milestone Tracker (color-coded table), Schedule & Budget + EVM panel,
// Accomplishments & Next Steps, Issues & Risks (left list + right cards), Decisions

function statusChip(slide: any, x: number, y: number, w: number, h: number, status: string) {
  const v = (status ?? "").toLowerCase();
  const color = v.includes("complete") || v.includes("on track") || v.includes("green") ? GREEN
    : v.includes("progress") || v.includes("amber") || v.includes("risk") ? "FFC000"
    : v.includes("red") || v.includes("delay") || v.includes("critical") ? RED : DARK_GRAY;
  slide.addShape("roundRect", { x, y, w, h, fill: { color }, rectRadius: 0.08, line: { color, width: 0 } });
  slide.addText(status.slice(0, 18), { x, y, w, h, fontSize: 7.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
}

function buildStatusReport(pptx: any, content: any, projectName: string) {
  let page = 1;
  const period = safeStr(content.reportingPeriod ?? content.period ?? "");
  const overallRag = (content.overallStatus ?? content.ragStatus ?? "green").toLowerCase();

  // ── Slide 1: Cover — split-panel with RAG panel on right ──
  const cov = pptx.addSlide();
  // Left panel: dark petrol
  cov.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 7.8, h: 7.5, fill: { color: PETROL } });
  // Right panel: teal accent
  cov.addShape(pptx.ShapeType.rect, { x: 7.8, y: 0, w: 5.53, h: 7.5, fill: { color: TEAL } });
  // Left content
  cov.addText("UST", { x: 0.55, y: 0.45, w: 2, h: 0.45, fontSize: 18, bold: true, color: TEAL_L, fontFace: "Aptos" });
  cov.addText(projectName, { x: 0.55, y: 1.1, w: 7.0, h: 1.6, fontSize: 32, bold: true, color: WHITE, align: "left", wrap: true, fontFace: "Aptos" });
  cov.addShape(pptx.ShapeType.rect, { x: 0.55, y: 2.85, w: 2.4, h: 0.06, fill: { color: TEAL_L } });
  cov.addText("Weekly Status Report", { x: 0.55, y: 3.05, w: 7.0, h: 0.5, fontSize: 16, color: MID_WASH, fontFace: "Aptos" });
  cov.addText(period, { x: 0.55, y: 3.65, w: 7.0, h: 0.45, fontSize: 13, color: TEAL_L, fontFace: "Aptos" });
  cov.addText("UST Project Management Office", { x: 0.55, y: 4.3, w: 7.0, h: 0.35, fontSize: 10, color: DARK_GRAY, fontFace: "Aptos" });
  cov.addText(FOOTER_TEXT, { x: 0.4, y: 6.95, w: 7.2, h: 0.3, fontSize: 7, color: DARK_GRAY, fontFace: "Aptos" });
  // Right panel: RAG summary
  cov.addText("Overall Status", { x: 7.95, y: 0.6, w: 5.1, h: 0.4, fontSize: 11, bold: true, color: WHITE, align: "center", fontFace: "Aptos" });
  const ragColor = ragFill(overallRag);
  cov.addShape(pptx.ShapeType.ellipse, { x: 9.15, y: 1.1, w: 2.7, h: 2.7, fill: { color: ragColor } });
  cov.addText(ragLabel(overallRag), { x: 9.15, y: 1.1, w: 2.7, h: 2.7, fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  // 4 dimension dots
  const dims4 = [
    { label: "Schedule", key: "scheduleRag" }, { label: "Cost", key: "costRag" },
    { label: "Scope", key: "scopeRag" }, { label: "Quality", key: "qualityRag" },
  ];
  dims4.forEach((d, i) => {
    const rx = 8.0 + (i % 2) * 2.65;
    const ry = 4.15 + Math.floor(i / 2) * 1.0;
    cov.addShape(pptx.ShapeType.ellipse, { x: rx, y: ry, w: 0.45, h: 0.45, fill: { color: ragFill(content[d.key] ?? "green") } });
    cov.addText(d.label, { x: rx + 0.52, y: ry, w: 1.9, h: 0.45, fontSize: 10, color: WHITE, valign: "middle", fontFace: "Aptos" });
  });
  cov.addText(`Prepared by: ${safeStr(content.preparedBy ?? "Project Manager")}`, {
    x: 7.95, y: 6.8, w: 5.1, h: 0.4, fontSize: 8.5, color: MID_WASH, align: "center", fontFace: "Aptos",
  });

  // ── Slide 2: Executive Summary — 4-card RAG grid + KPI strip + bullets ──
  const s2 = contentSlide(pptx, "Executive Summary", projectName, page++);
  const ragDims = [
    { label: "Schedule", status: content.scheduleRag ?? content.scheduleStatus ?? "green", reason: safeStr(content.scheduleReason ?? content.scheduleVariance ?? "") },
    { label: "Cost", status: content.costRag ?? content.costStatus ?? "green", reason: safeStr(content.costReason ?? content.costVariance ?? "") },
    { label: "Scope", status: content.scopeRag ?? content.scopeStatus ?? "green", reason: safeStr(content.scopeReason ?? "") },
    { label: "Quality", status: content.qualityRag ?? content.qualityStatus ?? "green", reason: safeStr(content.qualityReason ?? "") },
  ];
  ragDims.forEach((d, i) => {
    const cx = 0.3 + i * 3.2;
    const fc = ragFill(d.status);
    s2.addShape(pptx.ShapeType.rect, { x: cx, y: 0.85, w: 3.0, h: 2.2, fill: { color: WASH }, line: { color: fc, width: 2 } });
    s2.addShape(pptx.ShapeType.rect, { x: cx, y: 0.85, w: 3.0, h: 0.45, fill: { color: fc } });
    s2.addText(d.label, { x: cx, y: 0.85, w: 3.0, h: 0.45, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    s2.addText(ragLabel(d.status), { x: cx, y: 1.35, w: 3.0, h: 0.5, fontSize: 13, bold: true, color: fc, align: "center", fontFace: "Aptos" });
    s2.addText(d.reason.slice(0, 90), { x: cx + 0.1, y: 1.9, w: 2.8, h: 1.1, fontSize: 8.5, color: DARK_GRAY, wrap: true, align: "center", fontFace: "Aptos" });
  });
  // Dark KPI strip
  kpiStrip(pptx, s2, [
    { label: "% Complete", value: safeStr(content.percentComplete ?? "—") + "%", dark: true },
    { label: "SPI", value: safeStr(content.spi ?? "—"), dark: true },
    { label: "CPI", value: safeStr(content.cpi ?? "—"), dark: true },
    { label: "Budget Spent", value: safeStr(content.budgetSpent ?? content.actualCost ?? "—"), dark: true },
  ], 3.25);
  // Summary text
  const summText = safeStr(content.executiveSummary ?? content.summary ?? "");
  if (summText) s2.addText(summText, { x: 0.3, y: 4.9, w: 12.73, h: 0.9, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });

  // ── Slide 3: Milestone Tracker — color-coded status chips ──
  const ms = content.milestoneStatus ?? content.milestones ?? [];
  if (ms.length) {
    const s3 = contentSlide(pptx, "Milestone Tracker", projectName, page++);
    const msHeaders = ["Milestone", "Planned Date", "Forecast Date", "Variance", "Status"];
    const headerRow = msHeaders.map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: PETROL }, fontSize: 9, fontFace: "Aptos" } }));
    const dataRows = ms.slice(0, 10).map((m: any, ri: number) => {
      const status = safeStr(m.status ?? "Planned");
      return [
        { text: safeStr(m.name ?? m.milestone), options: { fontSize: 9, color: SOFT_BLACK, fill: { color: ri % 2 === 0 ? WHITE : WASH }, fontFace: "Aptos" } },
        { text: safeStr(m.plannedDate ?? m.dueDate ?? m.date ?? ""), options: { fontSize: 9, color: SOFT_BLACK, fill: { color: ri % 2 === 0 ? WHITE : WASH }, fontFace: "Aptos" } },
        { text: safeStr(m.forecastDate ?? m.actualDate ?? m.date ?? ""), options: { fontSize: 9, color: SOFT_BLACK, fill: { color: ri % 2 === 0 ? WHITE : WASH }, fontFace: "Aptos" } },
        { text: safeStr(m.variance ?? "—"), options: { fontSize: 9, color: SOFT_BLACK, fill: { color: ri % 2 === 0 ? WHITE : WASH }, fontFace: "Aptos" } },
        { text: status, options: { fontSize: 8, bold: true, color: WHITE, fill: { color: ragFill(status) }, align: "center", fontFace: "Aptos" } },
      ];
    });
    s3.addTable([headerRow, ...dataRows], { x: 0.3, y: 0.85, w: 12.73, colW: [4.5, 2.0, 2.2, 1.53, 2.5], border: { color: MID_WASH } });
  }

  // ── Slide 4: Schedule & Budget Performance + EVM panel ──
  const s4 = contentSlide(pptx, "Schedule & Budget Performance", projectName, page++);
  kpiStrip(pptx, s4, [
    { label: "% Complete", value: safeStr(content.percentComplete ?? "—") + "%" },
    { label: "SPI", value: safeStr(content.spi ?? "—") },
    { label: "CPI", value: safeStr(content.cpi ?? "—") },
    { label: "Budget Spent", value: safeStr(content.budgetSpent ?? content.actualCost ?? "—") },
  ], 0.85);
  // EVM dark panel
  s4.addShape(pptx.ShapeType.rect, { x: 0.3, y: 2.55, w: 12.73, h: 2.3, fill: { color: PETROL } });
  s4.addText("Earned Value Metrics", { x: 0.45, y: 2.65, w: 4, h: 0.35, fontSize: 10, bold: true, color: TEAL_L, fontFace: "Aptos" });
  const evmItems = [
    { label: "PV", val: content.plannedValue ?? content.pv ?? "—" },
    { label: "EV", val: content.earnedValue ?? content.ev ?? "—" },
    { label: "AC", val: content.actualCost ?? content.ac ?? "—" },
    { label: "SV", val: content.scheduleVariance ?? content.sv ?? "—" },
    { label: "CV", val: content.costVariance ?? content.cv ?? "—" },
    { label: "EAC", val: content.eac ?? "—" },
  ];
  evmItems.forEach((e, i) => {
    const ex = 0.5 + i * 2.1;
    s4.addText(e.label, { x: ex, y: 3.05, w: 1.9, h: 0.3, fontSize: 9, bold: true, color: TEAL_L, align: "center", fontFace: "Aptos" });
    s4.addText(safeStr(e.val), { x: ex, y: 3.38, w: 1.9, h: 0.5, fontSize: 16, bold: true, color: WHITE, align: "center", fontFace: "Aptos" });
    s4.addShape(pptx.ShapeType.rect, { x: ex + 0.85, y: 3.1, w: 0.04, h: 1.1, fill: { color: TEAL_L, transparency: 60 } });
  });
  const finNote = safeStr(content.financialStatus ?? content.budgetNarrative ?? "");
  if (finNote) s4.addText(finNote, { x: 0.3, y: 5.0, w: 12.73, h: 0.8, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });

  // ── Slide 5: Accomplishments & Next Steps ──
  const s5 = contentSlide(pptx, "Accomplishments & Next Steps", projectName, page++);
  const accItems = (content.accomplishments ?? []).slice(0, 7);
  const planItems = (content.nextWeekPlan ?? content.plannedActivities ?? []).slice(0, 7);
  s5.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.85, w: 5.9, h: 0.38, fill: { color: GREEN } });
  s5.addText("Completed This Period", { x: 0.3, y: 0.85, w: 5.9, h: 0.38, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  accItems.forEach((a: unknown, i: number) => {
    s5.addText(`✓`, { x: 0.35, y: 1.35 + i * 0.68, w: 0.35, h: 0.55, fontSize: 12, bold: true, color: GREEN, valign: "middle", fontFace: "Aptos" });
    s5.addText(safeStr(a), { x: 0.75, y: 1.35 + i * 0.68, w: 5.3, h: 0.6, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
  });
  s5.addShape(pptx.ShapeType.rect, { x: 6.9, y: 0.85, w: 6.1, h: 0.38, fill: { color: TEAL } });
  s5.addText("Planned Next Period", { x: 6.9, y: 0.85, w: 6.1, h: 0.38, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  planItems.forEach((a: unknown, i: number) => {
    s5.addText(`→`, { x: 6.95, y: 1.35 + i * 0.68, w: 0.35, h: 0.55, fontSize: 12, bold: true, color: TEAL, valign: "middle", fontFace: "Aptos" });
    s5.addText(safeStr(a), { x: 7.35, y: 1.35 + i * 0.68, w: 5.6, h: 0.6, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
  });

  // ── Slide 6: Issues & Risks ──
  const issues = content.issues ?? [];
  const risks = content.risks ?? content.topRisks ?? [];
  const s6 = contentSlide(pptx, "Issues & Risks", projectName, page++);
  // Left: issues with severity badge
  s6.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.85, w: 6.1, h: 0.38, fill: { color: PETROL } });
  s6.addText("Active Issues", { x: 0.3, y: 0.85, w: 6.1, h: 0.38, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  issues.slice(0, 5).forEach((iss: any, i: number) => {
    const sev = safeStr(iss.severity ?? iss.priority ?? "Medium");
    const sevColor = sev.toLowerCase().includes("high") || sev.toLowerCase().includes("critical") ? RED : sev.toLowerCase().includes("medium") ? "FFC000" : GREEN;
    s6.addShape(pptx.ShapeType.roundRect, { x: 0.3, y: 1.32 + i * 1.0, w: 6.1, h: 0.85, fill: { color: WASH }, line: { color: sevColor, width: 1.5 }, rectRadius: 0.06 });
    s6.addShape(pptx.ShapeType.rect, { x: 0.3, y: 1.32 + i * 1.0, w: 0.9, h: 0.85, fill: { color: sevColor } });
    s6.addText(sev.slice(0, 7), { x: 0.3, y: 1.32 + i * 1.0, w: 0.9, h: 0.85, fontSize: 7, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    s6.addText(safeStr(iss.description ?? iss.issue ?? iss).slice(0, 80), { x: 1.28, y: 1.37 + i * 1.0, w: 3.5, h: 0.75, fontSize: 9, color: SOFT_BLACK, wrap: true, valign: "middle", fontFace: "Aptos" });
    s6.addText(`Owner: ${safeStr(iss.owner ?? "—")}`, { x: 4.8, y: 1.37 + i * 1.0, w: 1.5, h: 0.4, fontSize: 8, color: DARK_GRAY, fontFace: "Aptos" });
    s6.addText(safeStr(iss.dueDate ?? ""), { x: 4.8, y: 1.72 + i * 1.0, w: 1.5, h: 0.3, fontSize: 8, color: DARK_GRAY, fontFace: "Aptos" });
  });
  // Right: risk cards with P/I pills
  s6.addShape(pptx.ShapeType.rect, { x: 6.9, y: 0.85, w: 6.1, h: 0.38, fill: { color: PETROL } });
  s6.addText("Top Risks", { x: 6.9, y: 0.85, w: 6.1, h: 0.38, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  risks.slice(0, 5).forEach((r: any, i: number) => {
    const rText = typeof r === "string" ? r : safeStr(r.description ?? r.statement ?? r);
    const level = safeStr(r.severity ?? r.level ?? "Medium");
    const lvlColor = level.toLowerCase().includes("critical") ? RED : level.toLowerCase().includes("high") ? "FFC000" : TEAL_L;
    const prob = safeStr(r.probability ?? "—");
    const impact = safeStr(r.impact ?? "—");
    s6.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 1.32 + i * 1.0, w: 6.1, h: 0.85, fill: { color: WASH }, line: { color: lvlColor, width: 1.5 }, rectRadius: 0.06 });
    s6.addText(rText.slice(0, 100), { x: 7.0, y: 1.37 + i * 1.0, w: 4.0, h: 0.75, fontSize: 9, color: SOFT_BLACK, wrap: true, valign: "middle", fontFace: "Aptos" });
    s6.addShape(pptx.ShapeType.roundRect, { x: 11.1, y: 1.38 + i * 1.0, w: 0.7, h: 0.32, fill: { color: TEAL_L }, rectRadius: 0.06 });
    s6.addText(`P:${prob}`, { x: 11.1, y: 1.38 + i * 1.0, w: 0.7, h: 0.32, fontSize: 7.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    s6.addShape(pptx.ShapeType.roundRect, { x: 11.1, y: 1.74 + i * 1.0, w: 0.7, h: 0.32, fill: { color: lvlColor }, rectRadius: 0.06 });
    s6.addText(`I:${impact}`, { x: 11.1, y: 1.74 + i * 1.0, w: 0.7, h: 0.32, fontSize: 7.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  });

  // ── Slide 7: Decisions Required ──
  const decisions = content.decisions ?? content.decisionsRequired ?? [];
  const s7 = contentSlide(pptx, "Decisions Required", projectName, page++);
  if (!decisions.length) {
    s7.addText("No decisions required this period.", { x: 0.3, y: 2.5, w: 12.73, h: 0.6, fontSize: 14, color: DARK_GRAY, align: "center", italic: true, fontFace: "Aptos" });
  } else {
    decisions.slice(0, 5).forEach((d: any, i: number) => {
      const text = typeof d === "string" ? d : safeStr(d.decision ?? d.description ?? d);
      const deadline = typeof d === "object" ? safeStr(d.deadline ?? d.dueDate ?? "") : "";
      const owner = typeof d === "object" ? safeStr(d.owner ?? "") : "";
      s7.addShape(pptx.ShapeType.roundRect, { x: 0.3, y: 0.9 + i * 1.1, w: 12.73, h: 0.95, fill: { color: WASH }, line: { color: MID_WASH, width: 0.75 }, rectRadius: 0.08 });
      s7.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.9 + i * 1.1, w: 0.5, h: 0.95, fill: { color: TEAL } });
      s7.addText(String(i + 1), { x: 0.3, y: 0.9 + i * 1.1, w: 0.5, h: 0.95, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
      s7.addText(text.slice(0, 140), { x: 0.9, y: 0.95 + i * 1.1, w: 9.4, h: 0.8, fontSize: 11, color: SOFT_BLACK, wrap: true, valign: "middle", fontFace: "Aptos" });
      if (deadline) s7.addText(`Due: ${deadline}`, { x: 10.4, y: 0.95 + i * 1.1, w: 2.4, h: 0.35, fontSize: 8.5, color: DARK_GRAY, align: "right", fontFace: "Aptos" });
      if (owner) s7.addText(`Owner: ${owner}`, { x: 10.4, y: 1.3 + i * 1.1, w: 2.4, h: 0.3, fontSize: 8.5, color: DARK_GRAY, align: "right", fontFace: "Aptos" });
    });
  }
}

// ── PMI CHARTER DECK (pmi-charter) ────────────────────────────────────────────
// Enhanced: split-panel cover, icon-column exec summary, visual scope,
// phase-band milestone timeline, stakeholder 2×2 matrix, risk cards + heat map

const PHASE_COLORS = ["006E74", "881E87", "185FA5", "B07C10", "3B6D11"];

function buildCharter(pptx: any, content: any, projectName: string) {
  let page = 1;
  const title = content.projectTitle ?? projectName;

  // ── Slide 1: Cover — split-panel ──
  const cov = pptx.addSlide();
  // Left panel: petrol dark
  cov.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 7.5, h: 7.5, fill: { color: PETROL } });
  // Right panel: geometric network in TEAL bg
  cov.addShape(pptx.ShapeType.rect, { x: 7.5, y: 0, w: 5.83, h: 7.5, fill: { color: TEAL } });
  // Network node graphic (right panel) — thin rect lines + circles (no rotate, no transparency)
  const nodes = [
    [9.5, 1.8], [11.5, 1.2], [12.8, 2.6], [10.8, 3.4], [12.2, 4.5], [9.2, 4.2], [11.0, 5.5],
  ];
  const edges = [[0,1],[0,3],[1,2],[2,3],[3,4],[3,5],[4,6],[5,6]];
  edges.forEach(([a, b]) => {
    const [x1, y1] = nodes[a]; const [x2, y2] = nodes[b];
    // Normalize to positive dimensions
    const lx = Math.min(x1, x2); const ly = Math.min(y1, y2);
    const lw = Math.max(Math.abs(x2 - x1), 0.04); const lh = Math.max(Math.abs(y2 - y1), 0.04);
    cov.addShape(pptx.ShapeType.rect, { x: lx, y: ly, w: lw, h: lh, fill: { color: "A8D8E0" }, line: { color: "A8D8E0", width: 0 } });
  });
  nodes.forEach(([nx, ny], ni) => {
    const r = ni === 3 ? 0.38 : 0.22;
    cov.addShape(pptx.ShapeType.ellipse, { x: nx - r, y: ny - r, w: r * 2, h: r * 2, fill: { color: ni === 3 ? WHITE : "5DC5D0" } });
  });
  // Stats panel (right, lower)
  cov.addShape(pptx.ShapeType.rect, { x: 7.65, y: 5.2, w: 5.5, h: 2.1, fill: { color: "004F5E" } });
  const stats = [
    { label: "Budget", value: safeStr(content.budget?.total ?? content.budget ?? "TBD") },
    { label: "Duration", value: safeStr(content.milestones?.[content.milestones?.length - 1]?.targetDate ?? "TBD") },
    { label: "Stakeholders", value: String(content.stakeholders?.length ?? "—") },
  ];
  stats.forEach((s, i) => {
    const sx = 7.85 + i * 1.83;
    cov.addText(s.value, { x: sx, y: 5.4, w: 1.7, h: 0.55, fontSize: 22, bold: true, color: WHITE, align: "center", fontFace: "Aptos" });
    cov.addText(s.label, { x: sx, y: 5.95, w: 1.7, h: 0.3, fontSize: 9, color: TEAL_L, align: "center", fontFace: "Aptos" });
  });
  // Left text
  cov.addText("UST", { x: 0.55, y: 0.45, w: 2, h: 0.45, fontSize: 18, bold: true, color: TEAL_L, fontFace: "Aptos" });
  cov.addText(title, { x: 0.55, y: 1.1, w: 6.7, h: 2.0, fontSize: 32, bold: true, color: WHITE, align: "left", wrap: true, fontFace: "Aptos" });
  cov.addShape(pptx.ShapeType.rect, { x: 0.55, y: 3.25, w: 2.4, h: 0.06, fill: { color: TEAL_L } });
  cov.addText(`Project Charter  v${safeStr(content.version ?? "1.0")}`, { x: 0.55, y: 3.4, w: 6.7, h: 0.45, fontSize: 16, color: MID_WASH, fontFace: "Aptos" });
  cov.addText(safeStr(content.date ?? ""), { x: 0.55, y: 3.95, w: 6.7, h: 0.4, fontSize: 10, color: TEAL_L, fontFace: "Aptos" });
  cov.addText("UST Project Management Office", { x: 0.55, y: 4.45, w: 6.7, h: 0.35, fontSize: 10, color: DARK_GRAY, fontFace: "Aptos" });
  const sponsor = safeStr(content.sponsor ?? content.projectSponsor ?? "");
  if (sponsor) cov.addText(`Sponsor: ${sponsor}`, { x: 0.55, y: 5.05, w: 6.7, h: 0.3, fontSize: 9.5, color: DARK_GRAY, fontFace: "Aptos" });
  cov.addText(FOOTER_TEXT, { x: 0.4, y: 6.95, w: 7.0, h: 0.3, fontSize: 7, color: DARK_GRAY, fontFace: "Aptos" });

  // ── Slide 2: Executive Summary — 3 icon columns + dark KPI strip ──
  const s2 = contentSlide(pptx, "Executive Summary", projectName, page++);
  const cols3 = [
    { label: "Business Problem", icon: "◈", color: RED, text: safeStr(content.businessCase ?? content.projectDescription ?? "") },
    { label: "Solution Approach", icon: "◉", color: TEAL, text: (content.objectives ?? []).slice(0, 3).map(safeStr).join("\n• ") },
    { label: "Expected Outcome", icon: "◎", color: GREEN, text: (content.successCriteria ?? []).slice(0, 3).map((c: any) => safeStr(c?.criterion ?? c)).join("\n• ") },
  ];
  cols3.forEach((col, i) => {
    const x = 0.3 + i * 4.28;
    s2.addShape(pptx.ShapeType.rect, { x, y: 0.85, w: 4.1, h: 3.8, fill: { color: WASH }, line: { color: MID_WASH, width: 0.75 } });
    // Icon circle
    s2.addShape(pptx.ShapeType.ellipse, { x: x + 1.55, y: 0.75, w: 1.0, h: 1.0, fill: { color: col.color } });
    s2.addText(col.icon, { x: x + 1.55, y: 0.75, w: 1.0, h: 1.0, fontSize: 22, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    s2.addText(col.label, { x, y: 1.85, w: 4.1, h: 0.38, fontSize: 10, bold: true, color: col.color, align: "center", fontFace: "Aptos" });
    s2.addText(col.text.slice(0, 250), { x: x + 0.12, y: 2.3, w: 3.86, h: 2.25, fontSize: 10, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
  });
  // Dark KPI strip
  kpiStrip(pptx, s2, [
    { label: "Total Budget", value: safeStr(content.budget?.total ?? content.budget ?? "TBD"), dark: true },
    { label: "End Date", value: safeStr(content.milestones?.[content.milestones?.length - 1]?.targetDate ?? "TBD"), dark: true },
    { label: "Stakeholders", value: String(content.stakeholders?.length ?? "—"), dark: true },
    { label: "Objectives", value: String(content.objectives?.length ?? "—"), dark: true },
  ], 5.0);

  // ── Slide 3: Project Scope — visual two-column with dot indicators ──
  const s3 = contentSlide(pptx, "Project Scope", projectName, page++);
  const inScope = content.scope?.inScope ?? content.inScope ?? [];
  const outScope = content.scope?.outOfScope ?? content.outOfScope ?? [];
  // In-scope panel
  s3.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.85, w: 6.1, h: 5.9, fill: { color: "E6F9F3" }, line: { color: GREEN, width: 1.5 } });
  s3.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.85, w: 6.1, h: 0.5, fill: { color: GREEN } });
  s3.addText("✓  IN SCOPE", { x: 0.3, y: 0.85, w: 6.1, h: 0.5, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  inScope.slice(0, 8).forEach((s: unknown, i: number) => {
    s3.addShape(pptx.ShapeType.ellipse, { x: 0.48, y: 1.55 + i * 0.6, w: 0.22, h: 0.22, fill: { color: GREEN } });
    s3.addText(safeStr(s), { x: 0.78, y: 1.48 + i * 0.6, w: 5.4, h: 0.5, fontSize: 10, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
  });
  // Out-of-scope panel
  s3.addShape(pptx.ShapeType.rect, { x: 6.93, y: 0.85, w: 6.1, h: 5.9, fill: { color: "FFF0EE" }, line: { color: RED, width: 1.5 } });
  s3.addShape(pptx.ShapeType.rect, { x: 6.93, y: 0.85, w: 6.1, h: 0.5, fill: { color: RED } });
  s3.addText("✗  OUT OF SCOPE", { x: 6.93, y: 0.85, w: 6.1, h: 0.5, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  outScope.slice(0, 8).forEach((s: unknown, i: number) => {
    s3.addShape(pptx.ShapeType.ellipse, { x: 7.11, y: 1.55 + i * 0.6, w: 0.22, h: 0.22, fill: { color: RED } });
    s3.addText(safeStr(s), { x: 7.41, y: 1.48 + i * 0.6, w: 5.4, h: 0.5, fontSize: 10, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
  });

  // ── Slide 4: Objectives — card grid ──
  const s4 = contentSlide(pptx, "Objectives & Success Criteria", projectName, page++);
  const objs = content.objectives ?? [];
  objs.slice(0, 6).forEach((obj: unknown, i: number) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const x = 0.3 + col * 4.28; const y = 0.9 + row * 2.8;
    const col_color = PHASE_COLORS[i % PHASE_COLORS.length];
    s4.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.1, h: 2.5, fill: { color: WASH }, line: { color: col_color, width: 1.5 }, rectRadius: 0.1 });
    s4.addShape(pptx.ShapeType.rect, { x, y, w: 4.1, h: 0.42, fill: { color: col_color } });
    s4.addText(`Objective ${i + 1}`, { x, y, w: 4.1, h: 0.42, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    s4.addText(safeStr(obj).slice(0, 200), { x: x + 0.1, y: y + 0.5, w: 3.9, h: 1.9, fontSize: 10, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
  });

  // ── Slide 5: Milestones — phase-band + horizontal timeline ──
  const milestones = content.milestones ?? [];
  if (milestones.length) {
    const s5 = contentSlide(pptx, "Key Milestones & Timeline", projectName, page++);
    // Phase band
    const phases = ["Initiation", "Planning", "Execution", "Monitoring", "Closure"];
    const pbw = 12.73 / phases.length;
    phases.forEach((ph, pi) => {
      s5.addShape(pptx.ShapeType.rect, { x: 0.3 + pi * pbw, y: 0.85, w: pbw - 0.05, h: 0.38, fill: { color: PHASE_COLORS[pi % PHASE_COLORS.length] } });
      s5.addText(ph, { x: 0.3 + pi * pbw, y: 0.85, w: pbw - 0.05, h: 0.38, fontSize: 8.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    });
    // Timeline spine
    s5.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.7, w: 12.33, h: 0.1, fill: { color: TEAL_L } });
    const msSlice = milestones.slice(0, 6);
    const step = 12.33 / Math.max(msSlice.length - 1, 1);
    msSlice.forEach((m: any, i: number) => {
      const mx = 0.5 + i * step;
      const above = i % 2 === 0;
      // Circle node (diamond replaced — rotate not supported in addShape)
      s5.addShape(pptx.ShapeType.ellipse, { x: mx - 0.18, y: 3.61, w: 0.36, h: 0.36, fill: { color: TEAL } });
      // Name label
      s5.addText(safeStr(m.name ?? m.milestone).slice(0, 28), {
        x: mx - 1.2, y: above ? 2.1 : 4.1, w: 2.4, h: 0.7,
        fontSize: 8.5, color: SOFT_BLACK, align: "center", wrap: true, fontFace: "Aptos",
      });
      // Connector stub (thin rect instead of line shape)
      const stubH = above ? 0.82 : 0.35;
      s5.addShape(pptx.ShapeType.rect, {
        x: mx - 0.02, y: above ? 2.82 : 3.76, w: 0.04, h: stubH,
        fill: { color: TEAL_L }, line: { color: TEAL_L, width: 0 },
      });
      // Date
      s5.addText(safeStr(m.targetDate ?? m.date ?? ""), {
        x: mx - 1.2, y: above ? 2.85 : 4.85, w: 2.4, h: 0.3,
        fontSize: 8, color: TEAL_L, align: "center", fontFace: "Aptos",
      });
    });
  }

  // ── Slide 6: Stakeholder 2×2 matrix + table ──
  const stk = content.stakeholders ?? [];
  if (stk.length) {
    const s6 = contentSlide(pptx, "Stakeholder Overview", projectName, page++);
    // 2×2 matrix
    s6.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.88, w: 5.5, h: 5.8, fill: { color: WASH }, line: { color: MID_WASH, width: 0.75 } });
    // Quadrant fills
    const qColors = ["E6F9F3", "E6F0FB", "FFF8E1", "FFF0EE"];
    const qLabels = ["MANAGE CLOSELY", "KEEP INFORMED", "KEEP SATISFIED", "MONITOR"];
    [[0.3, 0.88], [2.95, 0.88], [0.3, 3.57], [2.95, 3.57]].forEach(([qx, qy], qi) => {
      s6.addShape(pptx.ShapeType.rect, { x: qx, y: qy, w: 2.6, h: 2.64, fill: { color: qColors[qi] }, line: { color: MID_WASH, width: 0.5 } });
      s6.addText(qLabels[qi], { x: qx, y: qy, w: 2.6, h: 0.3, fontSize: 8, bold: true, color: DARK_GRAY, align: "center", valign: "middle", fontFace: "Aptos" });
    });
    // Axis labels
    s6.addText("↑ Power", { x: 0.3, y: 2.1, w: 0.5, h: 0.4, fontSize: 8, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
    s6.addText("Power / Influence →", { x: 0.3, y: 6.5, w: 5.5, h: 0.3, fontSize: 7, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
    // Stakeholder dots
    stk.slice(0, 10).forEach((sh: any, si: number) => {
      const power = (sh.power ?? "").toLowerCase();
      const interest = (sh.interest ?? "").toLowerCase();
      const qx = interest.includes("high") ? 3.1 : 0.55;
      const qy = power.includes("high") ? 1.1 : 3.8;
      const dotX = qx + (si % 3) * 0.5;
      const dotY = qy + Math.floor(si / 3) * 0.35;
      const dotColor = PHASE_COLORS[si % PHASE_COLORS.length];
      s6.addShape(pptx.ShapeType.ellipse, { x: dotX, y: dotY, w: 0.38, h: 0.38, fill: { color: dotColor } });
      s6.addText(safeStr(sh.name ?? "").split(" ").map((w: string) => w[0]).join("").slice(0, 2), {
        x: dotX, y: dotY, w: 0.38, h: 0.38, fontSize: 9, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos",
      });
    });
    // Stakeholder table (right side)
    const tHeaders = ["Name", "Role", "Influence", "Interest", "Engagement"];
    const tRows = stk.slice(0, 8).map((sh: any, ri: number) => tHeaders.map((_, ci) => ({
      text: safeStr([sh.name, sh.role ?? sh.title, sh.power, sh.interest, sh.currentEngagement ?? sh.engagementLevel ?? "—"][ci] ?? ""),
      options: { fontSize: 9, color: SOFT_BLACK, fill: { color: ri % 2 === 0 ? WHITE : WASH }, fontFace: "Aptos" },
    })));
    const tHeader = tHeaders.map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: PETROL }, fontSize: 9, fontFace: "Aptos" } }));
    s6.addTable([tHeader, ...tRows], { x: 6.1, y: 0.88, w: 6.93, colW: [1.8, 1.8, 1.0, 1.0, 1.33], border: { color: MID_WASH } });
  }

  // ── Slide 7: Risks — severity-banded cards + 5×5 heat map ──
  const risks = content.risks ?? [];
  const s7 = contentSlide(pptx, "Top Risks at Initiation", projectName, page++);
  // Risk cards (left)
  risks.slice(0, 4).forEach((r: any, i: number) => {
    const rText = typeof r === "string" ? r : safeStr(r.statement ?? r.description ?? r);
    const level = typeof r === "string" ? "Medium" : safeStr(r.severity ?? r.level ?? "Medium");
    const lvlColor = level.toLowerCase().includes("critical") ? RED : level.toLowerCase().includes("high") ? "FFC000" : TEAL_L;
    s7.addShape(pptx.ShapeType.roundRect, { x: 0.3, y: 0.88 + i * 1.45, w: 7.5, h: 1.3, fill: { color: WASH }, line: { color: lvlColor, width: 2 }, rectRadius: 0.08 });
    s7.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.88 + i * 1.45, w: 1.1, h: 1.3, fill: { color: lvlColor } });
    s7.addText(level.slice(0, 8).toUpperCase(), { x: 0.3, y: 0.88 + i * 1.45, w: 1.1, h: 1.3, fontSize: 7.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    s7.addText(rText.slice(0, 130), { x: 1.5, y: 0.93 + i * 1.45, w: 5.6, h: 0.9, fontSize: 10, color: SOFT_BLACK, wrap: true, valign: "middle", fontFace: "Aptos" });
    const prob = typeof r === "object" ? safeStr(r.probability ?? "") : "";
    const imp = typeof r === "object" ? safeStr(r.impact ?? "") : "";
    // P/I pills: shape + text separately (fill on addText is not valid in PptxGenJS)
    if (prob) {
      s7.addShape(pptx.ShapeType.roundRect, { x: 7.05, y: 0.93 + i * 1.45, w: 0.7, h: 0.32, fill: { color: TEAL_L }, rectRadius: 0.05 });
      s7.addText(`P:${prob}`, { x: 7.05, y: 0.93 + i * 1.45, w: 0.7, h: 0.32, fontSize: 7.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    }
    if (imp) {
      s7.addShape(pptx.ShapeType.roundRect, { x: 7.05, y: 1.29 + i * 1.45, w: 0.7, h: 0.32, fill: { color: lvlColor }, rectRadius: 0.05 });
      s7.addText(`I:${imp}`, { x: 7.05, y: 1.29 + i * 1.45, w: 0.7, h: 0.32, fontSize: 7.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    }
  });
  // 5×5 heat map (right)
  const heatColors: Record<number, string> = { 1: "92D050", 2: "FFFF00", 3: "FFC000", 4: RED };
  const hmX = 8.3; const hmY = 0.88; const cellW = 0.85; const cellH = 1.0;
  s7.addText("Probability × Impact", { x: hmX, y: hmY - 0.3, w: 4.75, h: 0.28, fontSize: 8, bold: true, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
  for (let p = 5; p >= 1; p--) {
    for (let im = 1; im <= 5; im++) {
      const score = p * im;
      const hColor = score >= 15 ? heatColors[4] : score >= 10 ? heatColors[3] : score >= 5 ? heatColors[2] : heatColors[1];
      const cx = hmX + (im - 1) * cellW; const cy = hmY + (5 - p) * cellH;
      s7.addShape(pptx.ShapeType.rect, { x: cx, y: cy, w: cellW - 0.04, h: cellH - 0.04, fill: { color: hColor }, line: { color: WHITE, width: 0.5 } });
      // Plot risks on the map
      risks.slice(0, 4).forEach((r: any, ri: number) => {
        if (typeof r === "object") {
          const rp = parseInt(r.probability ?? "0");
          const ri2 = parseInt(r.impact ?? "0");
          if (rp === p && ri2 === im) {
            s7.addShape(pptx.ShapeType.ellipse, { x: cx + 0.2, y: cy + 0.3, w: 0.4, h: 0.4, fill: { color: PETROL } });
            s7.addText(String(ri + 1), { x: cx + 0.2, y: cy + 0.3, w: 0.4, h: 0.4, fontSize: 8, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
          }
        }
      });
    }
  }
  // Axis labels
  s7.addText("P→", { x: hmX + 2.1, y: hmY + 5.1, w: 0.5, h: 0.25, fontSize: 7, color: DARK_GRAY, fontFace: "Aptos" });
  for (let v = 1; v <= 5; v++) {
    s7.addText(String(v), { x: hmX + (v - 1) * cellW + 0.3, y: hmY + 5.1, w: 0.25, h: 0.25, fontSize: 7, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
  }

  // ── Slide 8: Budget & Resources ──
  const s8 = contentSlide(pptx, "Budget & Resources", projectName, page++);
  const budget = content.budget ?? {};
  kpiStrip(pptx, s8, [
    { label: "Total Budget", value: safeStr(budget.total ?? "TBD"), sub: safeStr(budget.currency ?? ""), dark: true },
    { label: "Contingency Reserve", value: safeStr(budget.contingencyReserve ?? "TBD"), dark: true },
    { label: "Funding Source", value: safeStr(budget.fundingSource ?? "TBD"), dark: true },
  ], 0.9);
  const assumptions = content.assumptions ?? [];
  const constraints = content.constraints ?? [];
  if (assumptions.length) {
    s8.addText("Key Assumptions", { x: 0.3, y: 2.7, w: 6.1, h: 0.35, fontSize: 10, bold: true, color: TEAL, fontFace: "Aptos" });
    assumptions.slice(0, 4).forEach((a: unknown, i: number) => {
      s8.addShape(pptx.ShapeType.ellipse, { x: 0.38, y: 3.18 + i * 0.55, w: 0.2, h: 0.2, fill: { color: TEAL } });
      s8.addText(safeStr(a), { x: 0.68, y: 3.1 + i * 0.55, w: 5.7, h: 0.48, fontSize: 10, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
  }
  if (constraints.length) {
    s8.addText("Constraints", { x: 6.9, y: 2.7, w: 6.1, h: 0.35, fontSize: 10, bold: true, color: RED, fontFace: "Aptos" });
    constraints.slice(0, 4).forEach((c: unknown, i: number) => {
      s8.addShape(pptx.ShapeType.rect, { x: 6.98, y: 3.18 + i * 0.55, w: 0.2, h: 0.2, fill: { color: RED } });
      s8.addText(safeStr(c), { x: 7.28, y: 3.1 + i * 0.55, w: 5.7, h: 0.48, fontSize: 10, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
  }

  // ── Slide 9: Authorization & Sign-off ──
  const sigs = content.approvalSignatures ?? [{ role: "Project Sponsor" }, { role: "Project Manager" }, { role: "Steering Committee" }];
  const s9 = contentSlide(pptx, "Authorization & Sign-off", projectName, page++);
  s9.addText("By signing this document, the signatories authorize the project to proceed and commit the resources described herein.", {
    x: 0.3, y: 0.85, w: 12.73, h: 0.6, fontSize: 11, color: DARK_GRAY, wrap: true, fontFace: "Aptos",
  });
  sigs.slice(0, 4).forEach((sig: any, i: number) => {
    const x = 0.3 + i * 3.2;
    s9.addShape(pptx.ShapeType.rect, { x, y: 1.9, w: 2.9, h: 0.04, fill: { color: SOFT_BLACK } });
    s9.addText(safeStr(sig.name ?? ""), { x, y: 2.0, w: 2.9, h: 0.35, fontSize: 10, color: SOFT_BLACK, align: "center", fontFace: "Aptos" });
    s9.addText(safeStr(sig.role ?? ""), { x, y: 2.4, w: 2.9, h: 0.35, fontSize: 9, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
    s9.addText("Date: _______________", { x, y: 3.0, w: 2.9, h: 0.3, fontSize: 8.5, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
  });

  // ── Slide 10: Thank you ──
  const last = pptx.addSlide();
  last.background = { color: PETROL };
  last.addShape(pptx.ShapeType.rect, { x: 0, y: 3.2, w: 13.33, h: 0.06, fill: { color: TEAL_L } });
  last.addText("Thank You", { x: 1, y: 1.5, w: 11.33, h: 1.4, fontSize: 44, bold: true, color: WHITE, align: "center", fontFace: "Aptos" });
  last.addText("Questions & Discussion", { x: 1, y: 3.4, w: 11.33, h: 0.6, fontSize: 18, color: MID_WASH, align: "center", fontFace: "Aptos" });
  last.addText(FOOTER_TEXT, { x: 0.5, y: 6.9, w: 12.33, h: 0.3, fontSize: 7, color: DARK_GRAY });
}

// ── PMI DASHBOARD (pmi-dashboard) ─────────────────────────────────────────────
// 6 slides: Cover, Portfolio Scorecard, Financial KPIs, Schedule, Risks/Issues, Decisions

function buildDashboard(pptx: any, content: any, projectName: string) {
  let page = 1;

  titleSlide(pptx, projectName, `Executive Dashboard  |  As of ${safeStr(content.asOfDate ?? content.date ?? new Date().toISOString().slice(0, 10))}`, "UST Project Management Office");

  // Slide 2: Portfolio Scorecard
  const s2 = contentSlide(pptx, "Portfolio Health Scorecard", projectName, page++);
  const projects = content.projects ?? [{ name: projectName, scheduleRag: content.scheduleRag ?? "green", costRag: content.costRag ?? "green", scopeRag: content.scopeRag ?? "green", qualityRag: content.qualityRag ?? "green" }];
  projects.slice(0, 6).forEach((p: any, i: number) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.3 + col * 4.24;
    const y = 0.9 + row * 2.5;
    s2.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.0, h: 2.2, fill: { color: WASH }, line: { color: MID_WASH, width: 0.75 }, rectRadius: 0.1 });
    s2.addText(safeStr(p.name).slice(0, 30), { x: x + 0.1, y: y + 0.08, w: 3.8, h: 0.4, fontSize: 11, bold: true, color: TEAL, fontFace: "Aptos" });
    ["Schedule", "Cost", "Scope", "Quality"].forEach((dim, di) => {
      const ragKey = dim.toLowerCase() + "Rag";
      const fill = ragFill(p[ragKey] ?? "green");
      s2.addShape(pptx.ShapeType.ellipse, { x: x + 0.15 + di * 0.9, y: y + 0.6, w: 0.55, h: 0.55, fill: { color: fill } });
      s2.addText(dim.slice(0, 3), { x: x + 0.1 + di * 0.9, y: y + 1.2, w: 0.65, h: 0.3, fontSize: 7.5, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
    });
  });

  // Slide 3: Financial Performance (EVM)
  const s3 = contentSlide(pptx, "Financial Performance", projectName, page++);
  kpiStrip(pptx, s3, [
    { label: "Budget (BAC)", value: safeStr(content.bac ?? content.budget ?? "TBD") },
    { label: "Actual Cost (AC)", value: safeStr(content.actualCost ?? content.ac ?? "TBD") },
    { label: "CPI", value: safeStr(content.cpi ?? "—"), sub: (content.cpi ?? 0) >= 1 ? "Under Budget" : "Over Budget" },
    { label: "Forecast (EAC)", value: safeStr(content.eac ?? "TBD") },
  ], 1.0);
  const cvNote = safeStr(content.costVarianceNarrative ?? "");
  if (cvNote) s3.addText(cvNote, { x: 0.3, y: 2.9, w: 12.73, h: 0.8, fontSize: 11, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });

  // Slide 4: Schedule Performance
  const s4 = contentSlide(pptx, "Schedule Performance", projectName, page++);
  kpiStrip(pptx, s4, [
    { label: "% Complete", value: safeStr(content.percentComplete ?? "—") + "%", sub: "overall" },
    { label: "SPI", value: safeStr(content.spi ?? "—"), sub: (content.spi ?? 0) >= 1 ? "Ahead / On Track" : "Behind Schedule" },
    { label: "Next Milestone", value: safeStr(content.nextMilestone?.name ?? content.milestones?.[0]?.name ?? "—"), sub: safeStr(content.nextMilestone?.date ?? "") },
  ], 1.0);

  // Slide 5: Risks & Issues
  const allRisks = content.risks ?? content.topRisks ?? [];
  const allIssues = content.issues ?? content.topIssues ?? [];
  if (allRisks.length || allIssues.length) {
    tableSlide(pptx, "Key Risks & Issues", ["Type", "Description", "Level/Severity", "Owner", "Status"],
      [
        ...allRisks.slice(0, 4).map((r: any) => ["Risk", safeStr(r.description ?? r.statement ?? r), safeStr(r.severity ?? r.level ?? ""), safeStr(r.owner ?? "—"), safeStr(r.status ?? "Open")]),
        ...allIssues.slice(0, 4).map((i: any) => ["Issue", safeStr(i.description ?? i), safeStr(i.severity ?? ""), safeStr(i.owner ?? "—"), safeStr(i.status ?? "Open")]),
      ], projectName, page++);
  }

  // Slide 6: Decisions & Next Steps
  const decisions = content.decisions ?? content.decisionsRequired ?? [];
  const s6 = contentSlide(pptx, "Decisions & Next Steps", projectName, page++);
  if (!decisions.length) {
    s6.addText("No decisions required.", { x: 0.3, y: 2.5, w: 12.73, h: 0.6, fontSize: 14, color: DARK_GRAY, align: "center", italic: true, fontFace: "Aptos" });
  } else {
    decisions.slice(0, 5).forEach((d: any, i: number) => {
      const text = typeof d === "string" ? d : safeStr(d.decision ?? d.description ?? d);
      s6.addText(`${i + 1}.  ${text}`, { x: 0.3, y: 1.0 + i * 0.9, w: 12.73, h: 0.75, fontSize: 12, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
  }
}

// ── PMI CLOSE REPORT (pmi-close) ──────────────────────────────────────────────
// 8 slides: Cover, At a Glance, Objectives, Deliverables, Performance,
// Accomplishments, Lessons Learned, Handover

function buildCloseReport(pptx: any, content: any, projectName: string) {
  let page = 1;

  titleSlide(pptx, content.projectTitle ?? projectName, `Project Close Report  |  ${safeStr(content.date ?? "")}`, "UST Project Management Office");

  // Slide 2: Project at a Glance
  const s2 = contentSlide(pptx, "Project at a Glance", projectName, page++);
  const outcome = safeStr(content.overallOutcome ?? "Successful");
  const outColor = outcome.toLowerCase().includes("success") ? GREEN : outcome.toLowerCase().includes("partial") ? "FFC000" : RED;
  s2.addShape(pptx.ShapeType.roundRect, { x: 10.5, y: 0.9, w: 2.5, h: 0.75, fill: { color: outColor }, rectRadius: 0.1 });
  s2.addText(outcome.toUpperCase(), { x: 10.5, y: 0.9, w: 2.5, h: 0.75, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
  const compareItems = [
    ["Duration", safeStr(content.plannedDuration ?? "—"), safeStr(content.actualDuration ?? "—")],
    ["Cost", safeStr(content.plannedCost ?? "—"), safeStr(content.actualCost ?? "—")],
    ["Scope Items", safeStr(content.plannedScope ?? "—"), safeStr(content.actualScope ?? "—")],
  ];
  const compTable = [
    ["Dimension", "Planned", "Actual"].map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: PETROL }, fontSize: 10, fontFace: "Aptos" } })),
    ...compareItems.map((r) => r.map((c) => ({ text: c, options: { fontSize: 11, color: SOFT_BLACK, fill: { color: WHITE }, fontFace: "Aptos" } }))),
  ];
  s2.addTable(compTable, { x: 0.3, y: 0.9, w: 9.5, colW: [3.5, 3.0, 3.0], border: { color: MID_WASH } });

  // Slide 3: Objectives Achievement
  const objs = content.objectives ?? content.objectivesAchieved ?? [];
  if (objs.length) {
    const s3 = contentSlide(pptx, "Objectives Achievement", projectName, page++);
    const metCount = objs.filter((o: any) => (typeof o === "object" ? o.status : "").toLowerCase().includes("met")).length;
    s3.addText(`${metCount}/${objs.length}`, { x: 11.3, y: 0.9, w: 1.7, h: 0.8, fontSize: 28, bold: true, color: GREEN, align: "center", fontFace: "Aptos" });
    s3.addText("Objectives Met", { x: 11.0, y: 1.7, w: 2.0, h: 0.3, fontSize: 9, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
    objs.slice(0, 7).forEach((o: any, i: number) => {
      const text = typeof o === "string" ? o : safeStr(o.objective ?? o.description);
      const status = typeof o === "string" ? "Met" : safeStr(o.status ?? "Met");
      const icon = status.toLowerCase().includes("not") ? "✗" : status.toLowerCase().includes("partial") ? "⚠" : "✓";
      const ic = status.toLowerCase().includes("not") ? RED : status.toLowerCase().includes("partial") ? "FFC000" : GREEN;
      s3.addText(icon, { x: 0.3, y: 1.0 + i * 0.72, w: 0.4, h: 0.6, fontSize: 14, bold: true, color: ic, valign: "middle", fontFace: "Aptos" });
      s3.addText(text.slice(0, 120), { x: 0.75, y: 1.0 + i * 0.72, w: 10.2, h: 0.6, fontSize: 11, color: SOFT_BLACK, wrap: true, valign: "middle", fontFace: "Aptos" });
    });
  }

  // Slide 4: Accomplishments
  const acc = content.keyAccomplishments ?? content.accomplishments ?? [];
  if (acc.length) {
    const s4 = contentSlide(pptx, "Key Accomplishments", projectName, page++);
    acc.slice(0, 5).forEach((a: any, i: number) => {
      const text = typeof a === "string" ? a : safeStr(a.description ?? a);
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.3 + col * 4.24;
      const y = 0.9 + row * 2.6;
      s4.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.0, h: 2.3, fill: { color: "E6F9F3" }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
      s4.addText("✓", { x: x + 0.15, y: y + 0.1, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: GREEN, fontFace: "Aptos" });
      s4.addText(text.slice(0, 150), { x: x + 0.1, y: y + 0.6, w: 3.8, h: 1.6, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
  }

  // Slide 5: Schedule & Cost Performance
  const s5 = contentSlide(pptx, "Schedule & Cost Performance", projectName, page++);
  kpiStrip(pptx, s5, [
    { label: "Planned End Date", value: safeStr(content.plannedEndDate ?? "—") },
    { label: "Actual End Date", value: safeStr(content.actualEndDate ?? "—") },
    { label: "Final CPI", value: safeStr(content.finalCpi ?? content.cpi ?? "—") },
    { label: "Final SPI", value: safeStr(content.finalSpi ?? content.spi ?? "—") },
    { label: "Budget Variance", value: safeStr(content.budgetVariance ?? "—") },
  ], 1.0);

  // Slide 6: Lessons Learned
  const ll = content.lessonsLearned ?? [];
  if (ll.length) {
    const s6 = contentSlide(pptx, "Top Lessons Learned", projectName, page++);
    const worked = ll.filter((l: any) => (typeof l === "object" ? l.type : "").toLowerCase().includes("success")).slice(0, 4);
    const improve = ll.filter((l: any) => !(typeof l === "object" ? l.type : "").toLowerCase().includes("success")).slice(0, 4);
    s6.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.85, w: 6.0, h: 0.35, fill: { color: GREEN } });
    s6.addText("What Worked Well", { x: 0.3, y: 0.85, w: 6.0, h: 0.35, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    worked.forEach((l: any, i: number) => {
      s6.addText(`•  ${safeStr(l.lesson ?? l).slice(0, 100)}`, { x: 0.3, y: 1.3 + i * 0.7, w: 6.0, h: 0.6, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
    s6.addShape(pptx.ShapeType.rect, { x: 6.93, y: 0.85, w: 6.1, h: 0.35, fill: { color: TEAL } });
    s6.addText("Do Differently Next Time", { x: 6.93, y: 0.85, w: 6.1, h: 0.35, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Aptos" });
    improve.forEach((l: any, i: number) => {
      s6.addText(`•  ${safeStr(l.lesson ?? l).slice(0, 100)}`, { x: 6.93, y: 1.3 + i * 0.7, w: 6.1, h: 0.6, fontSize: 10.5, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
  }

  // Slide 7: Handover & Next Steps
  const outstanding = content.outstandingItems ?? content.handoverItems ?? [];
  const s7 = contentSlide(pptx, "Handover & Next Steps", projectName, page++);
  s7.addText("Outstanding Items", { x: 0.3, y: 0.85, w: 12.73, h: 0.35, fontSize: 11, bold: true, color: TEAL, fontFace: "Aptos" });
  if (!outstanding.length) {
    s7.addText("No outstanding items. Project formally closed.", { x: 0.3, y: 1.3, w: 12.73, h: 0.5, fontSize: 12, color: DARK_GRAY, italic: true, fontFace: "Aptos" });
  } else {
    outstanding.slice(0, 6).forEach((item: any, i: number) => {
      s7.addText(`${i + 1}.  ${safeStr(item.description ?? item)}`, { x: 0.3, y: 1.3 + i * 0.55, w: 12.73, h: 0.5, fontSize: 11, color: SOFT_BLACK, wrap: true, fontFace: "Aptos" });
    });
  }
  s7.addText("Project Formally Closed", { x: 0.3, y: 5.5, w: 12.73, h: 0.5, fontSize: 13, bold: true, color: GREEN, align: "center", fontFace: "Aptos" });
  s7.addText(FOOTER_TEXT, { x: 0.3, y: 6.0, w: 12.73, h: 0.3, fontSize: 7, color: DARK_GRAY, align: "center", fontFace: "Aptos" });
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export async function buildPptx(artifactType: string, content: any, projectName: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";   // 13.33" × 7.5"
  pptx.author  = "PM Agent";
  pptx.company = "UST Global";
  pptx.subject = artifactType;

  switch (artifactType) {
    case "initiation_deck":
    case "project_charter":
      buildCharter(pptx, content, projectName);
      break;
    case "weekly_status":
    case "monthly_status":
    case "status_report":
      buildStatusReport(pptx, content, projectName);
      break;
    case "executive_dashboard":
    case "dashboard":
      buildDashboard(pptx, content, projectName);
      break;
    case "close_report":
    case "lessons_learned":
      buildCloseReport(pptx, content, projectName);
      break;
    default:
      buildCharter(pptx, content, projectName);
  }

  return await pptx.write("nodebuffer") as Buffer;
}
