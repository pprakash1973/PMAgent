import * as XLSX from "xlsx";

function cols(widths: number[]) {
  return widths.map((w) => ({ wch: w }));
}

function tableSheet(headers: string[], rows: unknown[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  return ws;
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── per-artifact builders ─────────────────────────────────────────────────────

function riskRegister(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const risks = content.risks ?? [];
  const headers = ["ID", "Description", "Category", "Probability", "Impact", "Risk Score", "Owner", "Mitigation", "Status", "Due Date"];
  const rows = risks.map((r: any) => [
    safeStr(r.id), safeStr(r.description), safeStr(r.category),
    safeStr(r.probability), safeStr(r.impact), safeStr(r.riskScore),
    safeStr(r.owner), safeStr(r.mitigation), safeStr(r.status), safeStr(r.dueDate),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([8, 40, 16, 14, 12, 12, 20, 40, 12, 14]);
  XLSX.utils.book_append_sheet(wb, ws, "Risk Register");
  return wb;
}

function raidRegister(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const riskHeaders = ["ID", "Description", "Category", "Probability", "Impact", "Owner", "Mitigation", "Status"];
  const riskWs = tableSheet(riskHeaders, (content.risks ?? []).map((r: any) => [
    safeStr(r.id), safeStr(r.description), safeStr(r.category),
    safeStr(r.probability), safeStr(r.impact), safeStr(r.owner), safeStr(r.mitigation), safeStr(r.status),
  ]));
  riskWs["!cols"] = cols([8, 36, 16, 14, 12, 20, 36, 12]);
  XLSX.utils.book_append_sheet(wb, riskWs, "Risks");

  const assumHeaders = ["ID", "Description", "Owner", "Status"];
  const assumWs = tableSheet(assumHeaders, (content.assumptions ?? []).map((a: any) => [
    safeStr(a.id), safeStr(a.description), safeStr(a.owner), safeStr(a.status),
  ]));
  assumWs["!cols"] = cols([8, 44, 20, 14]);
  XLSX.utils.book_append_sheet(wb, assumWs, "Assumptions");

  const issueHeaders = ["ID", "Description", "Severity", "Owner", "Resolution", "Status"];
  const issueWs = tableSheet(issueHeaders, (content.issues ?? []).map((i: any) => [
    safeStr(i.id), safeStr(i.description), safeStr(i.severity), safeStr(i.owner), safeStr(i.resolution), safeStr(i.status),
  ]));
  issueWs["!cols"] = cols([8, 40, 12, 20, 36, 12]);
  XLSX.utils.book_append_sheet(wb, issueWs, "Issues");

  const depHeaders = ["ID", "Description", "Depends On", "Owner", "Status"];
  const depWs = tableSheet(depHeaders, (content.dependencies ?? []).map((d: any) => [
    safeStr(d.id), safeStr(d.description), safeStr(d.dependsOn), safeStr(d.owner), safeStr(d.status),
  ]));
  depWs["!cols"] = cols([8, 40, 20, 20, 14]);
  XLSX.utils.book_append_sheet(wb, depWs, "Dependencies");

  return wb;
}

function wbs(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["Phase", "Deliverable ID", "Deliverable", "Work Package ID", "Work Package", "Est. Days", "Owner"];
  const rows: unknown[][] = [];
  for (const phase of content.phases ?? []) {
    for (const del of phase.deliverables ?? []) {
      if (!del.workPackages?.length) {
        rows.push([safeStr(phase.name), safeStr(del.id), safeStr(del.name), "", "", "", ""]);
      } else {
        for (const wp of del.workPackages) {
          rows.push([safeStr(phase.name), safeStr(del.id), safeStr(del.name), safeStr(wp.id), safeStr(wp.name), safeStr(wp.estimatedDays), safeStr(wp.owner)]);
        }
      }
    }
  }
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([18, 14, 30, 16, 34, 12, 20]);
  XLSX.utils.book_append_sheet(wb, ws, "WBS");
  return wb;
}

function milestonePlan(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["ID", "Milestone", "Description", "Due Date", "Owner", "Status", "Deliverables", "Dependencies"];
  const rows = (content.milestones ?? []).map((m: any) => [
    safeStr(m.id), safeStr(m.name), safeStr(m.description), safeStr(m.dueDate),
    safeStr(m.owner), safeStr(m.status),
    Array.isArray(m.deliverables) ? m.deliverables.join(", ") : safeStr(m.deliverables),
    Array.isArray(m.dependencies) ? m.dependencies.join(", ") : safeStr(m.dependencies),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([8, 28, 36, 14, 18, 12, 30, 20]);
  XLSX.utils.book_append_sheet(wb, ws, "Milestone Plan");
  return wb;
}

function stakeholderRegister(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["ID", "Name", "Organization", "Role", "Interest", "Influence", "Engagement Level", "Communication Plan", "Notes"];
  const rows = (content.stakeholders ?? []).map((s: any) => [
    safeStr(s.id), safeStr(s.name), safeStr(s.organization), safeStr(s.role),
    safeStr(s.interest), safeStr(s.influence), safeStr(s.engagementLevel),
    safeStr(s.communicationPlan), safeStr(s.notes),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([6, 22, 20, 20, 22, 12, 16, 36, 24]);
  XLSX.utils.book_append_sheet(wb, ws, "Stakeholders");
  return wb;
}

function raciMatrix(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const activities = content.activities ?? [];
  if (!activities.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No data"]]), "RACI");
    return wb;
  }
  const roleSet = new Set<string>();
  for (const a of activities) Object.keys(a.roles ?? {}).forEach((r) => roleSet.add(r));
  const roles = Array.from(roleSet);
  const headers = ["Activity", ...roles];
  const rows = activities.map((a: any) => [safeStr(a.activity), ...roles.map((r) => safeStr(a.roles?.[r] ?? ""))]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([36, ...roles.map(() => 14)]);
  XLSX.utils.book_append_sheet(wb, ws, "RACI Matrix");

  // Legend
  const legend = XLSX.utils.aoa_to_sheet([
    ["Code", "Meaning"],
    ["R", "Responsible — does the work"],
    ["A", "Accountable — approves / owns outcome"],
    ["C", "Consulted — provides input"],
    ["I", "Informed — kept in the loop"],
  ]);
  legend["!cols"] = cols([8, 36]);
  XLSX.utils.book_append_sheet(wb, legend, "Legend");
  return wb;
}

function genericLog(content: any, sheetName: string, keys: string[], headers: string[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const items = (Object.values(content)[0] as any[]) ?? [];
  const rows = items.map((item: any) => keys.map((k) => safeStr(item[k])));
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols(headers.map((h) => Math.min(Math.max(h.length + 4, 14), 40)));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

function resourcePlan(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const resources = content.resources ?? content.team ?? [];
  const headers = ["Name", "Role", "Allocation %", "Start Date", "End Date", "Cost / Month", "Skills", "Notes"];
  const rows = resources.map((r: any) => [
    safeStr(r.name), safeStr(r.role), safeStr(r.allocation ?? r.allocationPercent),
    safeStr(r.startDate), safeStr(r.endDate), safeStr(r.costPerMonth ?? r.rate),
    Array.isArray(r.skills) ? r.skills.join(", ") : safeStr(r.skills), safeStr(r.notes),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([22, 22, 14, 14, 14, 16, 30, 24]);
  XLSX.utils.book_append_sheet(wb, ws, "Resource Plan");
  return wb;
}

function costPlan(content: any): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  // Try multiple possible structures
  const items = content.costItems ?? content.costs ?? content.budget?.items ?? [];
  const headers = ["Category", "Description", "Quantity", "Unit Cost", "Total Cost", "Phase", "Notes"];
  const rows = items.map((c: any) => [
    safeStr(c.category), safeStr(c.description), safeStr(c.quantity),
    safeStr(c.unitCost ?? c.rate), safeStr(c.totalCost ?? c.total),
    safeStr(c.phase), safeStr(c.notes),
  ]);
  const ws = tableSheet(headers, rows);
  ws["!cols"] = cols([18, 30, 10, 14, 14, 16, 24]);
  XLSX.utils.book_append_sheet(wb, ws, "Cost Plan");
  return wb;
}

// ── main dispatcher ───────────────────────────────────────────────────────────

export function buildXlsx(artifactType: string, content: any): Buffer {
  let wb: XLSX.WorkBook;

  switch (artifactType) {
    case "risk_register":      wb = riskRegister(content); break;
    case "raid_register":      wb = raidRegister(content); break;
    case "wbs":                wb = wbs(content); break;
    case "milestone_plan":     wb = milestonePlan(content); break;
    case "stakeholder_register": wb = stakeholderRegister(content); break;
    case "raci_matrix":        wb = raciMatrix(content); break;
    case "resource_plan":      wb = resourcePlan(content); break;
    case "cost_plan":          wb = costPlan(content); break;
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
      // Generic fallback — dump all top-level arrays as sheets
      wb = XLSX.utils.book_new();
      for (const [key, val] of Object.entries(content)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          const headers = Object.keys(val[0] as object);
          const rows = (val as any[]).map((item) => headers.map((h) => safeStr(item[h])));
          const ws = tableSheet(headers.map((h) => h.replace(/([A-Z])/g, " $1").trim()), rows);
          ws["!cols"] = cols(headers.map(() => 20));
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
