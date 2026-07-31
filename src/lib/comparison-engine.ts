/**
 * BL-P4: Comparison Engine.
 * 5-tier identity resolution cascade + temporal + disposition classification.
 * Stores results as ComparisonRun + ComparisonPair rows.
 */
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

function newId(): string {
  return randomBytes(12).toString("hex");
}

// ── Fuzzy similarity (Jaro-Winkler) ──────────────────────────────────────────

function jaro(s1: string, t1: string): number {
  const s = s1.toLowerCase().trim();
  const t = t1.toLowerCase().trim();
  if (s === t) return 1;
  if (s.length === 0 || t.length === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(s.length, t.length) / 2) - 1, 0);
  const sMatched = new Array(s.length).fill(false);
  const tMatched = new Array(t.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, t.length);
    for (let j = start; j < end; j++) {
      if (tMatched[j] || s[i] !== t[j]) continue;
      sMatched[i] = tMatched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s.length; i++) {
    if (!sMatched[i]) continue;
    while (!tMatched[k]) k++;
    if (s[i] !== t[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s.length + matches / t.length + (matches - transpositions / 2) / matches) / 3;

  // Jaro-Winkler boost for common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s.length, t.length)); i++) {
    if (s[i] !== t[i]) break;
    prefix++;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

const FUZZY_THRESHOLD = 0.82;

// ── Disposition classifiers ───────────────────────────────────────────────────

type Item = {
  id: string;
  declaredId: string | null;
  sequence: number;
  normalizedTitle: string;
  normalizedDesc: string;
  rawText: string;
  attributes: Record<string, unknown>;
};

function classifyDisposition(
  artifactType: string,
  left: Item | null,
  right: Item | null,
  temporal: string
): string | null {
  if (temporal === "ADDED") return "new_entry";
  if (temporal === "DELETED") return "removed_entry";
  if (temporal === "UNCHANGED") return "no_change";
  if (!left || !right) return null;

  const la = left.attributes;
  const ra = right.attributes;

  switch (artifactType) {
    case "risk_register":
    case "raid_register": {
      const riskLevels = ["low", "medium", "high", "critical"];
      const lIdx = riskLevels.indexOf(String(la.impact ?? "").toLowerCase());
      const rIdx = riskLevels.indexOf(String(ra.impact ?? "").toLowerCase());
      if (lIdx >= 0 && rIdx >= 0) {
        if (rIdx > lIdx) return "escalated";
        if (rIdx < lIdx) return "de_escalated";
      }
      if (String(la.status) !== String(ra.status)) return "status_changed";
      return "details_changed";
    }

    case "milestone_plan": {
      if (la.due_date && ra.due_date && la.due_date !== ra.due_date) {
        const lDate = new Date(String(la.due_date));
        const rDate = new Date(String(ra.due_date));
        if (!isNaN(lDate.getTime()) && !isNaN(rDate.getTime())) {
          return rDate > lDate ? "schedule_slip" : "schedule_pull";
        }
      }
      if (String(la.status) !== String(ra.status)) return "status_changed";
      return "details_changed";
    }

    case "change_log": {
      if (String(la.approval_status) !== String(ra.approval_status)) return "approval_changed";
      if (String(la.status) !== String(ra.status)) return "status_changed";
      return "details_changed";
    }

    case "issue_register": {
      const levels = ["low", "medium", "high", "critical"];
      const lIdx = levels.indexOf(String(la.severity ?? "").toLowerCase());
      const rIdx = levels.indexOf(String(ra.severity ?? "").toLowerCase());
      if (lIdx >= 0 && rIdx >= 0) {
        if (rIdx > lIdx) return "severity_increased";
        if (rIdx < lIdx) return "severity_decreased";
      }
      if (String(la.status) !== String(ra.status)) return "status_changed";
      return "details_changed";
    }

    case "stakeholder_register": {
      if (String(la.influence) !== String(ra.influence)) return "influence_changed";
      if (String(la.interest) !== String(ra.interest)) return "interest_changed";
      return "details_changed";
    }

    default:
      return "details_changed";
  }
}

// ── Core comparison function ──────────────────────────────────────────────────

export type ComparisonResult = {
  runId: string;
  artifactType: string;
  stats: {
    matched: number;
    added: number;
    deleted: number;
    modified: number;
    unchanged: number;
  };
  pairs: {
    id: string;
    temporalClass: string;
    dispositionClass: string | null;
    matchTier: number | null;
    similarity: number | null;
    leftItemId: string | null;
    rightItemId: string | null;
    leftTitle: string | null;
    rightTitle: string | null;
  }[];
};

export async function runComparison(
  projectId: string,
  leftVersionId: string,
  rightVersionId: string,
  artifactType: string
): Promise<ComparisonResult> {
  const db = prisma as any;

  // Load items for both versions
  const [leftItems, rightItems]: [Item[], Item[]] = await Promise.all([
    db.artifactVersionItem.findMany({
      where: { artifactVersionId: leftVersionId },
      orderBy: { sequence: "asc" },
    }),
    db.artifactVersionItem.findMany({
      where: { artifactVersionId: rightVersionId },
      orderBy: { sequence: "asc" },
    }),
  ]);

  // Matching state
  const leftUsed = new Set<string>();
  const rightUsed = new Set<string>();

  type Pair = {
    leftItem: Item | null;
    rightItem: Item | null;
    matchTier: number | null;
    similarity: number | null;
  };

  const pairs: Pair[] = [];

  // Tier 1: exact declaredId match
  for (const l of leftItems) {
    if (!l.declaredId) continue;
    const r = rightItems.find((ri) => !rightUsed.has(ri.id) && ri.declaredId && ri.declaredId === l.declaredId);
    if (r) {
      pairs.push({ leftItem: l, rightItem: r, matchTier: 1, similarity: 1 });
      leftUsed.add(l.id);
      rightUsed.add(r.id);
    }
  }

  // Tier 2: exact normalizedTitle match
  for (const l of leftItems) {
    if (leftUsed.has(l.id) || !l.normalizedTitle) continue;
    const r = rightItems.find(
      (ri) => !rightUsed.has(ri.id) && ri.normalizedTitle.toLowerCase() === l.normalizedTitle.toLowerCase()
    );
    if (r) {
      pairs.push({ leftItem: l, rightItem: r, matchTier: 2, similarity: 1 });
      leftUsed.add(l.id);
      rightUsed.add(r.id);
    }
  }

  // Tier 3: fuzzy title match (Jaro-Winkler)
  for (const l of leftItems) {
    if (leftUsed.has(l.id) || !l.normalizedTitle) continue;
    let bestScore = FUZZY_THRESHOLD;
    let bestRight: Item | null = null;
    for (const r of rightItems) {
      if (rightUsed.has(r.id) || !r.normalizedTitle) continue;
      const score = jaro(l.normalizedTitle, r.normalizedTitle);
      if (score > bestScore) { bestScore = score; bestRight = r; }
    }
    if (bestRight) {
      pairs.push({ leftItem: l, rightItem: bestRight, matchTier: 3, similarity: Math.round(bestScore * 100) / 100 });
      leftUsed.add(l.id);
      rightUsed.add(bestRight.id);
    }
  }

  // Tier 4: position match (same sequence number)
  for (const l of leftItems) {
    if (leftUsed.has(l.id)) continue;
    const r = rightItems.find((ri) => !rightUsed.has(ri.id) && ri.sequence === l.sequence);
    if (r) {
      const sim = jaro(l.normalizedTitle, r.normalizedTitle);
      if (sim >= 0.5) {
        pairs.push({ leftItem: l, rightItem: r, matchTier: 4, similarity: Math.round(sim * 100) / 100 });
        leftUsed.add(l.id);
        rightUsed.add(r.id);
      }
    }
  }

  // Unmatched left = DELETED
  for (const l of leftItems) {
    if (!leftUsed.has(l.id)) pairs.push({ leftItem: l, rightItem: null, matchTier: null, similarity: null });
  }

  // Unmatched right = ADDED
  for (const r of rightItems) {
    if (!rightUsed.has(r.id)) pairs.push({ leftItem: null, rightItem: r, matchTier: null, similarity: null });
  }

  // Temporal + disposition classification
  const runId = newId();
  const pairRows: any[] = [];
  const stats = { matched: 0, added: 0, deleted: 0, modified: 0, unchanged: 0 };

  for (const p of pairs) {
    let temporal: string;
    if (!p.leftItem) {
      temporal = "ADDED";
      stats.added++;
    } else if (!p.rightItem) {
      temporal = "DELETED";
      stats.deleted++;
    } else if (p.leftItem.rawText === p.rightItem.rawText) {
      temporal = "UNCHANGED";
      stats.unchanged++;
      stats.matched++;
    } else {
      temporal = "MODIFIED";
      stats.modified++;
      stats.matched++;
    }

    const disposition = classifyDisposition(artifactType, p.leftItem, p.rightItem, temporal);

    pairRows.push({
      id: newId(),
      runId,
      leftItemId: p.leftItem?.id ?? null,
      rightItemId: p.rightItem?.id ?? null,
      matchTier: p.matchTier,
      temporalClass: temporal,
      dispositionClass: disposition,
      similarity: p.similarity,
      createdAt: new Date(),
    });
  }

  // Persist run + pairs
  await db.comparisonRun.create({
    data: {
      id: runId,
      projectId,
      leftVersionId,
      rightVersionId,
      artifactType,
      status: "complete",
      matchedCount: stats.matched,
      addedCount: stats.added,
      deletedCount: stats.deleted,
      modifiedCount: stats.modified,
      unchangedCount: stats.unchanged,
      createdAt: new Date(),
    },
  });

  if (pairRows.length > 0) {
    await db.comparisonPair.createMany({ data: pairRows });
  }

  // Build result (attach titles for convenience)
  const leftById = Object.fromEntries(leftItems.map((i) => [i.id, i]));
  const rightById = Object.fromEntries(rightItems.map((i) => [i.id, i]));

  return {
    runId,
    artifactType,
    stats,
    pairs: pairRows.map((row) => ({
      id: row.id,
      temporalClass: row.temporalClass,
      dispositionClass: row.dispositionClass,
      matchTier: row.matchTier,
      similarity: row.similarity,
      leftItemId: row.leftItemId,
      rightItemId: row.rightItemId,
      leftTitle: row.leftItemId ? (leftById[row.leftItemId]?.normalizedTitle ?? null) : null,
      rightTitle: row.rightItemId ? (rightById[row.rightItemId]?.normalizedTitle ?? null) : null,
    })),
  };
}
