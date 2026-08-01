/**
 * Strategy pattern for delivery_method × commercial_model combinations.
 * Resolves at project load; injected into sub-agent contexts so agents
 * never branch on methodology internally.
 */

export type DeliveryMethod = "predictive" | "agile_scrum" | "hybrid";
export type CommercialModel = "fixed_price" | "time_and_materials" | "capped_tm";

export interface DeliveryStrategy {
  deliveryMethod: DeliveryMethod;
  commercialModel: CommercialModel;

  /** Which tabs appear in the workspace */
  workspaceTabs: string[];

  /** Which metrics to compute after each sprint close */
  activeMetrics: string[];

  /** Whether AgileEVM applies (suppressed for time_and_materials) */
  computesEVM: boolean;

  /** Whether a scope baseline exists (required for FP and capped) */
  hasScopeBaseline: boolean;

  /** Whether T&M burn metrics apply */
  hasBurnMetrics: boolean;

  /** Progress unit label for display */
  progressUnit: "story_points" | "percent_complete" | "both";

  /** Health model weights key */
  healthModelKey: "predictive" | "agile_fp_capped" | "agile_tm";

  /** Stage labels for the project lifecycle */
  stageLabels: Record<string, string>;

  /** Whether the ceiling gate is enforced */
  enforcesCeilingGate: boolean;

  /** Label for the commercial primary metric */
  commercialPrimaryMetric: string;
}

const AGILE_STAGES: Record<string, string> = {
  s0_inception: "S0 Inception",
  s1_discovery: "S1 Discovery / Sprint 0",
  s2_sprint_loop: "S2 Sprint Loop",
  s3_release_close: "S3 Release & Close",
};

const PREDICTIVE_STAGES: Record<string, string> = {
  initiation: "Initiation",
  planning: "Planning",
  execution: "Execution",
  closure: "Closure",
};

const AGILE_TABS_FP_CAPPED = [
  "Artifacts", "Backlog", "Sprints", "Risk", "Issues",
  "Schedule", "Commercial", "Status Reporting", "Baseline",
];

const AGILE_TABS_TM = [
  "Artifacts", "Backlog", "Sprints", "Risk", "Issues",
  "Schedule", "Commercial", "Status Reporting", "Baseline",
];

const HYBRID_TABS = [
  "Artifacts", "Backlog", "Sprints", "Risk", "Issues",
  "Schedule", "Cost", "Commercial", "Scope Control", "Status Reporting", "Baseline",
];

const PREDICTIVE_TABS = [
  "Artifacts", "Risk", "Issues", "Resources", "Schedule",
  "Cost", "Scope Control", "Status Reporting", "Baseline",
];

export function resolveDeliveryStrategy(
  deliveryMethod: DeliveryMethod,
  commercialModel: CommercialModel
): DeliveryStrategy {
  const isAgile = deliveryMethod === "agile_scrum";
  const isHybrid = deliveryMethod === "hybrid";
  const isFP = commercialModel === "fixed_price";
  const isTM = commercialModel === "time_and_materials";
  const isCapped = commercialModel === "capped_tm";

  const computesEVM = isFP || isCapped;
  const hasScopeBaseline = isFP || (isCapped && (isAgile || isHybrid));
  const hasBurnMetrics = isTM || isCapped;

  let workspaceTabs: string[];
  if (isAgile || isHybrid) {
    workspaceTabs = isHybrid ? HYBRID_TABS : (isTM ? AGILE_TABS_TM : AGILE_TABS_FP_CAPPED);
  } else {
    workspaceTabs = PREDICTIVE_TABS;
  }

  let healthModelKey: DeliveryStrategy["healthModelKey"] = "predictive";
  if (isAgile || isHybrid) {
    healthModelKey = isTM ? "agile_tm" : "agile_fp_capped";
  }

  let commercialPrimaryMetric = "Budget vs Actual";
  if (isTM) commercialPrimaryMetric = "Burn Rate & Runway";
  else if (isCapped) commercialPrimaryMetric = "Ceiling Forecast";
  else if (isFP && (isAgile || isHybrid)) commercialPrimaryMetric = "Margin at Completion";

  return {
    deliveryMethod,
    commercialModel,
    workspaceTabs,
    activeMetrics: isAgile || isHybrid
      ? ["velocity", "burndown", "burnup", "cfd", "commitment_reliability", "cycle_time"]
      : ["spi", "cpi", "schedule_variance", "cost_variance"],
    computesEVM,
    hasScopeBaseline,
    hasBurnMetrics,
    progressUnit: isHybrid ? "both" : isAgile ? "story_points" : "percent_complete",
    healthModelKey,
    stageLabels: isAgile || isHybrid ? AGILE_STAGES : PREDICTIVE_STAGES,
    enforcesCeilingGate: isCapped,
    commercialPrimaryMetric,
  };
}

/** Returns a human-readable label for the delivery/commercial pair */
export function deliveryLabel(method: string, commercial: string): string {
  const m: Record<string, string> = {
    predictive: "Predictive",
    agile_scrum: "Agile Scrum",
    hybrid: "Hybrid",
  };
  const c: Record<string, string> = {
    fixed_price: "Fixed Price",
    time_and_materials: "T&M",
    capped_tm: "Capped T&M",
  };
  return `${m[method] ?? method} · ${c[commercial] ?? commercial}`;
}
