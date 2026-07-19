import * as XLSX from "xlsx";

// ── UST Brand hex (used where XLSX supports fill colours via xlsx-style or similar)
// xlsx (SheetJS) community edition does not support cell styling.
// We apply structure, column widths, and frozen panes using what CE supports.

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function cols(widths: number[]) {
  return widths.map((w) => ({ wch: w }));
}

function tableSheet(headers: string[], rows: unknown[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  return ws;
}

function addFreezeRow(ws: XLSX.WorkSheet) {
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
}

// ── PMI Risk Register (pmi-risk) ─────────────────────────────────────────────
// 4 sheets: Risk Register, P×I Heat Map, Response Plan, Dashboard Summary

function riskRegister(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const risks = content.risks ?? [];

  // Sheet 1: Risk Register (PMBOK 11.2–11.4 full columns)
  const regHeaders = [
    "Risk ID", "Category", "Risk Title", "Risk Description (If…Then…Causing…)",
    "Type", "Probability (1-5)", "Impact (1-5)", "Risk Score", "Risk Level",
    "Risk Owner", "Response Strategy", "Response Actions",
    "Contingency Plan", "Trigger", "Residual Score",
    "Status", "Date Identified", "Review Date", "Notes",
  ];
  const regRows = risks.map((r: any) => [
    safeStr(r.id),
    safeStr(r.category),
    safeStr(r.id) + " — " + safeStr(r.type ?? "Threat"),
    safeStr(r.statement ?? r.description),
    safeStr(r.type ?? "Threat"),
    safeStr(r.probabilityScore ?? r.probability),
    safeStr(r.impactScore ?? r.impact),
    safeStr(r.riskScore ?? ""),
    safeStr(r.severity),
    safeStr(r.owner),
    safeStr(r.strategy),
    Array.isArray(r.responseActions) ? r.responseActions.join("; ") : safeStr(r.responseActions),
    safeStr(r.contingencyPlan),
    safeStr(r.trigger),
    safeStr(r.residualRiskScore ?? ""),
    safeStr(r.status ?? "Open"),
    safeStr(r.dueDate ?? ""),
    "",
    safeStr(r.notes ?? ""),
  ]);
  const regWs = tableSheet(regHeaders, regRows);
  regWs["!cols"] = cols([8, 16, 20, 55, 10, 14, 12, 12, 14, 20, 18, 50, 40, 30, 14, 12, 16, 14, 24]);
  addFreezeRow(regWs);
  XLSX.utils.book_append_sheet(wb, regWs, "Risk Register");

  // Sheet 2: P×I Heat Map (5×5 grid)
  const pxiData: string[][] = [["P\\I", "1-Very Low", "2-Low", "3-Medium", "4-High", "5-Very High"]];
  const levelOf = (score: number) => score >= 15 ? "CRITICAL" : score >= 10 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
  for (let p = 5; p >= 1; p--) {
    const row: string[] = [`${p}-${p === 5 ? "Very High" : p === 4 ? "High" : p === 3 ? "Medium" : p === 2 ? "Low" : "Very Low"}`];
    for (let i = 1; i <= 5; i++) {
      const score = p * i;
      const riskIDs = risks
        .filter((r: any) => +safeStr(r.probabilityScore ?? r.probability) === p && +safeStr(r.impactScore ?? r.impact) === i)
        .map((r: any) => safeStr(r.id))
        .join(", ");
      row.push(`${levelOf(score)} (${score})${riskIDs ? "\n" + riskIDs : ""}`);
    }
    pxiData.push(row);
  }
  pxiData.push(["", "← Impact →", "", "", "", ""]);
  const pxiWs = XLSX.utils.aoa_to_sheet(pxiData);
  pxiWs["!cols"] = cols([18, 22, 22, 22, 22, 22]);
  XLSX.utils.book_append_sheet(wb, pxiWs, "P×I Heat Map");

  // Sheet 3: Response Plan (PMBOK 11.5)
  const respHeaders = ["Risk ID", "Risk Title", "Risk Level", "Response Strategy", "Mitigation Actions", "Contingency Plan", "Trigger / Warning", "Owner", "Due Date", "Cost Reserve", "Status"];
  const respRows = risks
    .filter((r: any) => ["Critical", "High", "Medium"].includes(safeStr(r.severity)))
    .map((r: any) => [
      safeStr(r.id),
      safeStr(r.statement ?? r.description).slice(0, 60),
      safeStr(r.severity),
      safeStr(r.strategy),
      Array.isArray(r.responseActions) ? r.responseActions.join("\n") : safeStr(r.responseActions),
      safeStr(r.contingencyPlan),
      safeStr(r.trigger),
      safeStr(r.owner),
      safeStr(r.dueDate ?? ""),
      safeStr(r.contingencyReserve ?? ""),
      safeStr(r.status ?? "Planned"),
    ]);
  const respWs = tableSheet(respHeaders, respRows);
  respWs["!cols"] = cols([8, 35, 12, 18, 45, 40, 30, 20, 14, 14, 14]);
  addFreezeRow(respWs);
  XLSX.utils.book_append_sheet(wb, respWs, "Response Plan");

  // Sheet 4: Risk Dashboard Summary
  const exposure = content.riskExposureSummary ?? {};
  const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  risks.forEach((r: any) => {
    const s = safeStr(r.severity);
    if (s in counts) counts[s]++;
  });
  const dashData = [
    ["RISK DASHBOARD SUMMARY", ""],
    ["", ""],
    ["Total Risks", risks.length],
    ["Critical", counts.Critical],
    ["High", counts.High],
    ["Medium", counts.Medium],
    ["Low", counts.Low],
    ["", ""],
    ["Top Risk", safeStr(exposure.topRisk ?? risks[0]?.statement ?? risks[0]?.description ?? "")],
    ["Risk Appetite", safeStr(content.riskAppetite ?? "")],
    ["Escalation Threshold", safeStr(content.escalationThreshold ?? "")],
    ["", ""],
    ["Category", "Count"],
    ...Array.from(new Set(risks.map((r: any) => safeStr(r.category)))).map((cat) => [
      cat, risks.filter((r: any) => safeStr(r.category) === cat).length,
    ]),
  ];
  const dashWs = XLSX.utils.aoa_to_sheet(dashData);
  dashWs["!cols"] = cols([30, 40]);
  XLSX.utils.book_append_sheet(wb, dashWs, "Risk Dashboard");

  return wb;
}

// ── PMI WBS (pmi-wbs) ────────────────────────────────────────────────────────
// 3 sheets: WBS Hierarchy, WBS Dictionary, Scope Baseline Summary

function wbs(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: WBS Hierarchy (Buchtik: includes componentType, 100percentCheck)
  const hierHeaders = [
    "WBS Code", "WBS Level", "Element Name", "Component Type",
    "Work Package?", "Owner", "Est. Duration (days)", "Est. Effort (hrs)", "100% Check",
  ];
  const hierRows: unknown[][] = [];
  let totalDays = 0;
  let totalWPs = 0;
  for (const phase of content.phases ?? []) {
    hierRows.push([
      safeStr(phase.id), 2, safeStr(phase.name),
      safeStr(phase.componentType ?? "Discrete"), "No",
      safeStr(phase.owner ?? ""), "", "", safeStr(phase["100percentCheck"] ?? ""),
    ]);
    for (const del of phase.deliverables ?? []) {
      hierRows.push([
        safeStr(del.id), 3, "  " + safeStr(del.name),
        safeStr(del.componentType ?? "Discrete"), "No",
        safeStr(del.owner ?? ""), "", "", safeStr(del["100percentCheck"] ?? ""),
      ]);
      for (const wp of del.workPackages ?? []) {
        const days = Number(wp.estimatedDays) || 0;
        totalDays += days;
        totalWPs++;
        hierRows.push([
          safeStr(wp.id), 4, "    " + safeStr(wp.name),
          safeStr(wp.componentType ?? "Discrete"), "Yes",
          safeStr(wp.owner ?? ""), days || "", days ? days * 8 : "", "",
        ]);
      }
    }
  }
  const hierWs = tableSheet(hierHeaders, hierRows);
  hierWs["!cols"] = cols([14, 10, 38, 16, 14, 22, 18, 16, 44]);
  addFreezeRow(hierWs);
  XLSX.utils.book_append_sheet(wb, hierWs, "WBS Hierarchy");

  // Sheet 2: WBS Dictionary (work packages only, now includes Out of Scope from AI)
  const dictHeaders = [
    "WBS Code", "Work Package Name", "Work Description",
    "In Scope", "Out of Scope", "Acceptance Criteria",
    "Owner", "Dependencies", "Est. Duration (days)", "Est. Effort (hrs)",
  ];
  const dictRows: unknown[][] = [];
  for (const phase of content.phases ?? []) {
    for (const del of phase.deliverables ?? []) {
      for (const wp of del.workPackages ?? []) {
        dictRows.push([
          safeStr(wp.id),
          safeStr(wp.name),
          safeStr(wp.description),
          safeStr(wp.name) + " completed and accepted",
          safeStr(wp.outOfScope ?? ("Work outside of " + safeStr(del.name))),
          safeStr(wp.acceptanceCriteria ?? "Delivered and signed off by owner"),
          safeStr(wp.owner ?? ""),
          Array.isArray(wp.dependencies) ? wp.dependencies.join(", ") : safeStr(wp.dependencies ?? ""),
          safeStr(wp.estimatedDays ?? ""),
          wp.estimatedDays ? Number(wp.estimatedDays) * 8 : "",
        ]);
      }
    }
  }
  const dictWs = tableSheet(dictHeaders, dictRows);
  dictWs["!cols"] = cols([12, 28, 44, 30, 36, 40, 22, 20, 16, 16]);
  addFreezeRow(dictWs);
  XLSX.utils.book_append_sheet(wb, dictWs, "WBS Dictionary");

  // Sheet 3: Scope Baseline Summary
  const sbs = content.scopeBaselineSummary ?? {};
  const scopeData: unknown[][] = [
    ["SCOPE BASELINE SUMMARY", ""],
    ["", ""],
    ["Project", safeStr(content.projectName)],
    ["WBS Top-Level Code", safeStr(content.wbsCode ?? "1")],
    ["Structuring Approach", safeStr(content.structuringApproach ?? sbs.structuringApproach ?? "")],
    ["Total Components", sbs.totalComponents ?? ""],
    ["Total Work Packages", sbs.totalWorkPackages ?? totalWPs],
    ["Total Estimated Days", sbs.totalEstimatedDays ?? totalDays],
    ["Total Estimated Hours", (sbs.totalEstimatedDays ?? totalDays) * 8],
    ["Max Depth (levels)", sbs.maxDepth ?? 4],
    ["", ""],
    ["Phase", "Work Packages", "Est. Days"],
    ...(content.phases ?? []).map((p: any) => {
      const wpCount = (p.deliverables ?? []).reduce((sum: number, d: any) => sum + (d.workPackages ?? []).length, 0);
      const pDays = (p.deliverables ?? []).reduce((sum: number, d: any) =>
        sum + (d.workPackages ?? []).reduce((s2: number, wp: any) => s2 + (Number(wp.estimatedDays) || 0), 0), 0);
      return [safeStr(p.name), wpCount, pDays];
    }),
    ["", ""],
    ["Control Accounts", ""],
    ...((sbs.controlAccounts ?? []).map((ca: string) => ["", safeStr(ca)])),
    ["", ""],
    ["Note", safeStr(sbs.note ?? "Scope baseline = Scope Statement + WBS + WBS Dictionary. Changes after approval require formal change control.")],
  ];
  const scopeWs = XLSX.utils.aoa_to_sheet(scopeData);
  scopeWs["!cols"] = cols([30, 20, 18]);
  XLSX.utils.book_append_sheet(wb, scopeWs, "Scope Baseline Summary");

  // Sheet 4: Quality Audit (Buchtik 16-point checklist)
  const auditHeaders = ["#", "Quality Check", "Result", "Evidence"];
  const auditRows: unknown[][] = (content.qualityAudit ?? []).map((q: any) => [
    safeStr(q.check),
    safeStr(q.description),
    safeStr(q.result),
    safeStr(q.evidence),
  ]);
  if (auditRows.length === 0) {
    auditRows.push(["—", "Quality audit not generated", "N/A", "Re-generate WBS to include audit"]);
  }
  const auditWs = tableSheet(auditHeaders, auditRows);
  auditWs["!cols"] = cols([4, 52, 10, 60]);
  addFreezeRow(auditWs);
  XLSX.utils.book_append_sheet(wb, auditWs, "Quality Audit");

  return wb;
}

// ── PMI Schedule (pmi-schedule) ───────────────────────────────────────────────
// 3 sheets: Project Schedule, Milestone Tracker, Schedule Baseline

function scheduleXlsx(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Project Schedule (activity list)
  const schedHeaders = ["ID", "WBS", "Activity Name", "Phase", "Owner", "Duration (days)", "Start Date", "End Date", "Predecessors", "% Complete", "Status", "Notes"];
  const schedRows: unknown[][] = [];
  const milestones = content.milestones ?? [];
  milestones.forEach((m: any, idx: number) => {
    schedRows.push([
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
    ]);
  });
  const schedWs = tableSheet(schedHeaders, schedRows);
  schedWs["!cols"] = cols([8, 12, 36, 18, 20, 14, 14, 14, 16, 12, 16, 30]);
  addFreezeRow(schedWs);
  XLSX.utils.book_append_sheet(wb, schedWs, "Project Schedule");

  // Sheet 2: Milestone Tracker (PMBOK 6.6 control)
  const msHeaders = ["#", "Milestone Name", "Planned Date", "Actual / Forecast Date", "Variance (days)", "Status", "Owner", "Notes"];
  const msRows = milestones.map((m: any, i: number) => [
    i + 1,
    safeStr(m.name),
    safeStr(m.plannedDate ?? m.date ?? ""),
    safeStr(m.forecastDate ?? m.actualDate ?? m.date ?? ""),
    safeStr(m.variance ?? "0"),
    safeStr(m.status ?? "Not Started"),
    safeStr(m.owner ?? ""),
    safeStr(m.notes ?? ""),
  ]);
  const msWs = tableSheet(msHeaders, msRows);
  msWs["!cols"] = cols([6, 36, 16, 18, 14, 16, 20, 30]);
  addFreezeRow(msWs);
  XLSX.utils.book_append_sheet(wb, msWs, "Milestone Tracker");

  // Sheet 3: Schedule Baseline (read-only reference)
  const baseData: unknown[][] = [
    ["SCHEDULE BASELINE — LOCKED", "", "", "", ""],
    ["", "", "", "", ""],
    ["Milestone", "Baseline Start", "Baseline Finish", "Owner", "Phase"],
    ...milestones.map((m: any) => [
      safeStr(m.name),
      safeStr(m.plannedDate ?? m.date ?? ""),
      safeStr(m.forecastDate ?? m.dueDate ?? m.date ?? ""),
      safeStr(m.owner ?? ""),
      safeStr(m.phase ?? ""),
    ]),
  ];
  const baseWs = XLSX.utils.aoa_to_sheet(baseData);
  baseWs["!cols"] = cols([36, 18, 18, 20, 18]);
  XLSX.utils.book_append_sheet(wb, baseWs, "Schedule Baseline");

  return wb;
}

// ── PMI Budget / EVM (pmi-budget) ─────────────────────────────────────────────
// 4 sheets: Cost Estimates, Budget Baseline, Funding Requirements, EVM Tracker

function budgetXlsx(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const currency = safeStr(content.currency ?? "USD");
  const summary = content.costSummary ?? {};

  // Sheet 1: Cost Estimates (bottom-up)
  const estHeaders = ["WBS Code", "Work Package / Activity", "Phase", "Resource Type", "Qty / Hours", `Unit Rate (${currency})`, `Direct Cost (${currency})`, "Overhead %", `Overhead (${currency})`, `Total Cost (${currency})`, "Contingency %", `Contingency (${currency})`, `Estimate Total (${currency})`, "Method", "Confidence", "Notes"];
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
  const estWs = tableSheet(estHeaders, [...laborRows, ...nlRows]);
  estWs["!cols"] = cols([10, 30, 16, 20, 12, 14, 14, 12, 14, 14, 12, 14, 16, 16, 12, 30]);
  addFreezeRow(estWs);
  XLSX.utils.book_append_sheet(wb, estWs, "Cost Estimates");

  // Sheet 2: Budget Baseline (S-curve setup)
  const phases = content.phaseBreakdown ?? [];
  const baseHeaders = ["Phase", `Planned Value (${currency})`, `Cumulative PV (${currency})`, "% of Budget"];
  const baseRows = phases.map((p: any) => [
    safeStr(p.phase),
    safeStr(p.plannedValue ?? ""),
    safeStr(p.cumulativePV ?? ""),
    safeStr(p.plannedValue && summary.costBaseline ? ((+p.plannedValue / +summary.costBaseline) * 100).toFixed(1) + "%" : ""),
  ]);
  baseRows.push(["", "", "", ""]);
  baseRows.push(["Cost Baseline (BAC)", safeStr(summary.costBaseline ?? summary.totalBudget ?? ""), "", ""]);
  baseRows.push(["Management Reserve", safeStr(summary.managementReserve ?? ""), "", ""]);
  baseRows.push(["Budget at Completion (BAC)", safeStr(summary.totalBudget ?? ""), "", ""]);
  const baseWs = tableSheet(baseHeaders, baseRows);
  baseWs["!cols"] = cols([24, 20, 22, 16]);
  addFreezeRow(baseWs);
  XLSX.utils.book_append_sheet(wb, baseWs, "Budget Baseline");

  // Sheet 3: Funding Requirements
  const fundHeaders = ["Period", `Planned Expenditure (${currency})`, `Cumulative Expenditure (${currency})`, `Funding Required (${currency})`, `Cumulative Funding (${currency})`, "Approval Status"];
  const fundRows = (content.fundingRequirements ?? []).map((f: any) => [
    safeStr(f.period),
    safeStr(f.amount),
    safeStr(f.cumulativeAmount),
    safeStr(f.amount),
    safeStr(f.cumulativeAmount),
    safeStr(f.approvalStatus ?? "Pending"),
  ]);
  const fundWs = tableSheet(fundHeaders, fundRows);
  fundWs["!cols"] = cols([14, 22, 24, 22, 22, 18]);
  addFreezeRow(fundWs);
  XLSX.utils.book_append_sheet(wb, fundWs, "Funding Requirements");

  // Sheet 4: EVM Tracker (to be populated during execution)
  const evmHeaders = ["Period", `PV (${currency})`, `EV (${currency})`, `AC (${currency})`, `SV (${currency})`, `CV (${currency})`, "SPI", "CPI", `EAC (${currency})`, `ETC (${currency})`, `VAC (${currency})`, "TCPI", "Notes"];
  const bac = summary.totalBudget ?? summary.costBaseline ?? 0;
  const evmRows = (content.evmSetup?.plannedValueByPeriod ?? phases).slice(0, 12).map((p: any) => [
    safeStr(p.period ?? p.phase),
    safeStr(p.pv ?? p.plannedValue ?? ""),
    "", "", "", "", "", "", "", "", safeStr(bac), "", "",
  ]);
  const evmWs = tableSheet(evmHeaders, evmRows);
  evmWs["!cols"] = cols([12, 14, 14, 14, 14, 14, 10, 10, 14, 14, 14, 10, 24]);
  addFreezeRow(evmWs);
  XLSX.utils.book_append_sheet(wb, evmWs, "EVM Tracker");

  return wb;
}

// ── PMI RACI Matrix (pmi-raci) ────────────────────────────────────────────────
// 3 sheets: RACI Matrix, Team Directory, Communication Plan

function raciMatrix(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const activities = content.activities ?? [];
  const roles = content.roles ?? [];

  // Sheet 1: RACI Matrix
  if (!activities.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No data"]]), "RACI Matrix");
  } else {
    const roleSet: string[] = roles.length ? roles : Array.from(new Set<string>(activities.flatMap((a: any) => Object.keys(a.roles ?? {}))));
    const headers = ["Phase", "Deliverable / Activity", ...roleSet];
    const rows = activities.map((a: any) => [
      safeStr(a.phase ?? ""),
      safeStr(a.activity),
      ...roleSet.map((r) => safeStr(a.roles?.[r] ?? "—")),
    ]);
    // Totals row
    const totalsR = ["TOTALS", "Responsible (R)", ...roleSet.map((r) => activities.filter((a: any) => safeStr(a.roles?.[r]) === "R").length)];
    const totalsA = ["", "Accountable (A)", ...roleSet.map((r) => activities.filter((a: any) => safeStr(a.roles?.[r]) === "A").length)];
    const raciWs = tableSheet(headers, [...rows, [], totalsR, totalsA]);
    raciWs["!cols"] = cols([16, 36, ...roleSet.map(() => 12)]);
    addFreezeRow(raciWs);
    XLSX.utils.book_append_sheet(wb, raciWs, "RACI Matrix");
  }

  // Sheet 2: Team Directory
  const team = content.teamDirectory ?? [];
  const teamHeaders = ["ID", "Name", "Role", "Organization", "Email", "Phone", "Location", "Availability (%)", "Start Date", "End Date", "Reporting To", "Notes"];
  const teamRows = team.map((m: any) => [
    safeStr(m.id), safeStr(m.name), safeStr(m.role), safeStr(m.department ?? m.organization),
    safeStr(m.contact ?? m.email ?? ""), safeStr(m.phone ?? ""), safeStr(m.location ?? ""),
    safeStr(m.allocationPercent ?? ""), safeStr(m.startDate ?? ""), safeStr(m.endDate ?? ""),
    safeStr(m.reportingTo ?? ""), safeStr(m.notes ?? ""),
  ]);
  const teamWs = tableSheet(teamHeaders, teamRows);
  teamWs["!cols"] = cols([8, 22, 22, 20, 26, 16, 16, 14, 14, 14, 20, 24]);
  addFreezeRow(teamWs);
  XLSX.utils.book_append_sheet(wb, teamWs, "Team Directory");

  // Sheet 3: Communication Plan (PMBOK 10.2)
  const commItems = content.communicationItems ?? content.communication ?? [];
  const commHeaders = ["Communication Item", "Purpose", "Audience", "Format", "Frequency", "Responsible", "Delivery Method", "Notes"];
  // Pre-populate standard PM communications + project-specific ones
  const standardComms = [
    ["Weekly Status Report", "Inform stakeholders of progress", "Project Team, Sponsor", "Email / PPTX", "Weekly", "PM", "Email", ""],
    ["Steering Committee Update", "Executive governance", "Steering Committee, Sponsor", "PPTX", "Monthly", "PM", "Meeting", ""],
    ["Risk Review Meeting", "Review and update risk register", "PM, Tech Lead, Risk Owners", "XLSX", "Bi-weekly", "PM", "Meeting", ""],
    ["Change Control Board", "Approve/reject change requests", "CCB Members", "XLSX / Email", "As Needed", "PM", "Meeting", ""],
    ["Project Close Report", "Formal closure and lessons learned", "All Stakeholders", "PPTX", "End of Project", "PM", "Meeting", ""],
  ];
  const commRows = commItems.length
    ? commItems.map((c: any) => [safeStr(c.name ?? c.communication), safeStr(c.purpose), safeStr(c.audience), safeStr(c.format ?? ""), safeStr(c.frequency ?? ""), safeStr(c.owner ?? c.responsible ?? ""), safeStr(c.channel ?? c.deliveryMethod ?? ""), safeStr(c.notes ?? "")])
    : standardComms;
  const commWs = tableSheet(commHeaders, commRows);
  commWs["!cols"] = cols([30, 36, 30, 14, 14, 20, 18, 24]);
  addFreezeRow(commWs);
  XLSX.utils.book_append_sheet(wb, commWs, "Communication Plan");

  // Legend sheet
  const legend = XLSX.utils.aoa_to_sheet([
    ["Code", "Meaning", "Description"],
    ["R", "Responsible", "Does the work. Can have multiple R per row."],
    ["A", "Accountable", "Owns the outcome. Exactly ONE per row — no exceptions."],
    ["C", "Consulted", "Provides input before decisions. Two-way communication."],
    ["I", "Informed", "Notified of outcomes. One-way communication."],
    ["—", "Not involved", "No role in this activity."],
    ["", "", ""],
    ["RACI Rule", "Exactly one A per row. Highlight any violations in red."],
  ]);
  legend["!cols"] = cols([6, 16, 60]);
  XLSX.utils.book_append_sheet(wb, legend, "RACI Legend");

  return wb;
}

// ── PMI Change Log (pmi-changelog) ────────────────────────────────────────────
// 3 sheets: Change Log, Change Request Form, Impact Analysis Template

function changeLog(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const changes = content.changes ?? content.changeRequests ?? [];

  // Sheet 1: Change Log Master Register
  const clHeaders = [
    "CR #", "Date Raised", "Raised By", "Change Title", "Category", "Priority", "Description",
    "Justification", "Impact — Scope", "Impact — Schedule (days)", "Impact — Cost ($)",
    "Impact — Quality", "Impact — Risk", "Analysis Date", "Analyzed By",
    "Recommended Action", "CCB Decision", "Decision Date", "Decision By",
    "Implementation Status", "Implemented Date", "Baseline Updated", "Notes",
  ];
  const clRows = changes.map((c: any, i: number) => [
    safeStr(c.id ?? `CR-${String(i + 1).padStart(3, "0")}`),
    safeStr(c.dateRaised ?? c.date ?? ""),
    safeStr(c.raisedBy ?? c.requestedBy ?? ""),
    safeStr(c.title ?? c.description ?? ""),
    safeStr(c.category ?? "Scope"),
    safeStr(c.priority ?? "Medium"),
    safeStr(c.description ?? ""),
    safeStr(c.justification ?? ""),
    safeStr(c.scopeImpact ?? ""),
    safeStr(c.scheduleImpact ?? "0"),
    safeStr(c.costImpact ?? "0"),
    safeStr(c.qualityImpact ?? ""),
    safeStr(c.riskImpact ?? ""),
    safeStr(c.analysisDate ?? ""),
    safeStr(c.analyzedBy ?? ""),
    safeStr(c.recommendedAction ?? "Pending"),
    safeStr(c.ccbDecision ?? c.status ?? "Pending"),
    safeStr(c.decisionDate ?? ""),
    safeStr(c.decisionBy ?? ""),
    safeStr(c.implementationStatus ?? "Not Started"),
    safeStr(c.implementedDate ?? ""),
    safeStr(c.baselineUpdated ?? "No"),
    safeStr(c.notes ?? ""),
  ]);
  // Summary row
  const approved = changes.filter((c: any) => safeStr(c.ccbDecision ?? c.status).toLowerCase() === "approved").length;
  const rejected = changes.filter((c: any) => safeStr(c.ccbDecision ?? c.status).toLowerCase() === "rejected").length;
  const pending = changes.filter((c: any) => !["approved", "rejected"].includes(safeStr(c.ccbDecision ?? c.status).toLowerCase())).length;
  clRows.push([]);
  clRows.push(["SUMMARY", "", "", "", "", "", `Total: ${changes.length}`, "", "", "", "", "", "", "", "", "", `Approved: ${approved}  Rejected: ${rejected}  Pending: ${pending}`, "", "", "", "", "", ""]);
  const clWs = tableSheet(clHeaders, clRows);
  clWs["!cols"] = cols([8, 14, 20, 30, 14, 12, 40, 36, 28, 18, 16, 28, 28, 14, 20, 18, 14, 14, 20, 18, 16, 16, 30]);
  addFreezeRow(clWs);
  XLSX.utils.book_append_sheet(wb, clWs, "Change Log");

  // Sheet 2: Change Request Form (template)
  const formData = [
    ["PROJECT CHANGE REQUEST", ""],
    ["", ""],
    ["CR #:", "[Auto-generated]"],
    ["Date:", ""],
    ["Project Name:", ""],
    ["Project Phase:", ""],
    ["", ""],
    ["SECTION 1: CHANGE DESCRIPTION", ""],
    ["Change Title:", ""],
    ["Category:", "Scope / Schedule / Cost / Quality / Resource / Technical / Regulatory"],
    ["Priority:", "Critical / High / Medium / Low"],
    ["Description of Change:", ""],
    ["Justification / Business Case:", ""],
    ["", ""],
    ["SECTION 2: IMPACT ANALYSIS", ""],
    ["Schedule Impact:", "Increase / Decrease / No change — _____ days"],
    ["Cost Impact:", "Increase / Decrease / No change — $ _______"],
    ["Scope Impact:", ""],
    ["Quality Impact:", ""],
    ["Risk Impact:", ""],
    ["", ""],
    ["SECTION 3: RECOMMENDATION", ""],
    ["PM Recommendation:", "Approve / Reject / Defer"],
    ["Analysis Notes:", ""],
    ["", ""],
    ["SECTION 4: CCB DECISION", ""],
    ["Decision:", "Approved / Rejected / Deferred"],
    ["Decision Date:", ""],
    ["Approved By:", ""],
    ["Conditions / Notes:", ""],
    ["", ""],
    ["SECTION 5: IMPLEMENTATION", ""],
    ["Action Plan:", ""],
    ["Owner:", ""],
    ["Target Date:", ""],
    ["Status:", ""],
    ["Completion Date:", ""],
    ["Baseline Updated:", "Yes / No"],
  ];
  const formWs = XLSX.utils.aoa_to_sheet(formData);
  formWs["!cols"] = cols([28, 60]);
  XLSX.utils.book_append_sheet(wb, formWs, "CR Form Template");

  // Sheet 3: Impact Analysis Template
  const impactData = [
    ["CHANGE IMPACT ANALYSIS TEMPLATE", ""],
    ["CR #:", ""],
    ["Change Title:", ""],
    ["Requested By:", ""],
    ["", ""],
    ["SCOPE IMPACT", ""],
    ["WBS elements affected:", ""],
    ["Deliverables changed:", ""],
    ["Scope boundary changes:", ""],
    ["", ""],
    ["SCHEDULE IMPACT", ""],
    ["Activities delayed/added:", ""],
    ["Critical path impact:", ""],
    ["New project end date:", ""],
    ["", ""],
    ["COST IMPACT", ""],
    ["Additional labor hours:", ""],
    ["Additional material costs:", ""],
    ["Cost breakdown by WBS:", ""],
    ["", ""],
    ["RISK IMPACT", ""],
    ["New risks introduced:", ""],
    ["Existing risks affected:", ""],
    ["", ""],
    ["RECOMMENDATION", ""],
    ["PM Recommendation:", ""],
    ["Rationale:", ""],
    ["Alternatives considered:", ""],
    ["", ""],
    ["IMPLEMENTATION PLAN", ""],
    ["Steps:", ""],
    ["Owner:", ""],
    ["Timeline:", ""],
  ];
  const impactWs = XLSX.utils.aoa_to_sheet(impactData);
  impactWs["!cols"] = cols([28, 60]);
  XLSX.utils.book_append_sheet(wb, impactWs, "Impact Analysis");

  return wb;
}

// ── PMI Lessons Learned (pmi-close) ───────────────────────────────────────────
// 2 sheets: Lessons Learned Register, Summary Dashboard

function lessonsLearned(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const lessons = content.lessonsLearned ?? [];

  const llHeaders = [
    "LL #", "Date Captured", "Captured By", "Project Phase", "Knowledge Area",
    "Category", "Type", "Lesson Title", "Situation", "Action Taken",
    "Result", "Lesson", "Recommendation", "Applicability", "Impact Level",
    "Status", "OPA Update",
  ];
  const llRows = lessons.map((l: any, i: number) => [
    safeStr(l.id ?? `LL-${String(i + 1).padStart(3, "0")}`),
    safeStr(l.dateCaptured ?? ""),
    safeStr(l.capturedBy ?? ""),
    safeStr(l.phase ?? l.projectPhase ?? ""),
    safeStr(l.knowledgeArea ?? ""),
    safeStr(l.category ?? "Process"),
    safeStr(l.type ?? "Improvement"),
    safeStr(l.title ?? l.lesson?.slice(0, 50) ?? ""),
    safeStr(l.situation ?? ""),
    safeStr(l.actionTaken ?? ""),
    safeStr(l.result ?? ""),
    safeStr(l.lesson ?? l.description ?? ""),
    safeStr(l.recommendation ?? ""),
    safeStr(l.applicability ?? "All Projects"),
    safeStr(l.impact ?? l.impactLevel ?? "Medium"),
    safeStr(l.status ?? "Captured"),
    safeStr(l.opaUpdate ?? "No"),
  ]);
  const llWs = tableSheet(llHeaders, llRows);
  llWs["!cols"] = cols([8, 14, 20, 16, 22, 14, 14, 30, 36, 36, 30, 40, 36, 24, 14, 14, 12]);
  addFreezeRow(llWs);
  XLSX.utils.book_append_sheet(wb, llWs, "Lessons Learned");

  // Summary dashboard
  const successCount = lessons.filter((l: any) => safeStr(l.type).toLowerCase().includes("success")).length;
  const improveCount = lessons.length - successCount;
  const kaTally: Record<string, number> = {};
  lessons.forEach((l: any) => {
    const ka = safeStr(l.knowledgeArea || "Other");
    kaTally[ka] = (kaTally[ka] ?? 0) + 1;
  });
  const dashData: unknown[][] = [
    ["LESSONS LEARNED SUMMARY DASHBOARD", ""],
    ["", ""],
    ["Total Lessons Captured", lessons.length],
    ["Successes (do more)", successCount],
    ["Improvements (do differently)", improveCount],
    ["", ""],
    ["Knowledge Area", "Count"],
    ...Object.entries(kaTally).map(([ka, cnt]) => [ka, cnt]),
    ["", ""],
    ["High-Impact Lessons", ""],
    ...lessons.filter((l: any) => safeStr(l.impact ?? l.impactLevel).toLowerCase() === "high").slice(0, 5).map((l: any) => ["HIGH", safeStr(l.lesson ?? l.title)]),
  ];
  const dashWs = XLSX.utils.aoa_to_sheet(dashData);
  dashWs["!cols"] = cols([30, 50]);
  XLSX.utils.book_append_sheet(wb, dashWs, "Summary Dashboard");

  return wb;
}

// ── Existing builders (preserved) ─────────────────────────────────────────────

function raidRegister(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const riskHeaders = ["ID", "Category", "Statement (If→Then→Causing)", "Type", "Probability", "Impact", "Score", "Severity", "Strategy", "Response Actions", "Owner", "Status"];
  const riskWs = tableSheet(riskHeaders, (content.risks ?? []).map((r: any) => [
    safeStr(r.id), safeStr(r.category), safeStr(r.statement ?? r.description),
    safeStr(r.type ?? "Threat"), safeStr(r.probability), safeStr(r.impact),
    safeStr(r.riskScore ?? ""), safeStr(r.severity ?? ""),
    safeStr(r.strategy), Array.isArray(r.responseActions) ? r.responseActions.join("; ") : safeStr(r.responseActions ?? ""),
    safeStr(r.owner), safeStr(r.status),
  ]));
  riskWs["!cols"] = cols([8, 16, 55, 10, 12, 12, 10, 12, 18, 50, 20, 12]);
  addFreezeRow(riskWs);
  XLSX.utils.book_append_sheet(wb, riskWs, "Risks");

  const assumHeaders = ["ID", "Description", "Category", "Owner", "Validation Date", "Status", "Impact If Wrong"];
  const assumWs = tableSheet(assumHeaders, (content.assumptions ?? []).map((a: any) => [
    safeStr(a.id), safeStr(a.description), safeStr(a.category), safeStr(a.owner), safeStr(a.validationDate ?? ""), safeStr(a.status), safeStr(a.impactIfWrong ?? ""),
  ]));
  assumWs["!cols"] = cols([8, 44, 16, 20, 16, 12, 36]);
  addFreezeRow(assumWs);
  XLSX.utils.book_append_sheet(wb, assumWs, "Assumptions");

  const issueHeaders = ["ID", "Category", "Description", "Root Cause", "Severity", "Owner", "Resolution Plan", "Target Date", "Status"];
  const issueWs = tableSheet(issueHeaders, (content.issues ?? []).map((i: any) => [
    safeStr(i.id), safeStr(i.category ?? ""), safeStr(i.description), safeStr(i.rootCause ?? ""),
    safeStr(i.severity), safeStr(i.owner), safeStr(i.resolutionPlan ?? i.resolution), safeStr(i.targetResolutionDate ?? ""), safeStr(i.status),
  ]));
  issueWs["!cols"] = cols([8, 16, 40, 30, 12, 20, 36, 14, 14]);
  addFreezeRow(issueWs);
  XLSX.utils.book_append_sheet(wb, issueWs, "Issues");

  const depHeaders = ["ID", "Type", "Description", "Depends On", "Owner", "Expected Date", "Impact If Delayed", "Status"];
  const depWs = tableSheet(depHeaders, (content.dependencies ?? []).map((d: any) => [
    safeStr(d.id), safeStr(d.type ?? ""), safeStr(d.description), safeStr(d.dependsOn), safeStr(d.owner), safeStr(d.expectedDate ?? ""), safeStr(d.impactIfDelayed ?? ""), safeStr(d.status),
  ]));
  depWs["!cols"] = cols([8, 14, 40, 24, 20, 14, 36, 14]);
  addFreezeRow(depWs);
  XLSX.utils.book_append_sheet(wb, depWs, "Dependencies");

  return wb;
}

function milestonePlan(content: any): XLSX.WorkBook {
  return scheduleXlsx(content);
}

function stakeholderRegister(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["ID", "Name", "Title", "Organization", "Email", "Influence", "Interest", "Quadrant", "Current Engagement", "Desired Engagement", "Influence Strategy", "Communication Needs", "Notes"];
  const rows = (content.stakeholders ?? []).map((s: any) => [
    safeStr(s.id), safeStr(s.name), safeStr(s.title ?? s.role), safeStr(s.organization),
    safeStr(s.contact ?? s.email ?? ""), safeStr(s.power ?? s.influence), safeStr(s.interest),
    safeStr(s.quadrant ?? ""), safeStr(s.currentEngagement ?? s.engagementLevel ?? ""),
    safeStr(s.desiredEngagement ?? ""), safeStr(s.influenceStrategy ?? ""), safeStr(s.communicationNeeds ?? s.communicationPlan ?? ""), safeStr(s.notes ?? ""),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([8, 22, 22, 20, 26, 12, 12, 20, 18, 18, 36, 36, 24]);
  addFreezeRow(ws);
  XLSX.utils.book_append_sheet(wb, ws, "Stakeholder Register");

  // Influence-Interest Matrix
  const quadrants = ["Manage Closely", "Keep Satisfied", "Keep Informed", "Monitor"];
  const matrixData = [
    ["Influence\\Interest", "HIGH Interest", "LOW Interest"],
    ["HIGH Influence", "Manage Closely", "Keep Satisfied"],
    ["LOW Influence", "Keep Informed", "Monitor"],
    ["", "", ""],
    ["Stakeholder", "Quadrant", ""],
    ...(content.stakeholders ?? []).map((s: any) => [safeStr(s.name), safeStr(s.quadrant ?? "Monitor"), ""]),
  ];
  const matWs = XLSX.utils.aoa_to_sheet(matrixData);
  matWs["!cols"] = cols([20, 24, 22]);
  XLSX.utils.book_append_sheet(wb, matWs, "Influence-Interest Matrix");

  return wb;
}

function resourcePlan(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const resources = content.teamDirectory ?? content.resources ?? content.team ?? [];
  const headers = ["ID", "Name", "Role", "Department", "Skills", "Allocation %", "Start Date", "End Date", "Location", "Daily Rate", "Currency", "Notes"];
  const rows = resources.map((r: any) => [
    safeStr(r.id), safeStr(r.name), safeStr(r.role), safeStr(r.department ?? r.organization ?? ""),
    Array.isArray(r.skills) ? r.skills.join(", ") : safeStr(r.skills ?? ""),
    safeStr(r.allocationPercent ?? r.allocation ?? ""), safeStr(r.startDate ?? ""), safeStr(r.endDate ?? ""),
    safeStr(r.location ?? ""), safeStr(r.dailyRate ?? r.costPerMonth ?? r.rate ?? ""), safeStr(r.currency ?? "USD"), safeStr(r.notes ?? ""),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([8, 22, 22, 20, 36, 14, 14, 14, 16, 14, 10, 24]);
  addFreezeRow(ws);
  XLSX.utils.book_append_sheet(wb, ws, "Resource Plan");
  return wb;
}

function costPlan(content: any): XLSX.WorkBook {
  return budgetXlsx(content);
}

function genericLog(content: any, sheetName: string, keys: string[], headers: string[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const items = (Object.values(content)[0] as any[]) ?? [];
  const rows = items.map((item: any) => keys.map((k) => safeStr(item[k])));
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols(headers.map((h) => Math.min(Math.max(h.length + 4, 14), 40)));
  addFreezeRow(ws);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export function buildXlsx(artifactType: string, content: any): Buffer {
  let wb: XLSX.WorkBook;

  switch (artifactType) {
    case "risk_register":       wb = riskRegister(content); break;
    case "raid_register":       wb = raidRegister(content); break;
    case "wbs":                 wb = wbs(content); break;
    case "milestone_plan":
    case "schedule":            wb = scheduleXlsx(content); break;
    case "cost_plan":
    case "budget":              wb = budgetXlsx(content); break;
    case "stakeholder_register": wb = stakeholderRegister(content); break;
    case "raci_matrix":         wb = raciMatrix(content); break;
    case "resource_plan":       wb = resourcePlan(content); break;
    case "change_log":          wb = changeLog(content); break;
    case "close_report":
    case "lessons_learned":     wb = lessonsLearned(content); break;
    case "action_log":
      wb = genericLog(content, "Action Log",
        ["id","action","owner","dueDate","priority","status","notes"],
        ["ID","Action","Owner","Due Date","Priority","Status","Notes"]); break;
    case "issue_register":
      wb = genericLog(content, "Issue Register",
        ["id","description","severity","owner","resolution","status","dueDate"],
        ["ID","Description","Severity","Owner","Resolution","Status","Due Date"]); break;
    case "decision_log":
      wb = genericLog(content, "Decision Log",
        ["id","decision","rationale","madeBy","date","impact","status"],
        ["ID","Decision","Rationale","Made By","Date","Impact","Status"]); break;
    case "assumption_log":
      wb = genericLog(content, "Assumptions",
        ["id","description","category","owner","validationDate","status"],
        ["ID","Description","Category","Owner","Validation Date","Status"]); break;
    case "benefits_register":
      wb = genericLog(content, "Benefits",
        ["id","benefit","type","owner","measurementMethod","targetDate","status"],
        ["ID","Benefit","Type","Owner","Measurement Method","Target Date","Status"]); break;
    default: {
      wb = XLSX.utils.book_new();
      for (const [key, val] of Object.entries(content)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          const headers = Object.keys(val[0] as object);
          const rows = (val as any[]).map((item) => headers.map((h) => safeStr(item[h])));
          const ws = tableSheet(headers.map((h) => h.replace(/([A-Z])/g, " $1").trim()), rows);
          ws["!cols"] = cols(headers.map(() => 20));
          addFreezeRow(ws);
          XLSX.utils.book_append_sheet(wb, ws, key.slice(0, 31));
        }
      }
      if (!wb.SheetNames.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No structured data"]]), "Sheet1");
      }
    }
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
