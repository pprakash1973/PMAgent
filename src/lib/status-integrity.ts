/**
 * Post-generation guardrail enforcement for status reports.
 *
 * assertStatusIntegrity    — GR-11 mechanical threshold check (DEF-002).
 * computeHealthScore       — deterministic composite health metric for waterfall/predictive (DEF-006).
 * computeAgileHealthScore  — deterministic composite health metric for agile/scrum projects.
 *
 * Waterfall formula (computeHealthScore):
 *   Schedule (35 pts): spi≥1.0→35, ≥0.95→32, ≥0.85→24, ≥0.70→14, <0.70→5, null→25 (neutral)
 *   Cost     (30 pts): cpi≥1.0→30, ≥0.95→27, ≥0.90→21, ≥0.75→12, <0.75→3, null→22 (neutral)
 *   Overdue  (20 pts): 0→20, 1-2→14, 3-5→7, >5→0
 *   Risks    (15 pts): 0→15, 1-2→11, 3-5→6, >5→2
 *
 * Agile formula (computeAgileHealthScore):
 *   Sprint completion (35 pts): avg accepted/committed ≥0.9→35, ≥0.75→27, ≥0.60→18, ≥0.40→10, <0.40→3, null→25
 *   Budget burn      (30 pts): burn%≤80→30, ≤90→24, ≤100→15, ≤110→7, >110→0, null→22
 *   Impediments      (20 pts): 0→20, 1-2→15, 3-5→8, >5→0
 *   Risks            (15 pts): 0→15, 1-2→11, 3-5→6, >5→2
 *   Total max = 100
 */

export interface StatusIntegrityResult {
  ragStatus: string;
  violations: string[];
}

/**
 * Enforces GR-11 in code: if measured SPI or CPI breach their thresholds,
 * a model-reported "green" is overridden and the reason is recorded.
 * Computed EVM values always take precedence over the model's verdict.
 */
export function assertStatusIntegrity(
  aiResult: { ragStatus: string },
  evm: { spi: number | null; cpi: number | null }
): StatusIntegrityResult {
  const { spi, cpi } = evm;
  let ragStatus = aiResult.ragStatus;
  const violations: string[] = [];

  if (ragStatus === "green") {
    if (spi !== null) {
      if (spi < 0.70) {
        ragStatus = "red";
        violations.push(
          `GR-11 SPI override: ${spi.toFixed(2)} < 0.70 — escalated to RED (model returned green)`
        );
      } else if (spi < 0.85) {
        ragStatus = "amber";
        violations.push(
          `GR-11 SPI override: ${spi.toFixed(2)} < 0.85 — overridden to AMBER (model returned green)`
        );
      }
    }
  }

  // CPI check applies independently: can upgrade green → amber but never demotes amber/red
  if (ragStatus === "green" && cpi !== null && cpi < 0.90) {
    ragStatus = "amber";
    violations.push(
      `GR-11 CPI override: ${cpi.toFixed(3)} < 0.90 — overridden to AMBER (model returned green)`
    );
  }

  return { ragStatus, violations };
}

/**
 * Deterministic health score 0–100 computed from measured EVM and risk inputs.
 * Identical inputs always produce an identical score (AC-6.3).
 */
export function computeHealthScore(params: {
  spi: number | null;
  cpi: number | null;
  overdueTasks: number;
  openRisks: number;
}): number {
  const { spi, cpi, overdueTasks, openRisks } = params;

  // Schedule component: 35 pts (neutral 25 when SPI not yet measurable)
  let scheduleScore = 25;
  if (spi !== null) {
    if (spi >= 1.0)      scheduleScore = 35;
    else if (spi >= 0.95) scheduleScore = 32;
    else if (spi >= 0.85) scheduleScore = 24;
    else if (spi >= 0.70) scheduleScore = 14;
    else                  scheduleScore = 5;
  }

  // Cost component: 30 pts (neutral 22 when no cost entries recorded)
  let costScore = 22;
  if (cpi !== null) {
    if (cpi >= 1.0)      costScore = 30;
    else if (cpi >= 0.95) costScore = 27;
    else if (cpi >= 0.90) costScore = 21;
    else if (cpi >= 0.75) costScore = 12;
    else                  costScore = 3;
  }

  // Overdue tasks: 20 pts
  let overdueScore: number;
  if (overdueTasks === 0)       overdueScore = 20;
  else if (overdueTasks <= 2)   overdueScore = 14;
  else if (overdueTasks <= 5)   overdueScore = 7;
  else                          overdueScore = 0;

  // Open risk count: 15 pts
  let riskScore: number;
  if (openRisks === 0)      riskScore = 15;
  else if (openRisks <= 2)  riskScore = 11;
  else if (openRisks <= 5)  riskScore = 6;
  else                      riskScore = 2;

  return Math.round(Math.min(100, Math.max(0, scheduleScore + costScore + overdueScore + riskScore)));
}
