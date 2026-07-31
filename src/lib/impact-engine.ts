/**
 * BL-P5: Impact Computation Engine.
 * Takes a completed ComparisonRun and computes structured impact findings.
 * Covers scope, schedule, cost dimensions with confidence scoring.
 */
import { prisma } from "@/lib/db";
import { ARTIFACT_DIMENSION } from "@/lib/pmb-snapshot";
import { randomBytes } from "crypto";

function newId(): string {
  return randomBytes(12).toString("hex");
}

type Finding = {
  dimension: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  affectedItems?: string[];
};

function riskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 0.5) return "critical";
  if (score >= 0.3) return "high";
  if (score >= 0.15) return "medium";
  return "low";
}

function changeProportion(added: number, deleted: number, modified: number, total: number): number {
  if (total === 0) return 0;
  return Math.min((added + deleted + modified) / total, 1);
}

export type ImpactResult = {
  reportId: string;
  scopeScore: number | null;
  scheduleScore: number | null;
  costScore: number | null;
  overallRisk: string;
  confidence: number;
  findings: Finding[];
};

export async function computeImpact(runId: string, projectId: string): Promise<ImpactResult> {
  const db = prisma as any;

  // Check for existing report
  const existing = await db.impactReport.findUnique({ where: { runId } });
  if (existing) {
    return {
      reportId: existing.id,
      scopeScore: existing.scopeScore,
      scheduleScore: existing.scheduleScore,
      costScore: existing.costScore,
      overallRisk: existing.overallRisk,
      confidence: existing.confidence ?? 0,
      findings: existing.findings,
    };
  }

  // Load run + pairs + version extraction coverage
  const compRun = await db.comparisonRun.findUnique({
    where: { id: runId },
    include: {
      pairs: {
        include: {
          leftItem: { select: { normalizedTitle: true, attributes: true } },
          rightItem: { select: { normalizedTitle: true, attributes: true } },
        },
      },
    },
  });

  if (!compRun) throw new Error("ComparisonRun not found: " + runId);

  const [leftVersion, rightVersion] = await Promise.all([
    db.artifactVersion.findUnique({ where: { id: compRun.leftVersionId }, select: { extractionCoverage: true } }),
    db.artifactVersion.findUnique({ where: { id: compRun.rightVersionId }, select: { extractionCoverage: true } }),
  ]);

  const extractionConf = ((leftVersion?.extractionCoverage ?? 0) + (rightVersion?.extractionCoverage ?? 0)) / 2;
  const matchedRatio = compRun.matchedCount > 0
    ? (compRun.matchedCount / Math.max(1, compRun.matchedCount + compRun.addedCount + compRun.deletedCount))
    : 0;
  const confidence = Math.round((extractionConf * 0.6 + matchedRatio * 0.4) * 100) / 100;

  const pairs = compRun.pairs as any[];
  const total = pairs.length;

  const findings: Finding[] = [];

  // Scope impact
  const scopeTypes = new Set(["scope_statement", "wbs", "project_charter"]);
  const dimension = ARTIFACT_DIMENSION[compRun.artifactType] ?? "context";

  let scopeScore: number | null = null;
  let scheduleScore: number | null = null;
  let costScore: number | null = null;

  if (dimension === "scope") {
    const modified = pairs.filter((p) => p.temporalClass === "MODIFIED").length;
    const added = pairs.filter((p) => p.temporalClass === "ADDED").length;
    const deleted = pairs.filter((p) => p.temporalClass === "DELETED").length;
    scopeScore = Math.round(changeProportion(added, deleted, modified, total) * 100) / 100;

    if (added > 0) findings.push({ dimension: "scope", severity: "info", title: `${added} scope item(s) added`, detail: `New deliverables or inclusions were added in the current version.` });
    if (deleted > 0) findings.push({ dimension: "scope", severity: "warning", title: `${deleted} scope item(s) removed`, detail: `Items removed from scope may represent descoped work — validate with stakeholders.` });
    if (modified > 0) findings.push({ dimension: "scope", severity: "warning", title: `${modified} scope item(s) modified`, detail: `Acceptance criteria, deliverable descriptions, or ownership changes detected.` });
    if (scopeScore >= 0.3) findings.push({ dimension: "scope", severity: "critical", title: "Major scope change detected", detail: `${Math.round(scopeScore * 100)}% of scope items changed — a scope change request may be required.` });
  }

  if (dimension === "schedule") {
    const modified = pairs.filter((p) => p.temporalClass === "MODIFIED").length;
    const added = pairs.filter((p) => p.temporalClass === "ADDED").length;
    const deleted = pairs.filter((p) => p.temporalClass === "DELETED").length;
    scheduleScore = Math.round(changeProportion(added, deleted, modified, total) * 100) / 100;

    const slips = pairs.filter((p) => p.dispositionClass === "schedule_slip");
    const pulls = pairs.filter((p) => p.dispositionClass === "schedule_pull");

    if (slips.length > 0) {
      const affectedItems = slips.map((p: any) => p.leftItem?.normalizedTitle ?? p.rightItem?.normalizedTitle).filter(Boolean);
      findings.push({
        dimension: "schedule",
        severity: slips.length >= 3 ? "critical" : "warning",
        title: `${slips.length} milestone(s) slipped`,
        detail: "Target dates moved later relative to baseline.",
        affectedItems,
      });
    }
    if (pulls.length > 0) {
      findings.push({ dimension: "schedule", severity: "info", title: `${pulls.length} milestone(s) pulled forward`, detail: "Target dates brought forward — verify resource availability." });
    }
    if (deleted > 0) findings.push({ dimension: "schedule", severity: "warning", title: `${deleted} milestone(s) removed`, detail: "Milestones removed since baseline — confirm intentional descoping." });
    if (added > 0) findings.push({ dimension: "schedule", severity: "info", title: `${added} milestone(s) added`, detail: "New milestones added since baseline." });
  }

  if (dimension === "cost") {
    const modified = pairs.filter((p) => p.temporalClass === "MODIFIED").length;
    const added = pairs.filter((p) => p.temporalClass === "ADDED").length;
    const deleted = pairs.filter((p) => p.temporalClass === "DELETED").length;
    costScore = Math.round(changeProportion(added, deleted, modified, total) * 100) / 100;

    if (added > 0) findings.push({ dimension: "cost", severity: "warning", title: `${added} cost line(s) added`, detail: "New cost items may increase total budget requirement." });
    if (deleted > 0) findings.push({ dimension: "cost", severity: "info", title: `${deleted} cost line(s) removed`, detail: "Cost items removed relative to baseline." });
    if (modified > 0) findings.push({ dimension: "cost", severity: "warning", title: `${modified} cost line(s) changed`, detail: "Verify updated estimates are reflected in the budget plan." });
    if (costScore >= 0.3) findings.push({ dimension: "cost", severity: "critical", title: "Significant cost baseline deviation", detail: `${Math.round(costScore * 100)}% of cost items changed — EVM re-analysis recommended.` });
  }

  // Context dimensions
  if (dimension === "context") {
    const escalated = pairs.filter((p) => p.dispositionClass === "escalated");
    if (escalated.length > 0) {
      const titles = escalated.map((p: any) => p.rightItem?.normalizedTitle ?? "").filter(Boolean);
      findings.push({ dimension: "context", severity: "critical", title: `${escalated.length} risk(s) escalated`, detail: "Risk impact/probability increased since baseline.", affectedItems: titles });
    }
    const added = pairs.filter((p) => p.temporalClass === "ADDED").length;
    const deleted = pairs.filter((p) => p.temporalClass === "DELETED").length;
    if (added > 0) findings.push({ dimension: "context", severity: "info", title: `${added} new context item(s)`, detail: "New risks, issues, or stakeholders recorded since baseline." });
    if (deleted > 0) findings.push({ dimension: "context", severity: "info", title: `${deleted} resolved context item(s)`, detail: "Items closed or removed since baseline." });
  }

  // Confidence finding
  if (confidence < 0.5) {
    findings.push({
      dimension: "meta",
      severity: "warning",
      title: "Low confidence in comparison",
      detail: `Extraction coverage is low (${Math.round(confidence * 100)}%). Results may miss changes in unextracted content.`,
    });
  }

  const scores = [scopeScore, scheduleScore, costScore].filter((s) => s !== null) as number[];
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const overallRisk = riskLevel(maxScore);

  // Persist report
  const reportId = newId();
  await db.impactReport.create({
    data: {
      id: reportId,
      runId,
      projectId,
      scopeScore,
      scheduleScore,
      costScore,
      overallRisk,
      confidence,
      findings,
      createdAt: new Date(),
    },
  });

  return { reportId, scopeScore, scheduleScore, costScore, overallRisk, confidence, findings };
}
