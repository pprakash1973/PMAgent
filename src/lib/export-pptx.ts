// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require("pptxgenjs");

const BLUE  = "1E3A8A";
const WHITE = "FFFFFF";
const GRAY  = "64748B";
const LIGHT = "F1F5F9";
const GREEN = "16A34A";
const AMBER = "D97706";
const RED   = "DC2626";

function ragColor(s: string) {
  const v = (s ?? "").toLowerCase();
  if (v === "green" || v === "on track") return GREEN;
  if (v === "amber" || v === "at risk") return AMBER;
  return RED;
}

function safeStr(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── slide helpers ─────────────────────────────────────────────────────────────

function titleSlide(pptx: any, title: string, subtitle: string) {
  const slide = pptx.addSlide();
  slide.background = { color: BLUE };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.8, w: 10, h: 0.06, fill: { color: WHITE, transparency: 70 } });
  slide.addText(title, { x: 0.6, y: 1.5, w: 8.8, h: 1.6, fontSize: 32, bold: true, color: WHITE, align: "left", valign: "middle" });
  slide.addText(subtitle, { x: 0.6, y: 3.2, w: 8.8, h: 0.6, fontSize: 16, color: "CBD5E1", align: "left" });
}

function sectionSlide(pptx: any, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "1E40AF" };
  slide.addText(title, { x: 0.5, y: 2.0, w: 9, h: 1.2, fontSize: 28, bold: true, color: WHITE, align: "center", valign: "middle" });
}

function contentSlide(pptx: any, title: string): any {
  const slide = pptx.addSlide();
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.72, fill: { color: BLUE } });
  slide.addText(title, { x: 0.3, y: 0, w: 9.4, h: 0.72, fontSize: 16, bold: true, color: WHITE, valign: "middle" });
  return slide;
}

function bulletSlide(pptx: any, title: string, bullets: string[]) {
  const slide = contentSlide(pptx, title);
  const items = bullets.slice(0, 8).map((b) => ({ text: b, options: { bullet: { code: "2022" }, fontSize: 14, color: "1E293B", paraSpaceAfter: 6 } }));
  slide.addText(items, { x: 0.5, y: 0.9, w: 9, h: 4.5 });
}

function ragBadgeSlide(pptx: any, title: string, status: string, summary: string, bullets: string[]) {
  const slide = contentSlide(pptx, title);
  const color = ragColor(status);
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 0.9, w: 2.2, h: 0.8, fill: { color }, rectRadius: 0.1 });
  slide.addText((status ?? "—").toUpperCase(), { x: 0.5, y: 0.9, w: 2.2, h: 0.8, fontSize: 18, bold: true, color: WHITE, align: "center", valign: "middle" });
  slide.addText(summary, { x: 0.5, y: 1.85, w: 9, h: 0.7, fontSize: 12, color: GRAY, italic: true });
  const items = bullets.slice(0, 6).map((b) => ({ text: b, options: { bullet: { code: "2022" }, fontSize: 12, color: "1E293B", paraSpaceAfter: 4 } }));
  slide.addText(items, { x: 0.5, y: 2.65, w: 9, h: 2.8 });
}

function tableSlide(pptx: any, title: string, headers: string[], rows: string[][]) {
  const slide = contentSlide(pptx, title);
  const tableRows = [
    headers.map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: BLUE }, fontSize: 10 } })),
    ...rows.slice(0, 10).map((r, ri) =>
      r.map((cell) => ({ text: cell, options: { fontSize: 9, color: "1E293B", fill: { color: ri % 2 === 0 ? WHITE : LIGHT } } }))
    ),
  ];
  slide.addTable(tableRows, { x: 0.3, y: 0.85, w: 9.4, colW: headers.map(() => 9.4 / headers.length), border: { color: "E2E8F0" } });
}

// ── artifact builders ─────────────────────────────────────────────────────────

