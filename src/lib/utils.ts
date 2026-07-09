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
  return {
    waterfall: "Waterfall",
    agile: "Agile Scrum",
    kanban: "Kanban",
    safe: "SAFe",
    hybrid: "Hybrid",
  }[m] ?? m;
}

export const ARTIFACT_CATALOG = [
  // Initiation
  { type: "initiation_deck", label: "Project Initiation Deck", phase: "initiation" },
  { type: "project_charter", label: "Project Charter", phase: "initiation" },
  { type: "business_case", label: "Business Case", phase: "initiation" },
  { type: "stakeholder_register", label: "Stakeholder Register", phase: "initiation" },
  { type: "assumption_log", label: "Assumption Log", phase: "initiation" },
  { type: "benefits_register", label: "Benefits Register", phase: "initiation" },
  // Planning
  { type: "scope_statement", label: "Scope Statement", phase: "planning" },
  { type: "wbs", label: "Work Breakdown Structure", phase: "planning" },
  { type: "milestone_plan", label: "Milestone Plan", phase: "planning" },
  { type: "resource_plan", label: "Resource Plan", phase: "planning" },
  { type: "cost_plan", label: "Cost Plan", phase: "planning" },
  { type: "raid_register", label: "RAID Register", phase: "planning" },
  { type: "risk_register", label: "Risk Register", phase: "planning" },
  { type: "communication_plan", label: "Communication Plan", phase: "planning" },
  { type: "raci_matrix", label: "RACI Matrix", phase: "planning" },
  { type: "quality_plan", label: "Quality Plan", phase: "planning" },
  // Execution
  { type: "action_log", label: "Action Log", phase: "execution" },
  { type: "issue_register", label: "Issue Register", phase: "execution" },
  { type: "decision_log", label: "Decision Log", phase: "execution" },
  // Monitoring
  { type: "weekly_status", label: "Weekly Status Report", phase: "monitoring" },
  { type: "monthly_status", label: "Monthly Status Report", phase: "monitoring" },
  { type: "change_log", label: "Change Control Register", phase: "monitoring" },
  // Closure
  { type: "lessons_learned", label: "Lessons Learned", phase: "closure" },
  { type: "closure_report", label: "Closure Report", phase: "closure" },
];

// Output format per artifact type
export const ARTIFACT_FORMAT: Record<string, "xlsx" | "pptx" | "docx"> = {
  // PowerPoint
  initiation_deck: "pptx",
  weekly_status:   "pptx",
  monthly_status:  "pptx",
  // Excel
  stakeholder_register: "xlsx",
  wbs:              "xlsx",
  milestone_plan:   "xlsx",
  resource_plan:    "xlsx",
  cost_plan:        "xlsx",
  raid_register:    "xlsx",
  risk_register:    "xlsx",
  raci_matrix:      "xlsx",
  action_log:       "xlsx",
  issue_register:   "xlsx",
  decision_log:     "xlsx",
  assumption_log:   "xlsx",
  benefits_register:"xlsx",
  change_log:       "xlsx",
  // Word (everything else)
};

export const DEFAULT_DETAILED_ARTIFACTS = [
  "project_charter", "stakeholder_register", "wbs", "milestone_plan",
  "raid_register", "risk_register", "communication_plan", "raci_matrix", "weekly_status",
];

export const DEFAULT_HIGH_LEVEL_ARTIFACTS = [
  "project_charter", "milestone_plan", "raid_register", "weekly_status",
];
