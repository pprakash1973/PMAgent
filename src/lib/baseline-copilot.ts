/**
 * BL-P6: Copilot Layer for baseline analysis.
 * Generates PM-ready AI summaries of comparison impact reports.
 */
import { anthropic } from "@/lib/ai";
import { computeImpact } from "@/lib/impact-engine";
import { prisma } from "@/lib/db";

type Finding = {
  dimension: string;
  severity: string;
  title: string;
  detail: string;
  affectedItems?: string[];
};

export type BaselineSummaryResult = {
  summary: string;
  keyRisks: string[];
  recommendedActions: string[];
  overallRisk: string;
  confidence: number;
};

export async function generateBaselineSummary(
  runId: string,
  projectId: string
): Promise<BaselineSummaryResult> {
  const db = prisma as any;

  // Get or compute impact report
  const impact = await computeImpact(runId, projectId);

  // Get comparison run metadata
  const run = await db.comparisonRun.findUnique({
    where: { id: runId },
    select: {
      artifactType: true,
      matchedCount: true,
      addedCount: true,
      deletedCount: true,
      modifiedCount: true,
      unchangedCount: true,
    },
  });

  if (!run) throw new Error("Comparison run not found");

  const findingsText = (impact.findings as Finding[])
    .map((f) => `[${f.severity.toUpperCase()}] ${f.dimension}: ${f.title} — ${f.detail}`)
    .join("\n");

  const statsText = `Matched: ${run.matchedCount}, Added: ${run.addedCount}, Deleted: ${run.deletedCount}, Modified: ${run.modifiedCount}, Unchanged: ${run.unchangedCount}`;

  const prompt = `You are a PMO AI assistant. A PM has run a baseline comparison for the "${run.artifactType.replace(/_/g, " ")}" artifact.

Comparison Statistics:
${statsText}

Impact Analysis (Overall Risk: ${impact.overallRisk.toUpperCase()}, Confidence: ${Math.round(impact.confidence * 100)}%):
${findingsText || "No significant findings."}

Provide a concise PM-facing baseline impact briefing. Return ONLY valid JSON in this exact shape:
{
  "summary": "2-3 sentence narrative executive summary of the baseline comparison",
  "keyRisks": ["risk 1", "risk 2", "..."],
  "recommendedActions": ["action 1", "action 2", "..."]
}

Rules:
- summary: 2-3 sentences covering what changed, the risk level, and the most important implication
- keyRisks: 2-4 concise bullet risks (empty array if no risks)
- recommendedActions: 2-4 concrete PM actions to take (empty array if baseline is stable)
- Use plain language a project manager expects in a status update
- Do not mention technical details (tier, fuzzy matching, extraction coverage)`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";

  let parsed: { summary: string; keyRisks: string[]; recommendedActions: string[] };
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { summary: text, keyRisks: [], recommendedActions: [] };
  } catch {
    parsed = { summary: text, keyRisks: [], recommendedActions: [] };
  }

  return {
    summary: parsed.summary ?? "",
    keyRisks: parsed.keyRisks ?? [],
    recommendedActions: parsed.recommendedActions ?? [],
    overallRisk: impact.overallRisk,
    confidence: impact.confidence,
  };
}

// GR-BL-07: Baseline Verification
export type VerificationResult = {
  pass: boolean;
  score: number; // 0-100
  checks: {
    id: string;
    label: string;
    pass: boolean;
    detail: string;
  }[];
};

export async function verifyBaseline(projectId: string): Promise<VerificationResult> {
  const db = prisma as any;

  const checks: VerificationResult["checks"] = [];

  // Check 1: Current PMB snapshot exists
  const currentSnapshot = await db.pmbSnapshot.findFirst({
    where: { projectId, isCurrent: true },
    select: { id: true, label: true, snapshotNumber: true },
  });
  checks.push({
    id: "GR-BL-01",
    label: "Current PMB snapshot exists",
    pass: !!currentSnapshot,
    detail: currentSnapshot
      ? `Snapshot #${currentSnapshot.snapshotNumber} "${currentSnapshot.label}" is current.`
      : "No current PMB snapshot found. Create a baseline snapshot before proceeding.",
  });

  // Check 2: Required artifacts have approved versions
  const REQUIRED = ["scope_statement", "milestone_plan", "cost_plan"];
  const APPROVED = new Set(["pm_confirmed", "gate_approved"]);

  for (const type of REQUIRED) {
    const artifact = await db.artifact.findFirst({ where: { projectId, artifactType: type } });
    if (!artifact) {
      checks.push({
        id: `GR-BL-02-${type}`,
        label: `${type.replace(/_/g, " ")} exists and approved`,
        pass: false,
        detail: `Required artifact "${type.replace(/_/g, " ")}" has not been generated.`,
      });
      continue;
    }
    const latestVersion = await db.artifactVersion.findFirst({
      where: { artifactId: artifact.id },
      orderBy: { versionNumber: "desc" },
      select: { approvalStatus: true, extractionStatus: true },
    });
    const isApproved = latestVersion && APPROVED.has(latestVersion.approvalStatus);
    checks.push({
      id: `GR-BL-02-${type}`,
      label: `${type.replace(/_/g, " ")} exists and approved`,
      pass: !!isApproved,
      detail: isApproved
        ? `Approved (${latestVersion.approvalStatus}).`
        : `Current status: "${latestVersion?.approvalStatus ?? "unreviewed"}". Must be pm_confirmed or gate_approved.`,
    });
  }

  // Check 3: All baseline artifacts have complete extraction
  const allArtifacts = await db.artifact.findMany({
    where: { projectId },
    select: { artifactType: true },
  });
  let extractionPass = 0;
  let extractionTotal = 0;
  for (const art of allArtifacts) {
    const lv = await db.artifactVersion.findFirst({
      where: { artifact: { projectId, artifactType: art.artifactType } },
      orderBy: { versionNumber: "desc" },
      select: { extractionStatus: true },
    });
    if (lv) {
      extractionTotal++;
      if (lv.extractionStatus === "complete") extractionPass++;
    }
  }
  const extractionRatio = extractionTotal > 0 ? extractionPass / extractionTotal : 0;
  checks.push({
    id: "GR-BL-03",
    label: "Artifact item extraction complete",
    pass: extractionRatio >= 0.8,
    detail: `${extractionPass}/${extractionTotal} artifacts have complete item extraction.`,
  });

  // Check 4: At least one comparison run exists
  const runCount = await db.comparisonRun.count({ where: { projectId } });
  checks.push({
    id: "GR-BL-04",
    label: "Comparison run exists",
    pass: runCount > 0,
    detail: runCount > 0
      ? `${runCount} comparison run(s) on record.`
      : "No baseline comparisons have been run. Run at least one comparison against the current baseline.",
  });

  const passCount = checks.filter((c) => c.pass).length;
  const score = Math.round((passCount / checks.length) * 100);

  return {
    pass: checks.every((c) => c.pass),
    score,
    checks,
  };
}
