/**
 * PM Agent System Guardrails v1.0
 * Enforces GR-1 through GR-12 before any artifact is generated.
 * All BLOCKING guardrails throw GuardrailError; WARN guardrails return warnings.
 */

export class GuardrailError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "GuardrailError";
  }
}

// ── Artifact dependency map (GR-4) ─────────────────────────────────────────

const UPSTREAM_REQUIRED: Record<string, string[]> = {
  wbs:                ["project_charter", "scope_statement"],
  milestone_plan:     ["wbs", "project_charter"],
  resource_plan:      ["wbs"],
  cost_plan:          ["wbs"],
  risk_register:      ["project_charter", "scope_statement", "wbs"],
  raid_register:      ["project_charter"],
  quality_plan:       ["scope_statement", "wbs"],
  raci_matrix:        ["wbs", "resource_plan"],
  communication_plan: ["stakeholder_register"],
  weekly_status:      ["project_charter"],
  monthly_status:     ["project_charter"],
  change_log:         ["project_charter"],
  lessons_learned:    ["project_charter"],
  closure_report:       ["project_charter", "milestone_plan"],
  traceability_matrix:  ["project_charter", "wbs", "milestone_plan"],
};

// Mandatory project fields per artifact type (GR-2)
const MANDATORY_FIELDS: Record<string, { field: keyof ProjectSnapshot; label: string }[]> = {
  project_charter:    [
    { field: "description", label: "project description / business case" },
    { field: "endDate",     label: "target timeline (end date)" },
  ],
  wbs:                [{ field: "description", label: "scope / deliverables" }],
  milestone_plan:     [{ field: "startDate", label: "start date" }, { field: "endDate", label: "end date" }],
  cost_plan:          [{ field: "budget", label: "budget" }],
  weekly_status:      [{ field: "startDate", label: "project start date" }],
  monthly_status:     [{ field: "startDate", label: "project start date" }],
  closure_report:     [{ field: "endDate", label: "planned end date" }],
};

// Status/dashboard artifacts require a baseline to report against (GR-4)
const REQUIRES_BASELINE: Set<string> = new Set([
  "weekly_status", "monthly_status", "change_log",
]);

export interface ProjectSnapshot {
  name?: string | null;
  description?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  budget?: number | null;
  existingArtifactTypes?: string[];   // already-generated artifact types for this project
  hasRequirementsDoc?: boolean;        // confirmed requirements doc uploaded
  milestoneCount?: number;
  riskCount?: number;
}

export interface GuardrailResult {
  pass: boolean;
  warnings: string[];
  error?: string;
  code?: string;
}

/**
 * Run all applicable guardrails for the requested artifact type.
 * Throws GuardrailError on any BLOCKING violation.
 * Returns warnings for WARN-level issues.
 */
