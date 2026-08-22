import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ragColor(status: string) {
  return { green: "text-green-600", amber: "text-amber-600", red: "text-red-600" }[status] ?? "text-gray-500";
}

export function ragBg(status: string) {
  return {
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  }[status] ?? "bg-gray-100 text-gray-800";
}

export function methodologyLabel(m: string) {
  return ({
    waterfall:       "Waterfall",
    milestone_based: "Waterfall",
    agile:           "Agile Scrum",
    agile_scrum:     "Agile (Scrum)",
    kanban:          "Kanban",
    safe:            "SAFe",
    hybrid:          "Hybrid",
  } as Record<string, string>)[m] ?? m;
}

export const ARTIFACT_CATALOG = [
  // ── Recommended (fixed-bid default set — displayed in this order) ────────────
  { type: "project_charter",           label: "Project Charter",                    phase: "initiation", mandatory: true  },
  { type: "initiation_deck",           label: "Project Initiation Deck",            phase: "initiation", mandatory: true  },
  { type: "stakeholder_register",      label: "Stakeholder Register",               phase: "initiation", mandatory: true  },
  { type: "wbs",                       label: "Work Breakdown Structure",           phase: "planning",   mandatory: true  },
  { type: "milestone_plan",            label: "Milestone Plan",                     phase: "planning",   mandatory: true  },
  { type: "resource_plan",             label: "Resource Plan",                      phase: "planning",   mandatory: true  },
  { type: "risk_register",             label: "Risk Register",                      phase: "planning",   mandatory: true  },
  { type: "issue_register",            label: "Issue Register",                     phase: "execution",  mandatory: true  },
  { type: "assumption_log",            label: "Assumptions Log",                    phase: "initiation", mandatory: true  },
  { type: "closure_report",            label: "Closure Report",                     phase: "closure",    mandatory: true  },
  // ── Optional ─────────────────────────────────────────────────────────────────
  { type: "business_case",             label: "Business Case",                      phase: "initiation", mandatory: false },
  { type: "scope_statement",           label: "Scope Statement",                    phase: "planning",   mandatory: false },
  { type: "communication_plan",        label: "Communication Plan",                 phase: "planning",   mandatory: false },
  { type: "raci_matrix",               label: "RACI Matrix",                        phase: "planning",   mandatory: false },
  { type: "traceability_matrix",       label: "Requirements Traceability Matrix",   phase: "execution",  mandatory: false },
  { type: "lessons_learned",           label: "Lessons Learned",                    phase: "closure",    mandatory: false },
  { type: "dependencies_register",     label: "Dependencies Register",              phase: "execution",  mandatory: false },
  { type: "quarterly_business_review", label: "Quarterly Business Review",          phase: "monitoring", mandatory: false },
  // ── Other supporting artifacts ───────────────────────────────────────────────
  { type: "benefits_register",         label: "Benefits Register",                  phase: "initiation", mandatory: false },
  { type: "cost_plan",                 label: "Cost Plan",                          phase: "planning",   mandatory: false },
  { type: "raid_register",             label: "RAID Register",                      phase: "planning",   mandatory: false },
  { type: "quality_plan",              label: "Quality Plan",                       phase: "planning",   mandatory: false },
  { type: "project_mgmt_plan",         label: "Project Management Plan",            phase: "planning",   mandatory: false },
  { type: "change_log",                label: "Change Control Register",            phase: "monitoring", mandatory: false },
  { type: "evm_analysis",              label: "EVM Analysis",                       phase: "execution",  mandatory: false },
  { type: "action_log",                label: "Action Log",                         phase: "execution",  mandatory: false },
  { type: "decision_log",              label: "Decision Log",                       phase: "execution",  mandatory: false },
  { type: "monthly_status",            label: "Monthly Status Report",              phase: "monitoring", mandatory: false },
];

// Output format per artifact type
export const ARTIFACT_FORMAT: Record<string, "xlsx" | "pptx" | "docx"> = {
  // PowerPoint
  initiation_deck:           "pptx",
  monthly_status:            "pptx",
  quarterly_business_review: "pptx",
  // Excel
  stakeholder_register: "xlsx",
  wbs:              "xlsx",
  milestone_plan:   "xlsx",
  resource_plan:    "xlsx",
  cost_plan:        "xlsx",
  raid_register:    "xlsx",
  risk_register:    "xlsx",
  raci_matrix:      "xlsx",
  traceability_matrix: "xlsx",
  evm_analysis:         "xlsx",
  action_log:       "xlsx",
  issue_register:   "xlsx",
  decision_log:     "xlsx",
  assumption_log:        "xlsx",
  benefits_register:     "xlsx",
  change_log:            "xlsx",
  dependencies_register: "xlsx",
  // Word (everything else)
};

export const DEFAULT_DETAILED_ARTIFACTS = [
  "project_charter", "stakeholder_register", "wbs", "milestone_plan",
  "raid_register", "risk_register", "communication_plan", "raci_matrix",
];

export const DEFAULT_HIGH_LEVEL_ARTIFACTS = [
  "project_charter", "milestone_plan", "raid_register",
];
