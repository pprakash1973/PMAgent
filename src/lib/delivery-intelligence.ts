export type IntelligenceRow = {
  projectId: string;
  projectName: string;
  pmId: string;
  pmName: string;
  industry: string | null;
  budget: number | null;
  currency: string;
  deliveryScore: number;
  rag: "red" | "amber" | "green";
  confidence: "high" | "medium" | "low";
  drivers: {
    spi: number | null;
    cpi: number | null;
    riskExposure: "low" | "medium" | "high" | "critical";
    milestoneSlipPct: number;
    runwayRatio: number | null;
  };
  topRisk: string | null;
  recommendation: string;
};

export function computeDeliveryScore(inputs: {
  spi: number | null;
  cpi: number | null;
  highRisks: number;
  criticalIssues: number;
  milestonesTotal: number;
  milestonesOverdue: number;
  daysRemaining: number | null;
  runwaySprints: number | null;
}): { score: number; confidence: "high" | "medium" | "low" } {
  let weightedSum = 0;
  let totalWeight = 0;

  if (inputs.spi !== null) {
    const s = Math.min(100, Math.max(0, ((inputs.spi - 0.6) / 0.5) * 100));
    weightedSum += s * 30; totalWeight += 30;
  }
  if (inputs.cpi !== null) {
    const s = Math.min(100, Math.max(0, ((inputs.cpi - 0.6) / 0.5) * 100));
    weightedSum += s * 25; totalWeight += 25;
  }

  const riskHits = inputs.highRisks * 15 + inputs.criticalIssues * 25;
  weightedSum += Math.max(0, 100 - riskHits) * 20; totalWeight += 20;

  if (inputs.milestonesTotal > 0) {
    const slip = inputs.milestonesOverdue / inputs.milestonesTotal;
    weightedSum += Math.max(0, 100 - slip * 100) * 15; totalWeight += 15;
  }

  if (inputs.daysRemaining !== null && inputs.runwaySprints !== null) {
    const runwayDays = inputs.runwaySprints * 14;
    const ratio = runwayDays / Math.max(1, inputs.daysRemaining);
    weightedSum += Math.min(100, Math.max(0, ratio * 80)) * 10; totalWeight += 10;
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
  const confidence: "high" | "medium" | "low" =
    totalWeight >= 70 ? "high" : totalWeight >= 40 ? "medium" : "low";
  return { score, confidence };
}

export function topDriverLabel(row: IntelligenceRow): string {
  const d = row.drivers;
  if (d.spi !== null && d.spi < 0.85) return `SPI ${d.spi.toFixed(2)} — schedule slipping`;
  if (d.riskExposure === "critical" || d.riskExposure === "high") return `${row.drivers.riskExposure} risk exposure`;
  if (d.milestoneSlipPct > 0.3) return `${Math.round(d.milestoneSlipPct * 100)}% milestones overdue`;
  if (d.cpi !== null && d.cpi < 0.9) return `CPI ${d.cpi.toFixed(2)} — cost overrun`;
  if (d.runwayRatio !== null && d.runwayRatio < 0.8) return "Runway shorter than time remaining";
  return "On track";
}

export function recommendationCategory(row: IntelligenceRow): string {
  const d = row.drivers;
  if (d.spi !== null && d.spi < 0.85) return "schedule";
  if (d.riskExposure === "critical" || d.riskExposure === "high") return "risk";
  if (d.milestoneSlipPct > 0.3) return "schedule";
  if (d.cpi !== null && d.cpi < 0.9) return "cost";
  return "governance";
}