export function runGuardrails(
  artifactType: string,
  project: ProjectSnapshot
): GuardrailResult {
  const warnings: string[] = [];
  const existing = new Set(project.existingArtifactTypes ?? []);

  // ── GR-1: Input Sufficiency ─────────────────────────────────────────────────
  const hasDescription = project.description && project.description.trim().length > 20;
  const hasRequirements = project.hasRequirementsDoc;
  const hasMinScope = project.name && project.startDate && project.endDate;

  if (!hasDescription && !hasRequirements) {
    throw new GuardrailError(
      "ERR-INIT-001",
      "ERROR: There is no sufficient information to initiate the project. " +
      "Provide an SRS, requirements document, project scope, or SOW to proceed."
    );
  }

  // ── GR-2: Mandatory fields ──────────────────────────────────────────────────
  const mandatory = MANDATORY_FIELDS[artifactType] ?? [];
  const missing = mandatory
    .filter(({ field }) => !project[field])
    .map(({ label }) => label);

  if (missing.length > 0) {
    throw new GuardrailError(
      "ERR-DATA-002",
      `ERROR: Missing mandatory inputs for ${artifactType.replace(/_/g, " ")}: ` +
      `${missing.join(", ")}. Cannot generate a reliable deliverable.`
    );
  }

  // ── GR-4: Prerequisite artifact sequence ────────────────────────────────────
  const upstream = UPSTREAM_REQUIRED[artifactType] ?? [];
  // Require at least one upstream; allow flexibility (don't require ALL)
  if (upstream.length > 0 && !upstream.some((u) => existing.has(u))) {
    const prereq = upstream.join(" or ");
    throw new GuardrailError(
      "ERR-SEQ-003",
      `ERROR: Prerequisite artifact missing. Generate/provide ${prereq} ` +
      `before requesting ${artifactType.replace(/_/g, " ")}.`
    );
  }

  // ── GR-4 extension: Baseline required for status/dashboard ─────────────────
  if (REQUIRES_BASELINE.has(artifactType) && !hasMinScope) {
    warnings.push(
      "WARN: Project has no start/end date baseline. Status report accuracy may be limited."
    );
  }

  // ── GR-5: Traceability matrix requires a requirements document ───────────────
  if (artifactType === "traceability_matrix" && !project.hasRequirementsDoc) {
    throw new GuardrailError(
      "ERR-REQ-005",
      "ERROR: Requirements Traceability Matrix requires an uploaded requirements document (SRS, BRD, or SOW). " +
      "Upload a requirements document in the Requirements tab first."
    );
  }

  // ── GR-8: Budget required for cost artifacts ────────────────────────────────
  if (artifactType === "cost_plan" && !project.budget) {
    throw new GuardrailError(
      "ERR-EST-004",
      "ERROR: Estimate basis not provided. Specify a budget figure and estimation " +
      "method (analogous/parametric/bottom-up) to generate a cost plan."
    );
  }

  // ── GR-9: Change log warning without baseline artifacts ────────────────────
  if (artifactType === "change_log" && !existing.has("project_charter")) {
    warnings.push(
      "WARN-CHG-006: No baseline charter on record. Log each change request with an impact statement — do not silently overwrite the baseline."
    );
  }

  return { pass: true, warnings };
}

/**
 * Guardrail system prompt addendum — injected into every AI call.
 * Inlines the key rules so the model self-enforces them in generated content.
 */
export const GUARDRAIL_SYSTEM_ADDENDUM = `
## ACTIVE SYSTEM GUARDRAILS (non-negotiable — enforce in every response)

GR-3 NO FABRICATED DATA: Never invent client names, dates, costs, metrics, or completion percentages not present in the provided context. Where data is missing, mark explicitly as [ASSUMPTION: <description>] or <TBD – confirm with sponsor>. Fabricated data is a defect, not a draft.

GR-7 STANDARDS COMPLIANCE: Map every artifact to its governing PMBOK process (e.g., "per PMBOK 6th Ed 4.1"). CXO decks follow McKinsey-style: one message per slide, action titles, data-backed.

GR-8 ESTIMATE INTEGRITY: Every cost/duration/effort estimate must state its basis: analogous | parametric | three-point | bottom-up. Single-point estimates require a confidence range. Contingency and management reserves are visible line items — never buried.

GR-9 CHANGE CONTROL: Do not silently modify a baseline figure. If generating content that updates scope/schedule/budget from a prior baseline, flag the delta as [CHANGE: <description of delta>] and note it requires CCB approval.

GR-10 OUTPUT QUALITY: Before finalising:
  1. All mandatory sections populated — no empty headings.
  2. Internal consistency: dates align; totals reconcile; RACI has exactly one A per activity.
  3. All [ASSUMPTION] and <TBD> items summarised at the end of your JSON in an "assumptions" array.

GR-11 HONEST STATUS: RAG status derives from stated thresholds (SPI/CPI bands), not preference. Do not green-wash. If SPI < 0.85 or CPI < 0.9, status MUST be amber or red. If asked to make a red project green without data supporting it, respond: DECLINED: Status is derived from reported data. I can add a path-to-green narrative instead.

GR-12 AMBIGUITY: If inputs conflict (e.g. two different end dates), surface the conflict in an "conflicts" array in your JSON and ask which source is authoritative — never silently pick one.`;