function buildInitiationDeck(pptx: any, content: any, projectName: string) {
  titleSlide(pptx, content.projectTitle ?? projectName, "Project Initiation Presentation");

  // Agenda
  bulletSlide(pptx, "Agenda", ["1. Project Overview", "2. Objectives & Scope", "3. Stakeholders", "4. Timeline & Milestones", "5. Budget", "6. Risks & Assumptions", "7. Next Steps & Approvals"]);

  // Overview
  const slide2 = contentSlide(pptx, "Project Overview");
  const overviewLines = [
    `Project: ${safeStr(content.projectTitle ?? projectName)}`,
    `Description: ${safeStr(content.projectDescription)}`,
    `Budget: ${safeStr(content.budget)}`,
    `Timeline: ${safeStr(content.timeline)}`,
  ];
  slide2.addText(overviewLines.map((l) => ({ text: l, options: { bullet: false, fontSize: 13, color: "1E293B", paraSpaceAfter: 10 } })), { x: 0.5, y: 0.9, w: 9, h: 4 });

  // Objectives
  bulletSlide(pptx, "Objectives", (content.objectives ?? []).map(safeStr));

  // Scope — in scope / out of scope
  const scopeSlide = contentSlide(pptx, "Scope");
  const inScope = (content.scope?.inScope ?? content.inScope ?? []).map((s: unknown) => `✓  ${safeStr(s)}`);
  const outScope = (content.scope?.outOfScope ?? content.outOfScope ?? []).map((s: unknown) => `✗  ${safeStr(s)}`);
  scopeSlide.addText("In Scope", { x: 0.3, y: 0.85, w: 4.5, h: 0.4, fontSize: 12, bold: true, color: GREEN });
  scopeSlide.addText(inScope.slice(0, 5).join("\n"), { x: 0.3, y: 1.3, w: 4.4, h: 3.5, fontSize: 11, color: "1E293B" });
  scopeSlide.addText("Out of Scope", { x: 5.0, y: 0.85, w: 4.7, h: 0.4, fontSize: 12, bold: true, color: RED });
  scopeSlide.addText(outScope.slice(0, 5).join("\n"), { x: 5.0, y: 1.3, w: 4.7, h: 3.5, fontSize: 11, color: "1E293B" });

  // Stakeholders table
  const stakeholders = content.stakeholders ?? [];
  if (stakeholders.length) {
    tableSlide(pptx, "Key Stakeholders", ["Name", "Role", "Interest"],
      stakeholders.slice(0, 8).map((s: any) => [safeStr(s.name), safeStr(s.role), safeStr(s.interest)]));
  }

  // Milestones
  const milestones = content.deliverables ?? [];
  if (milestones.length) {
    bulletSlide(pptx, "Key Deliverables & Timeline", milestones.map((d: unknown) => `• ${safeStr(d)}`));
  }

  // Risks
  const risks = content.risks ?? [];
  if (risks.length) {
    bulletSlide(pptx, "Key Risks", risks.slice(0, 6).map((r: any) => typeof r === "string" ? r : safeStr(r.description ?? r)));
  }

  // Assumptions
  const assumptions = content.assumptions ?? [];
  if (assumptions.length) {
    bulletSlide(pptx, "Assumptions & Constraints", [
      ...assumptions.slice(0, 4).map((a: unknown) => `Assumption: ${safeStr(a)}`),
      ...(content.constraints ?? []).slice(0, 4).map((c: unknown) => `Constraint: ${safeStr(c)}`),
    ]);
  }

  // Next steps / approvals
  const approvals = (content.approvalSignatures ?? []).map((a: any) => `• ${safeStr(a.role)} — pending sign-off`);
  bulletSlide(pptx, "Next Steps & Approvals", approvals.length ? approvals : ["Stakeholder review and sign-off", "Kick-off meeting scheduling", "Team onboarding", "Project baseline confirmation"]);

  // Thank you
  const last = pptx.addSlide();
  last.background = { color: BLUE };
  last.addText("Thank You", { x: 1, y: 1.8, w: 8, h: 1.2, fontSize: 36, bold: true, color: WHITE, align: "center" });
  last.addText("Questions & Discussion", { x: 1, y: 3.2, w: 8, h: 0.6, fontSize: 18, color: "CBD5E1", align: "center" });
}

function buildWeeklyStatus(pptx: any, content: any, projectName: string) {
  titleSlide(pptx, `${projectName}`, `Weekly Status Report — ${safeStr(content.reportingPeriod ?? "")}`);

  // Overall RAG
  ragBadgeSlide(pptx, "Executive Summary", content.overallStatus ?? content.ragStatus ?? "green",
    safeStr(content.executiveSummary ?? content.summary ?? ""),
    (content.accomplishments ?? []).slice(0, 5).map(safeStr));

  // Accomplishments + Planned
  const twoCol = contentSlide(pptx, "This Week vs Next Week");
  const acc = (content.accomplishments ?? []).slice(0, 6).map((a: unknown) => `✓  ${safeStr(a)}`).join("\n");
  const plan = (content.plannedActivities ?? []).slice(0, 6).map((a: unknown) => `→  ${safeStr(a)}`).join("\n");
  twoCol.addText("Accomplished", { x: 0.3, y: 0.85, w: 4.5, h: 0.4, fontSize: 12, bold: true, color: GREEN });
  twoCol.addText(acc, { x: 0.3, y: 1.3, w: 4.4, h: 3.5, fontSize: 11, color: "1E293B" });
  twoCol.addText("Planned Next Week", { x: 5.0, y: 0.85, w: 4.7, h: 0.4, fontSize: 12, bold: true, color: BLUE });
  twoCol.addText(plan, { x: 5.0, y: 1.3, w: 4.7, h: 3.5, fontSize: 11, color: "1E293B" });

  // Milestones
  const ms = content.milestoneStatus ?? [];
  if (ms.length) {
    tableSlide(pptx, "Milestone Status", ["Milestone", "Due Date", "Status"],
      ms.slice(0, 8).map((m: any) => [safeStr(m.name ?? m.milestone), safeStr(m.dueDate ?? m.date), safeStr(m.status)]));
  }

  // Risks & Issues
  const risks = content.risks ?? [];
  if (risks.length) {
    tableSlide(pptx, "Risks & Issues", ["Description", "Status"],
      risks.slice(0, 8).map((r: any) => [safeStr(r.description), safeStr(r.status)]));
  }

  // Financial
  const finSlide = contentSlide(pptx, "Financial Status");
  finSlide.addText(safeStr(content.financialStatus ?? "Financial data not available."), { x: 0.5, y: 0.9, w: 9, h: 1.5, fontSize: 12, color: "1E293B" });
  const decisions = content.decisions ?? [];
  if (decisions.length) {
    finSlide.addText("Decisions Required", { x: 0.5, y: 2.5, w: 9, h: 0.4, fontSize: 12, bold: true, color: "1E293B" });
    finSlide.addText(decisions.slice(0, 4).map(safeStr).join("\n"), { x: 0.5, y: 3.0, w: 9, h: 1.8, fontSize: 11, color: GRAY });
  }
}

