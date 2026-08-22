/**
 * Advisory Engine — deterministic rule execution (C1/C2/C3/C4).
 * No language model is called here. Each rule emits AdvisoryCandidate objects
 * that are upserted into the Advisory table by the API routes.
 */

export interface AdvisoryCandidate {
  ruleId: string;
  pack: string;
  class: "c1" | "c2" | "c3" | "c4";
  severity: "s1" | "s2" | "s3" | "s4";
  provenance: "p1" | "p3";
  tab: string;
  objectType?: string;
  objectId?: string; // null = project-level finding; non-null = dedupe key
  statement: string;
  evidenceSummary: string;
  draftPayload?: Record<string, unknown> | null;
  rankScore: number;
}

export interface ProjectState {
  projectId: string;
  projectName: string;
  tasks: any[];
  risks: any[];
  issues: any[];
  costEntries: any[];
  budget?: number | null;
  currentPhase?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

const PI_NUM: Record<string, number> = { very_low: 2, low: 4, medium: 6, high: 8, very_high: 10 };
function riskScore(r: any) {
  return (PI_NUM[r.probability] ?? 3) * (PI_NUM[r.impact] ?? 3);
}

const RISK_CATEGORIES_L1 = ["technical", "external", "organizational", "project_management", "commercial"];

function normCat(c?: string | null): string {
  if (!c) return "";
  return c.toLowerCase().replace(/[\s/&-]+/g, "_");
}

function daysSince(d?: string | Date | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function hasStructure(desc: string): boolean {
  // A well-formed risk has at least 8 words and some connective tissue
  const words = desc.trim().split(/\s+/).length;
  return words >= 8;
}

// ── Risk pack (RA) ─────────────────────────────────────────────────────────────

function runRiskPack(state: ProjectState): AdvisoryCandidate[] {
  const { risks, tasks } = state;
  const out: AdvisoryCandidate[] = [];
  const openRisks = risks.filter(r => r.status === "open" || r.status === "in_progress");

  // RA-01 — Category coverage: at least one risk per L1 category
  const coveredCats = new Set(risks.map(r => normCat(r.category)));
  for (const cat of RISK_CATEGORIES_L1) {
    const covered = [...coveredCats].some(c => c.includes(cat.split("_")[0]));
    if (!covered) {
      out.push({
        ruleId: "RA-01",
        pack: "ra",
        class: "c1",
        severity: "s2",
        provenance: "p3",
        tab: "risk",
        objectId: `cat-${cat}`,
        objectType: "risk_category",
        statement: `No risk registered in the "${cat.replace(/_/g, " ")}" category.`,
        evidenceSummary: `PMBOK expects risks across all applicable L1 categories. ${cat.replace(/_/g, " ")} is uncovered.`,
        draftPayload: {
          category: cat,
          description: `[Describe a ${cat.replace(/_/g, " ")} risk for this project]`,
          _hint: "Category pre-filled. Complete description, probability, impact, owner, and mitigation.",
        },
        rankScore: 60,
      });
    }
  }

  // RA-04 — Critical-path task (last phase / zero-float) with no associated risk
  const lastPhase = tasks.length > 0
    ? [...new Set(tasks.map(t => t.phase))].sort().slice(-1)[0]
    : null;
  const criticalTasks = lastPhase ? tasks.filter(t => t.phase === lastPhase && t.status !== "complete") : [];
  if (criticalTasks.length > 0 && risks.length === 0) {
    out.push({
      ruleId: "RA-04",
      pack: "ra",
      class: "c1",
      severity: "s2",
      provenance: "p1",
      tab: "risk",
      objectId: "no-critical-path-risk",
      statement: `${criticalTasks.length} task(s) in the final phase "${lastPhase}" have no associated risks registered.`,
      evidenceSummary: `Schedule has ${tasks.length} tasks; risk register is empty. Critical-path exposure is unregistered.`,
      draftPayload: {
        category: "schedule",
        description: `[Identify a risk affecting the critical path in phase: ${lastPhase}]`,
      },
      rankScore: 70,
    });
  }

  // RA-08 — No vendor/external risk (check if any risk owner looks external or description mentions vendor/third)
  const hasExternalRisk = risks.some(r => {
    const cat = normCat(r.category);
    return cat.includes("external") || cat.includes("vendor") || cat.includes("supplier") ||
      (r.description ?? "").toLowerCase().match(/vendor|supplier|third.?party|contractor|partner/);
  });
  const hasExternalSignal = tasks.some(t => (t.owner ?? "").toLowerCase().match(/vendor|external|supplier|third/));
  if (!hasExternalRisk && (hasExternalSignal || risks.length > 3)) {
    out.push({
      ruleId: "RA-08",
      pack: "ra",
      class: "c3",
      severity: "s2",
      provenance: "p1",
      tab: "risk",
      objectId: "no-vendor-risk",
      statement: "No vendor, supplier, or third-party dependency risk is registered.",
      evidenceSummary: "PMBOK: external dependency risks should be registered when third parties appear in the schedule or RACI.",
      draftPayload: {
        category: "external",
        description: "If [a third-party vendor fails to deliver on time], then [dependent activities will be delayed], resulting in [milestone slippage and potential cost overrun].",
      },
      rankScore: 55,
    });
  }

  // RA-09 — Key-person concentration (one owner on >3 open risks)
  const ownerCounts: Record<string, number> = {};
  for (const r of openRisks) {
    if (r.owner) ownerCounts[r.owner] = (ownerCounts[r.owner] ?? 0) + 1;
  }
  for (const [owner, count] of Object.entries(ownerCounts)) {
    if (count > 3) {
      out.push({
        ruleId: "RA-09",
        pack: "ra",
        class: "c1",
        severity: "s2",
        provenance: "p1",
        tab: "risk",
        objectId: `kp-${owner}`,
        objectType: "risk_owner",
        statement: `"${owner}" is the owner of ${count} open risks — key-person concentration.`,
        evidenceSummary: `PMBOK: single-owner dependency across multiple high-exposure risks creates a coordination bottleneck.`,
        draftPayload: null,
        rankScore: 50,
      });
    }
  }

  // RA-13 — Risk description lacks cause→event→consequence structure
  for (const r of openRisks) {
    if (!hasStructure(r.description ?? "")) {
      out.push({
        ruleId: "RA-13",
        pack: "ra",
        class: "c2",
        severity: "s3",
        provenance: "p3",
        tab: "risk",
        objectId: r.id,
        objectType: "risk",
        statement: `Risk ${r.riskId ?? r.id.slice(0, 6)}: description is too brief — no cause, event, or consequence.`,
        evidenceSummary: `"${(r.description ?? "").slice(0, 60)}…" — PMBOK risk statements should follow: Because [cause], [event] may occur, resulting in [consequence].`,
        draftPayload: {
          description: `Because [cause], ${r.description ?? "this risk"} may occur, resulting in [consequence to project objectives].`,
        },
        rankScore: 30,
      });
    }
  }

  // RA-16 — Open risk with no mitigation
  for (const r of openRisks) {
    if (!r.mitigation || r.mitigation.trim().length < 5) {
      out.push({
        ruleId: "RA-16",
        pack: "ra",
        class: "c1",
        severity: "s2",
        provenance: "p1",
        tab: "risk",
        objectId: r.id,
        objectType: "risk",
        statement: `Risk ${r.riskId ?? r.id.slice(0, 6)}: no mitigation or response strategy defined.`,
        evidenceSummary: `Risk "${(r.description ?? "").slice(0, 50)}" is open with no response plan. PMBOK: every open risk must have a documented response strategy.`,
        draftPayload: {
          mitigation: "[Define the response strategy: Avoid / Transfer / Mitigate / Accept, with specific actions, owner, and due date]",
        },
        rankScore: 65,
      });
    }
  }

  // RA-20 — Risk with no owner
  for (const r of openRisks) {
    if (!r.owner || r.owner.trim() === "") {
      out.push({
        ruleId: "RA-20",
        pack: "ra",
        class: "c1",
        severity: "s2",
        provenance: "p1",
        tab: "risk",
        objectId: r.id,
        objectType: "risk",
        statement: `Risk ${r.riskId ?? r.id.slice(0, 6)}: no owner assigned.`,
        evidenceSummary: `"${(r.description ?? "").slice(0, 50)}" has no owner. Unowned risks are not monitored.`,
        draftPayload: { owner: "[Assign a named owner]" },
        rankScore: 60,
      });
    }
  }

  // RA-22 — High-score risk (≥36) with no mitigation
  for (const r of openRisks) {
    const sc = riskScore(r);
    if (sc >= 36 && (!r.mitigation || r.mitigation.trim().length < 5)) {
      // Skip if RA-16 already fired for this risk
      const already = out.find(o => o.ruleId === "RA-16" && o.objectId === r.id);
      if (!already) {
        out.push({
          ruleId: "RA-22",
          pack: "ra",
          class: "c1",
          severity: "s1",
          provenance: "p1",
          tab: "risk",
          objectId: r.id,
          objectType: "risk",
          statement: `High-score risk (${sc}/25): ${r.riskId ?? r.id.slice(0, 6)} has no mitigation plan.`,
          evidenceSummary: `Score ${sc} = ${r.probability} × ${r.impact}. High-exposure risks require an active response strategy.`,
          draftPayload: { mitigation: "[Define response — given high exposure, Avoid or Mitigate is recommended]" },
          rankScore: 90,
        });
      }
    }
  }

  // RA-25 — Risk not updated in >28 days
  for (const r of openRisks) {
    if (daysSince(r.updatedAt) > 28) {
      out.push({
        ruleId: "RA-25",
        pack: "ra",
        class: "c1",
        severity: "s3",
        provenance: "p1",
        tab: "risk",
        objectId: r.id,
        objectType: "risk",
        statement: `Risk ${r.riskId ?? r.id.slice(0, 6)}: not reviewed for ${daysSince(r.updatedAt)} days.`,
        evidenceSummary: `Last updated: ${r.updatedAt ? new Date(r.updatedAt).toISOString().slice(0, 10) : "unknown"}. PMBOK: risks should be reviewed at each reporting cycle.`,
        draftPayload: null,
        rankScore: 25,
      });
    }
  }

  return out;
}

// ── Schedule pack (SCH) ────────────────────────────────────────────────────────

function runSchedulePack(state: ProjectState): AdvisoryCandidate[] {
  const { tasks } = state;
  const out: AdvisoryCandidate[] = [];
  if (tasks.length === 0) return out;

  // SCH-02 — Tasks with no start or end date
  for (const t of tasks) {
    if (!t.baselineStart || !t.baselineFinish) {
      out.push({
        ruleId: "SCH-02",
        pack: "sch",
        class: "c1",
        severity: "s2",
        provenance: "p1",
        tab: "schedule",
        objectId: t.id,
        objectType: "task",
        statement: `Task "${t.name}" has no baseline start or finish date.`,
        evidenceSummary: `WBS: ${t.wbsCode ?? "—"} · Phase: ${t.phase}. Tasks without dates cannot be scheduled or tracked.`,
        draftPayload: null,
        rankScore: 70,
      });
    }
  }

  // SCH-04 — Tasks with no owner
  const tasksNoOwner = tasks.filter(t => !t.owner || t.owner.trim() === "");
  if (tasksNoOwner.length > 0) {
    out.push({
      ruleId: "SCH-04",
      pack: "sch",
      class: "c2",
      severity: "s3",
      provenance: "p1",
      tab: "schedule",
      objectId: "tasks-no-owner",
      statement: `${tasksNoOwner.length} task(s) have no owner assigned.`,
      evidenceSummary: `Unowned tasks: ${tasksNoOwner.slice(0, 3).map(t => t.name).join(", ")}${tasksNoOwner.length > 3 ? ` +${tasksNoOwner.length - 3} more` : ""}.`,
      draftPayload: null,
      rankScore: 30,
    });
  }

  // SCH-12 — Task where finish is before start (infeasible)
  for (const t of tasks) {
    if (t.baselineStart && t.baselineFinish) {
      const s = new Date(t.baselineStart).getTime();
      const f = new Date(t.baselineFinish).getTime();
      if (f < s) {
        out.push({
          ruleId: "SCH-12",
          pack: "sch",
          class: "c2",
          severity: "s1",
          provenance: "p1",
          tab: "schedule",
          objectId: t.id,
          objectType: "task",
          statement: `Task "${t.name}" has finish date before start date — infeasible schedule.`,
          evidenceSummary: `Start: ${new Date(t.baselineStart).toISOString().slice(0, 10)} · Finish: ${new Date(t.baselineFinish).toISOString().slice(0, 10)}.`,
          draftPayload: null,
          rankScore: 95,
        });
      }
    }
  }

  // SCH-09 — Tasks in execution with 0% complete but past their finish date
  const today = Date.now();
  const overdue = tasks.filter(t =>
    t.baselineFinish &&
    new Date(t.baselineFinish).getTime() < today &&
    t.percentComplete < 100 &&
    t.status !== "complete"
  );
  if (overdue.length > 0) {
    out.push({
      ruleId: "SCH-09",
      pack: "sch",
      class: "c3",
      severity: "s2",
      provenance: "p1",
      tab: "schedule",
      objectId: "overdue-tasks",
      statement: `${overdue.length} task(s) are past their baseline finish date and not yet complete.`,
      evidenceSummary: `Overdue: ${overdue.slice(0, 3).map(t => t.name).join(", ")}${overdue.length > 3 ? ` +${overdue.length - 3} more` : ""}. Schedule variance is accumulating without a recovery plan.`,
      draftPayload: null,
      rankScore: 75,
    });
  }

  return out;
}

// ── Cost pack (BUD) ────────────────────────────────────────────────────────────

function runCostPack(state: ProjectState): AdvisoryCandidate[] {
  const { tasks, costEntries, budget } = state;
  const out: AdvisoryCandidate[] = [];

  // BUD-01 — No cost entries at all while tasks exist
  if (tasks.length > 0 && costEntries.length === 0) {
    out.push({
      ruleId: "BUD-01",
      pack: "bud",
      class: "c1",
      severity: "s2",
      provenance: "p1",
      tab: "cost",
      objectId: "no-cost-entries",
      statement: "No actual costs have been logged against this project.",
      evidenceSummary: `${tasks.length} tasks exist in the schedule but zero cost entries are recorded. EVM metrics (AC, CPI) cannot be computed.`,
      draftPayload: null,
      rankScore: 60,
    });
  }

  // BUD-03 — Budget set but no costs logged
  if (budget && budget > 0 && costEntries.length === 0) {
    out.push({
      ruleId: "BUD-03",
      pack: "bud",
      class: "c3",
      severity: "s2",
      provenance: "p1",
      tab: "cost",
      objectId: "budget-no-actuals",
      statement: `Budget of ${budget.toLocaleString()} is set but no actual costs are recorded.`,
      evidenceSummary: "A budget baseline without actuals means CPI and EAC cannot be computed. Start logging costs to track performance.",
      draftPayload: null,
      rankScore: 55,
    });
  }

  // BUD-05 — Tasks with plannedCost > 0 but no cost entries in that period
  const tasksWithCost = tasks.filter(t => t.plannedCost && t.plannedCost > 0);
  const totalAC = costEntries.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  if (tasksWithCost.length > 0 && totalAC === 0) {
    out.push({
      ruleId: "BUD-05",
      pack: "bud",
      class: "c3",
      severity: "s2",
      provenance: "p1",
      tab: "cost",
      objectId: "planned-cost-no-actuals",
      statement: `${tasksWithCost.length} task(s) have planned cost but no actuals are logged.`,
      evidenceSummary: `Total planned cost: ${tasksWithCost.reduce((s, t) => s + t.plannedCost, 0).toLocaleString()}. Without actuals the cost baseline cannot be tracked.`,
      draftPayload: null,
      rankScore: 50,
    });
  }

  return out;
}

// ── Issues pack (ISS) ──────────────────────────────────────────────────────────

function runIssuesPack(state: ProjectState): AdvisoryCandidate[] {
  const { issues, risks } = state;
  const out: AdvisoryCandidate[] = [];
  const openIssues = issues.filter(i => i.status === "open" || i.status === "in_progress");

  // ISS — Issue open >14 days with no resolution plan
  for (const iss of openIssues) {
    const age = daysSince(iss.createdAt);
    if (age > 14 && (!iss.resolution || iss.resolution.trim().length < 5)) {
      out.push({
        ruleId: "ISS-01",
        pack: "iss",
        class: "c2",
        severity: "s2",
        provenance: "p1",
        tab: "issues",
        objectId: iss.id,
        objectType: "issue",
        statement: `Issue ${iss.issueId ?? iss.id.slice(0, 6)} has been open ${age} days with no resolution plan.`,
        evidenceSummary: `"${(iss.description ?? "").slice(0, 60)}" — opened ${age} days ago. PMBOK: issues older than 2 weeks without a plan indicate escalation risk.`,
        draftPayload: { resolution: "[Define resolution approach, owner, and target date]" },
        rankScore: 60,
      });
    }
  }

  // ISS — Issue with no owner
  for (const iss of openIssues) {
    if (!iss.owner || iss.owner.trim() === "") {
      out.push({
        ruleId: "ISS-02",
        pack: "iss",
        class: "c1",
        severity: "s3",
        provenance: "p1",
        tab: "issues",
        objectId: iss.id,
        objectType: "issue",
        statement: `Issue ${iss.issueId ?? iss.id.slice(0, 6)}: no owner assigned.`,
        evidenceSummary: `"${(iss.description ?? "").slice(0, 50)}" has no owner. Unowned issues are not progressed.`,
        draftPayload: { owner: "[Assign a named owner]" },
        rankScore: 40,
      });
    }
  }

  return out;
}

// ── Cross-artifact pack (XAR) ──────────────────────────────────────────────────

function runCrossArtifactPack(state: ProjectState): AdvisoryCandidate[] {
  const { risks, issues, tasks } = state;
  const out: AdvisoryCandidate[] = [];

  // XAR-09 — Issue open with no linkage to a risk (heuristic: issue description not mentioned in any risk)
  const openIssues = issues.filter(i => i.status === "open" || i.status === "in_progress");
  const criticalIssues = openIssues.filter(i => i.severity === "critical" || i.severity === "high");
  const riskDescriptions = risks.map(r => (r.description ?? "").toLowerCase());

  for (const iss of criticalIssues) {
    const issWords = (iss.description ?? "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
    const linked = issWords.some((w: string) => riskDescriptions.some((rd: string) => rd.includes(w)));
    const age = daysSince(iss.createdAt);
    if (!linked && age > 7) {
      out.push({
        ruleId: "XAR-09",
        pack: "xar",
        class: "c3",
        severity: "s2",
        provenance: "p1",
        tab: "issues",
        objectId: iss.id,
        objectType: "issue",
        statement: `${iss.severity === "critical" ? "Critical" : "High"} issue ${iss.issueId ?? iss.id.slice(0, 6)} has no corresponding risk registered.`,
        evidenceSummary: `"${(iss.description ?? "").slice(0, 60)}" — open ${age} days. XAR-09: issues should trace to a risk or trigger a new risk entry.`,
        draftPayload: {
          category: "project_management",
          description: `Because the issue "${(iss.description ?? "").slice(0, 40)}" has occurred, [describe the ongoing risk], which may result in [further impact if unresolved].`,
        },
        rankScore: 65,
      });
    }
  }

  // XAR-05 — Same owner on >3 risks AND >3 issues (overload)
  const riskOwnerCounts: Record<string, number> = {};
  const issueOwnerCounts: Record<string, number> = {};
  for (const r of risks.filter(r => r.status === "open")) {
    if (r.owner) riskOwnerCounts[r.owner] = (riskOwnerCounts[r.owner] ?? 0) + 1;
  }
  for (const i of issues.filter(i => i.status === "open")) {
    if (i.owner) issueOwnerCounts[i.owner] = (issueOwnerCounts[i.owner] ?? 0) + 1;
  }
  for (const owner of Object.keys(riskOwnerCounts)) {
    if ((riskOwnerCounts[owner] ?? 0) > 2 && (issueOwnerCounts[owner] ?? 0) > 2) {
      out.push({
        ruleId: "XAR-05",
        pack: "xar",
        class: "c3",
        severity: "s2",
        provenance: "p1",
        tab: "risk",
        objectId: `overload-${owner}`,
        statement: `"${owner}" owns ${riskOwnerCounts[owner]} open risks and ${issueOwnerCounts[owner]} open issues — potential overload.`,
        evidenceSummary: "XAR-05: Key-person dependency across both risk and issue registers may affect response quality and timeliness.",
        draftPayload: null,
        rankScore: 50,
      });
    }
  }

  // XAR — No schedule tasks but risks exist (plan/execution gap)
  if (tasks.length === 0 && risks.length > 0) {
    out.push({
      ruleId: "XAR-02",
      pack: "xar",
      class: "c3",
      severity: "s2",
      provenance: "p1",
      tab: "schedule",
      objectId: "no-schedule-with-risks",
      statement: "Risks are registered but no schedule exists — risk response activities cannot be tracked.",
      evidenceSummary: "XAR: Risk response actions that have schedule or cost implications require corresponding schedule activities and cost provisions.",
      draftPayload: null,
      rankScore: 55,
    });
  }

  return out;
}

// ── Main entry point ───────────────────────────────────────────────────────────

export function runAdvisoryEngine(
  state: ProjectState,
  packs: ("ra" | "sch" | "bud" | "iss" | "xar")[] = ["ra", "sch", "bud", "iss", "xar"]
): AdvisoryCandidate[] {
  const all: AdvisoryCandidate[] = [];

  if (packs.includes("ra"))  all.push(...runRiskPack(state));
  if (packs.includes("sch")) all.push(...runSchedulePack(state));
  if (packs.includes("bud")) all.push(...runCostPack(state));
  if (packs.includes("iss")) all.push(...runIssuesPack(state));
  if (packs.includes("xar")) all.push(...runCrossArtifactPack(state));

  // Sort by rankScore descending
  return all.sort((a, b) => b.rankScore - a.rankScore);
}

// ── Advisory budget (max 15/project, max 5/tab) ────────────────────────────────

export function applyBudget(
  candidates: AdvisoryCandidate[],
  existingOpenCounts: Record<string, number> // tab → count of already-open advisories
): AdvisoryCandidate[] {
  const tabCounts: Record<string, number> = { ...existingOpenCounts };
  let projectTotal = Object.values(tabCounts).reduce((s, v) => s + v, 0);
  const admitted: AdvisoryCandidate[] = [];

  for (const c of candidates) {
    const tabCount = tabCounts[c.tab] ?? 0;
    // S1 items bypass the cap
    if (c.severity === "s1") {
      admitted.push(c);
      tabCounts[c.tab] = tabCount + 1;
      projectTotal++;
      continue;
    }
    if (tabCount >= 5) continue;      // per-tab cap
    if (projectTotal >= 15) continue; // per-project cap
    admitted.push(c);
    tabCounts[c.tab] = tabCount + 1;
    projectTotal++;
  }

  return admitted;
}
