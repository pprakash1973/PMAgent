/**
 * BL-P7: Accuracy evaluation against the gold set.
 * Computes precision, recall, F1 for a comparison run.
 */
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

function newId(): string {
  return randomBytes(12).toString("hex");
}

export type AccuracyResult = {
  reportId: string;
  goldEntryCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  grade: "A" | "B" | "C" | "D" | "F";
  details: {
    goldTitle: string;
    expectedDecision: string;
    expectedTemporal: string | null;
    found: boolean;
    actualTemporal: string | null;
    correct: boolean;
  }[];
};

function grade(f1: number | null): AccuracyResult["grade"] {
  if (f1 === null) return "F";
  if (f1 >= 0.9) return "A";
  if (f1 >= 0.75) return "B";
  if (f1 >= 0.6) return "C";
  if (f1 >= 0.4) return "D";
  return "F";
}

export async function evaluateAccuracy(
  runId: string,
  projectId: string
): Promise<AccuracyResult> {
  const db = prisma as any;

  // Check for existing report (idempotent)
  const existing = await db.accuracyReport.findUnique({ where: { runId } });
  if (existing) {
    return {
      reportId: existing.id,
      goldEntryCount: existing.goldEntryCount,
      truePositives: existing.truePositives,
      falsePositives: existing.falsePositives,
      falseNegatives: existing.falseNegatives,
      precision: existing.precision,
      recall: existing.recall,
      f1Score: existing.f1Score,
      grade: grade(existing.f1Score),
      details: [],
    };
  }

  // Load the comparison run with its pairs
  const run = await db.comparisonRun.findUnique({
    where: { id: runId },
    select: { artifactType: true, projectId: true },
  });
  if (!run) throw new Error("ComparisonRun not found: " + runId);

  const pairs = await db.comparisonPair.findMany({
    where: { runId },
    include: {
      leftItem:  { select: { normalizedTitle: true } },
      rightItem: { select: { normalizedTitle: true } },
    },
  });

  // Load gold entries for this artifact type
  const goldEntries = await db.comparisonGoldEntry.findMany({
    where: { projectId, artifactType: run.artifactType },
  });

  if (goldEntries.length === 0) {
    // No gold set — return empty report
    const reportId = newId();
    await db.accuracyReport.create({
      data: { id: reportId, runId, projectId, goldEntryCount: 0, truePositives: 0, falsePositives: 0, falseNegatives: 0, computedAt: new Date() },
    });
    return {
      reportId, goldEntryCount: 0, truePositives: 0, falsePositives: 0, falseNegatives: 0,
      precision: null, recall: null, f1Score: null, grade: "F", details: [],
    };
  }

  let tp = 0, fp = 0, fn = 0;
  const details: AccuracyResult["details"] = [];

  for (const gold of goldEntries) {
    const leftTitle = gold.leftItemTitle.toLowerCase();
    const rightTitle = gold.rightItemTitle?.toLowerCase() ?? null;

    // Find the matching pair in the comparison result
    const matchedPair = pairs.find((p: any) => {
      const lt = p.leftItem?.normalizedTitle?.toLowerCase() ?? null;
      const rt = p.rightItem?.normalizedTitle?.toLowerCase() ?? null;
      if (gold.expectedMatchDecision === "match") {
        return lt && lt === leftTitle && rt && rightTitle && rt === rightTitle;
      } else {
        // no_match: item on left that didn't get paired with the expected right item
        return lt && lt === leftTitle && !p.rightItemId;
      }
    });

    const found = !!matchedPair;
    let correct = false;

    if (found) {
      // Check temporal class if specified
      if (gold.expectedTemporalClass) {
        correct = matchedPair.temporalClass === gold.expectedTemporalClass;
      } else {
        correct = gold.expectedMatchDecision === "match"
          ? (matchedPair.temporalClass !== "ADDED" && matchedPair.temporalClass !== "DELETED")
          : (matchedPair.temporalClass === "DELETED" || matchedPair.temporalClass === "ADDED");
      }
    }

    if (correct) tp++;
    else if (found) fp++;
    else fn++;

    details.push({
      goldTitle: gold.leftItemTitle,
      expectedDecision: gold.expectedMatchDecision,
      expectedTemporal: gold.expectedTemporalClass,
      found,
      actualTemporal: matchedPair?.temporalClass ?? null,
      correct,
    });
  }

  const precision = tp + fp > 0 ? Math.round((tp / (tp + fp)) * 1000) / 1000 : null;
  const recall    = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 1000) / 1000 : null;
  const f1        = precision !== null && recall !== null && precision + recall > 0
    ? Math.round((2 * precision * recall / (precision + recall)) * 1000) / 1000
    : null;

  const reportId = newId();
  await db.accuracyReport.create({
    data: {
      id: reportId,
      runId,
      projectId,
      goldEntryCount: goldEntries.length,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision,
      recall,
      f1Score: f1,
      computedAt: new Date(),
    },
  });

  return {
    reportId,
    goldEntryCount: goldEntries.length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1Score: f1,
    grade: grade(f1),
    details,
  };
}