function buildMonthlyStatus(pptx: any, content: any, projectName: string) {
  titleSlide(pptx, `${projectName}`, `Monthly Status Report — ${safeStr(content.reportingPeriod ?? content.month ?? "")}`);

  ragBadgeSlide(pptx, "Executive Summary", content.overallStatus ?? content.ragStatus ?? "green",
    safeStr(content.executiveSummary ?? content.summary ?? ""),
    (content.keyAchievements ?? content.accomplishments ?? []).slice(0, 5).map(safeStr));

  // KPIs
  const kpiSlide = contentSlide(pptx, "Key Performance Indicators");
  const kpis = [
    `Schedule Performance (SPI): ${safeStr(content.spi ?? content.schedulePerformance ?? "—")}`,
    `Cost Performance (CPI): ${safeStr(content.cpi ?? content.costPerformance ?? "—")}`,
    `Budget Spent: ${safeStr(content.budgetSpent ?? content.actualCost ?? "—")}`,
    `Budget Remaining: ${safeStr(content.budgetRemaining ?? "—")}`,
    `% Complete: ${safeStr(content.percentComplete ?? content.completionPercent ?? "—")}`,
    `Team Utilisation: ${safeStr(content.teamUtilisation ?? content.resourceUtilisation ?? "—")}`,
  ];
  kpiSlide.addText(kpis.map((k) => ({ text: k, options: { bullet: false, fontSize: 13, color: "1E293B", paraSpaceAfter: 10 } })), { x: 0.5, y: 0.9, w: 9, h: 4 });

  // Milestones
  const ms = content.milestoneStatus ?? content.milestones ?? [];
  if (ms.length) {
    tableSlide(pptx, "Milestone Status", ["Milestone", "Due Date", "Status"],
      ms.slice(0, 8).map((m: any) => [safeStr(m.name ?? m.milestone), safeStr(m.dueDate ?? m.date), safeStr(m.status)]));
  }

  // Risks
  const risks = content.risks ?? content.topRisks ?? [];
  if (risks.length) {
    tableSlide(pptx, "Top Risks & Issues", ["Description", "Impact", "Status"],
      risks.slice(0, 8).map((r: any) => [safeStr(r.description), safeStr(r.impact ?? r.severity ?? ""), safeStr(r.status)]));
  }

  // Next month plan
  bulletSlide(pptx, "Next Month Plan", (content.nextMonthPlan ?? content.plannedActivities ?? []).slice(0, 7).map(safeStr));

  // Decisions
  const decisions = content.decisions ?? content.escalations ?? [];
  if (decisions.length) {
    bulletSlide(pptx, "Decisions & Escalations", decisions.slice(0, 6).map(safeStr));
  }
}

// ── main dispatcher ───────────────────────────────────────────────────────────

export async function buildPptx(artifactType: string, content: any, projectName: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 10 x 5.63 inches
  pptx.author = "PM Agent";
  pptx.company = "PM Agent";

  switch (artifactType) {
    case "initiation_deck":
    case "project_charter":
      buildInitiationDeck(pptx, content, projectName);
      break;
    case "weekly_status":
      buildWeeklyStatus(pptx, content, projectName);
      break;
    case "monthly_status":
      buildMonthlyStatus(pptx, content, projectName);
      break;
    default:
      buildInitiationDeck(pptx, content, projectName);
  }

  return await pptx.write("nodebuffer") as Buffer;
}
