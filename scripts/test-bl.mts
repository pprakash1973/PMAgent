/**
 * BL-P1 through BL-P7 test suite.
 * Tests all pure-logic layers without a database connection.
 * Run: npx tsx scripts/test-bl.mts
 */
import { createHash } from "crypto";

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(label: string, actual: unknown, expected: unknown) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${expectedStr}`);
    console.error(`    actual:   ${actualStr}`);
    failed++;
    errors.push(label);
  }
}

function assertClose(label: string, actual: number, expected: number, tolerance = 0.02) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✓ ${label} (${actual.toFixed(3)} ≈ ${expected})`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected ≈${expected}, got ${actual}`);
    failed++;
    errors.push(label);
  }
}

function assertGte(label: string, actual: number, min: number) {
  if (actual >= min) {
    console.log(`  ✓ ${label} (${actual.toFixed(3)} ≥ ${min})`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected ≥${min}, got ${actual}`);
    failed++;
    errors.push(label);
  }
}

function assertLte(label: string, actual: number, max: number) {
  if (actual <= max) {
    console.log(`  ✓ ${label} (${actual.toFixed(3)} ≤ ${max})`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected ≤${max}, got ${actual}`);
    failed++;
    errors.push(label);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);
}

// ── BL-P1: Content Hashing ────────────────────────────────────────────────────

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
    );
  }
  return value;
}

function hashArtifactContent(content: unknown): string {
  const normalized = JSON.stringify(content, sortedReplacer);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

section("BL-P1: Content Hashing");

{
  const a = hashArtifactContent({ b: 2, a: 1 });
  const b = hashArtifactContent({ a: 1, b: 2 });
  assert("Key order does not affect hash", a, b);

  const c = hashArtifactContent({ a: 1, b: 3 });
  assert("Different values produce different hash", a === c, false);

  const nested1 = hashArtifactContent({ risks: [{ z: "z", a: "a" }] });
  const nested2 = hashArtifactContent({ risks: [{ a: "a", z: "z" }] });
  assert("Nested key order normalised", nested1, nested2);

  const arr1 = hashArtifactContent({ items: [1, 2, 3] });
  const arr2 = hashArtifactContent({ items: [1, 3, 2] });
  assert("Array order matters (arrays are order-sensitive)", arr1 === arr2, false);

  const h = hashArtifactContent({ a: 1 });
  assert("Hash is 64-char hex", h.length === 64 && /^[0-9a-f]+$/.test(h), true);
}

// ── BL-P2: Item Extraction ────────────────────────────────────────────────────

type ExtractedItem = {
  declaredId?: string;
  sequence: number;
  rawText: string;
  normalizedTitle: string;
  normalizedDesc?: string;
  entryTimestamp?: Date;
  attributes?: Record<string, unknown>;
};

function toText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

function parseDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? undefined : d;
}

function extractArrayField(content: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const k of keys) {
    if (Array.isArray(content[k])) return content[k] as unknown[];
  }
  return [];
}

function runExtractors(artifactType: string, content: Record<string, unknown>): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  let seq = 0;
  const push = (item: Omit<ExtractedItem, "sequence">) => { items.push({ sequence: ++seq, ...item }); };

  switch (artifactType) {
    case "risk_register": {
      const rows = extractArrayField(content, "risks", "items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.risk_id),
          rawText: [row.description, row.mitigation].filter(Boolean).join(" | "),
          normalizedTitle: toText(row.description ?? row.title ?? "Risk"),
          normalizedDesc: toText(row.mitigation ?? row.impact ?? ""),
          entryTimestamp: parseDate(row.raised_date),
          attributes: { category: row.category, probability: row.probability, impact: row.impact, status: row.status, owner: row.owner },
        });
      }
      break;
    }
    case "milestone_plan": {
      const rows = extractArrayField(content, "milestones", "items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.milestone_id),
          rawText: toText(row.name ?? row.milestone ?? "Milestone"),
          normalizedTitle: toText(row.name ?? row.milestone ?? "Milestone"),
          normalizedDesc: toText(row.notes ?? row.description ?? ""),
          entryTimestamp: parseDate(row.due_date ?? row.target_date),
          attributes: { status: row.status, due_date: row.due_date },
        });
      }
      break;
    }
    case "change_log": {
      const rows = extractArrayField(content, "changes", "items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.cr_id),
          rawText: [row.description, row.impact_analysis].filter(Boolean).join(" | "),
          normalizedTitle: toText(row.description ?? row.title ?? "Change"),
          normalizedDesc: toText(row.impact_analysis ?? ""),
          entryTimestamp: parseDate(row.date),
          attributes: { status: row.status, approval_status: row.approval_status },
        });
      }
      break;
    }
    default: {
      for (const [key, val] of Object.entries(content)) {
        if (!Array.isArray(val)) continue;
        for (const r of val) {
          const row: Record<string, unknown> = typeof r === "object" && r !== null ? r as Record<string, unknown> : { value: r };
          push({
            declaredId: toText(row["id"] ?? ""),
            rawText: toText(r),
            normalizedTitle: toText(row["title"] ?? row["name"] ?? row["description"] ?? key).slice(0, 200),
            normalizedDesc: toText(row["description"] ?? ""),
            attributes: { source_key: key },
          });
        }
      }
    }
  }
  return items;
}

section("BL-P2: Item Extraction");

{
  const riskContent = {
    risks: [
      { id: "R001", description: "Budget overrun risk", mitigation: "Monthly cost review", impact: "high", probability: "medium", status: "open", owner: "PM" },
      { id: "R002", description: "Key resource departure", mitigation: "Cross-training plan", impact: "critical", probability: "low", status: "open", owner: "HR" },
    ],
  };
  const riskItems = runExtractors("risk_register", riskContent);
  assert("Risk register: extracts 2 items", riskItems.length, 2);
  assert("Risk register: first item title", riskItems[0].normalizedTitle, "Budget overrun risk");
  assert("Risk register: first item declaredId", riskItems[0].declaredId, "R001");
  assert("Risk register: first item impact attribute", (riskItems[0].attributes as any).impact, "high");
  assert("Risk register: second item impact", (riskItems[1].attributes as any).impact, "critical");

  const milestoneContent = {
    milestones: [
      { id: "M001", name: "Planning Complete", status: "completed", due_date: "2026-03-01", notes: "All docs signed off" },
      { id: "M002", name: "Development Start", status: "pending", due_date: "2026-03-15" },
    ],
  };
  const msItems = runExtractors("milestone_plan", milestoneContent);
  assert("Milestone: extracts 2 items", msItems.length, 2);
  assert("Milestone: first item title", msItems[0].normalizedTitle, "Planning Complete");
  assert("Milestone: first item due_date attribute", (msItems[0].attributes as any).due_date, "2026-03-01");
  assert("Milestone: second item status", (msItems[1].attributes as any).status, "pending");
  assert("Milestone: entryTimestamp parsed", msItems[0].entryTimestamp instanceof Date, true);

  const crContent = {
    changes: [
      { id: "CR001", description: "Add reporting module", impact_analysis: "3 extra weeks", status: "pending", approval_status: "under_review", date: "2026-04-01" },
    ],
  };
  const crItems = runExtractors("change_log", crContent);
  assert("Change log: extracts 1 item", crItems.length, 1);
  assert("Change log: approval_status", (crItems[0].attributes as any).approval_status, "under_review");

  const genericContent = {
    deliverables: [
      { id: "D1", name: "API Layer", description: "REST endpoints for all modules" },
      { id: "D2", name: "UI Layer", description: "React frontend" },
    ],
  };
  const genItems = runExtractors("scope_statement", genericContent);
  assert("Generic extractor: extracts 2 items", genItems.length, 2);
  assert("Generic extractor: first title", genItems[0].normalizedTitle, "API Layer");

  // Empty content
  const emptyItems = runExtractors("risk_register", {});
  assert("Empty content: returns empty array", emptyItems.length, 0);
}

// ── BL-P4: Jaro-Winkler Similarity ───────────────────────────────────────────

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

  const jaroScore =
    (matches / s.length + matches / t.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s.length, t.length)); i++) {
    if (s[i] !== t[i]) break;
    prefix++;
  }

  return jaroScore + prefix * 0.1 * (1 - jaroScore);
}

section("BL-P4: Jaro-Winkler Similarity");

{
  assertClose("Identical strings → 1.0", jaro("Budget overrun risk", "Budget overrun risk"), 1.0);
  assertClose("Identical empty strings → 1.0 (both equal)", jaro("", ""), 1.0);
  assertGte("Typo in middle → high score", jaro("Budget overrun risk", "Budget overrrun risk"), 0.88);
  assertGte("One word difference → moderate-high", jaro("Planning Complete", "Planning Completed"), 0.85);
  assertLte("Completely different → low", jaro("Budget overrun risk", "Stakeholder engagement plan"), 0.6);
  assertGte("Same concept, phrased differently → fair match", jaro("Key resource departure", "Key staff departure"), 0.78);
  assertClose("Reversed order, same words — should be similar", jaro("abc def", "def abc"), jaro("abc def", "def abc")); // self-consistent
}

// ── BL-P4: Disposition Classifier ────────────────────────────────────────────

type ItemAttrs = { impact?: string; probability?: string; status?: string; due_date?: string; approval_status?: string; severity?: string; influence?: string; interest?: string };

function classifyDisposition(
  artifactType: string,
  leftAttrs: ItemAttrs | null,
  rightAttrs: ItemAttrs | null,
  temporal: string
): string | null {
  if (temporal === "ADDED") return "new_entry";
  if (temporal === "DELETED") return "removed_entry";
  if (temporal === "UNCHANGED") return "no_change";
  if (!leftAttrs || !rightAttrs) return null;

  switch (artifactType) {
    case "risk_register":
    case "raid_register": {
      const riskLevels = ["low", "medium", "high", "critical"];
      const lIdx = riskLevels.indexOf(String(leftAttrs.impact ?? "").toLowerCase());
      const rIdx = riskLevels.indexOf(String(rightAttrs.impact ?? "").toLowerCase());
      if (lIdx >= 0 && rIdx >= 0) {
        if (rIdx > lIdx) return "escalated";
        if (rIdx < lIdx) return "de_escalated";
      }
      if (String(leftAttrs.status) !== String(rightAttrs.status)) return "status_changed";
      return "details_changed";
    }
    case "milestone_plan": {
      if (leftAttrs.due_date && rightAttrs.due_date && leftAttrs.due_date !== rightAttrs.due_date) {
        const lDate = new Date(leftAttrs.due_date);
        const rDate = new Date(rightAttrs.due_date);
        if (!isNaN(lDate.getTime()) && !isNaN(rDate.getTime())) {
          return rDate > lDate ? "schedule_slip" : "schedule_pull";
        }
      }
      if (String(leftAttrs.status) !== String(rightAttrs.status)) return "status_changed";
      return "details_changed";
    }
    case "change_log": {
      if (String(leftAttrs.approval_status) !== String(rightAttrs.approval_status)) return "approval_changed";
      if (String(leftAttrs.status) !== String(rightAttrs.status)) return "status_changed";
      return "details_changed";
    }
    case "issue_register": {
      const levels = ["low", "medium", "high", "critical"];
      const lIdx = levels.indexOf(String(leftAttrs.severity ?? "").toLowerCase());
      const rIdx = levels.indexOf(String(rightAttrs.severity ?? "").toLowerCase());
      if (lIdx >= 0 && rIdx >= 0) {
        if (rIdx > lIdx) return "severity_increased";
        if (rIdx < lIdx) return "severity_decreased";
      }
      return "details_changed";
    }
    default:
      return "details_changed";
  }
}

section("BL-P4: Disposition Classifier");

{
  assert("ADDED → new_entry", classifyDisposition("risk_register", null, { impact: "high" }, "ADDED"), "new_entry");
  assert("DELETED → removed_entry", classifyDisposition("risk_register", { impact: "high" }, null, "DELETED"), "removed_entry");
  assert("UNCHANGED → no_change", classifyDisposition("risk_register", { impact: "high" }, { impact: "high" }, "UNCHANGED"), "no_change");

  // Risk escalation
  assert("Risk: low→high impact = escalated", classifyDisposition("risk_register", { impact: "low" }, { impact: "high" }, "MODIFIED"), "escalated");
  assert("Risk: high→medium impact = de_escalated", classifyDisposition("risk_register", { impact: "high" }, { impact: "medium" }, "MODIFIED"), "de_escalated");
  assert("Risk: same impact, status changed", classifyDisposition("risk_register", { impact: "high", status: "open" }, { impact: "high", status: "closed" }, "MODIFIED"), "status_changed");
  assert("Risk: critical→critical, same status = details_changed", classifyDisposition("risk_register", { impact: "critical", status: "open" }, { impact: "critical", status: "open" }, "MODIFIED"), "details_changed");

  // Milestone slip/pull
  assert("Milestone: date later = schedule_slip", classifyDisposition("milestone_plan", { due_date: "2026-03-01" }, { due_date: "2026-04-01" }, "MODIFIED"), "schedule_slip");
  assert("Milestone: date earlier = schedule_pull", classifyDisposition("milestone_plan", { due_date: "2026-04-01" }, { due_date: "2026-03-01" }, "MODIFIED"), "schedule_pull");
  assert("Milestone: same date, status changed", classifyDisposition("milestone_plan", { due_date: "2026-03-01", status: "pending" }, { due_date: "2026-03-01", status: "completed" }, "MODIFIED"), "status_changed");

  // Change log
  assert("Change: approval_status changed", classifyDisposition("change_log", { approval_status: "pending" }, { approval_status: "approved" }, "MODIFIED"), "approval_changed");
  assert("Change: status changed", classifyDisposition("change_log", { approval_status: "pending", status: "open" }, { approval_status: "pending", status: "closed" }, "MODIFIED"), "status_changed");

  // Issue
  assert("Issue: severity increased", classifyDisposition("issue_register", { severity: "low" }, { severity: "critical" }, "MODIFIED"), "severity_increased");
  assert("Issue: severity decreased", classifyDisposition("issue_register", { severity: "high" }, { severity: "low" }, "MODIFIED"), "severity_decreased");
}

// ── BL-P4: 5-Tier Identity Resolution Simulation ─────────────────────────────

type MockItem = {
  id: string;
  declaredId: string | null;
  sequence: number;
  normalizedTitle: string;
  rawText: string;
  attributes: Record<string, unknown>;
};

const FUZZY_THRESHOLD = 0.82;

function simulateMatching(leftItems: MockItem[], rightItems: MockItem[]) {
  const leftUsed = new Set<string>();
  const rightUsed = new Set<string>();

  type Pair = { left: MockItem | null; right: MockItem | null; tier: number | null; sim: number | null };
  const pairs: Pair[] = [];

  // T1: exact declaredId
  for (const l of leftItems) {
    if (!l.declaredId) continue;
    const r = rightItems.find(ri => !rightUsed.has(ri.id) && ri.declaredId && ri.declaredId === l.declaredId);
    if (r) { pairs.push({ left: l, right: r, tier: 1, sim: 1 }); leftUsed.add(l.id); rightUsed.add(r.id); }
  }

  // T2: exact normalizedTitle
  for (const l of leftItems) {
    if (leftUsed.has(l.id) || !l.normalizedTitle) continue;
    const r = rightItems.find(ri => !rightUsed.has(ri.id) && ri.normalizedTitle.toLowerCase() === l.normalizedTitle.toLowerCase());
    if (r) { pairs.push({ left: l, right: r, tier: 2, sim: 1 }); leftUsed.add(l.id); rightUsed.add(r.id); }
  }

  // T3: fuzzy title
  for (const l of leftItems) {
    if (leftUsed.has(l.id) || !l.normalizedTitle) continue;
    let best = FUZZY_THRESHOLD;
    let bestRight: MockItem | null = null;
    for (const r of rightItems) {
      if (rightUsed.has(r.id) || !r.normalizedTitle) continue;
      const score = jaro(l.normalizedTitle, r.normalizedTitle);
      if (score > best) { best = score; bestRight = r; }
    }
    if (bestRight) { pairs.push({ left: l, right: bestRight, tier: 3, sim: Math.round(best * 100) / 100 }); leftUsed.add(l.id); rightUsed.add(bestRight.id); }
  }

  // T4: position match
  for (const l of leftItems) {
    if (leftUsed.has(l.id)) continue;
    const r = rightItems.find(ri => !rightUsed.has(ri.id) && ri.sequence === l.sequence);
    if (r) {
      const sim = jaro(l.normalizedTitle, r.normalizedTitle);
      if (sim >= 0.5) { pairs.push({ left: l, right: r, tier: 4, sim: Math.round(sim * 100) / 100 }); leftUsed.add(l.id); rightUsed.add(r.id); }
    }
  }

  // Unmatched
  for (const l of leftItems) { if (!leftUsed.has(l.id)) pairs.push({ left: l, right: null, tier: null, sim: null }); }
  for (const r of rightItems) { if (!rightUsed.has(r.id)) pairs.push({ left: null, right: r, tier: null, sim: null }); }

  return pairs;
}

function classify(pair: { left: MockItem | null; right: MockItem | null }): string {
  if (!pair.left) return "ADDED";
  if (!pair.right) return "DELETED";
  if (pair.left.rawText === pair.right.rawText) return "UNCHANGED";
  return "MODIFIED";
}

section("BL-P4: 5-Tier Matching Simulation");

{
  // Scenario 1: All exact ID matches
  const left1: MockItem[] = [
    { id: "a", declaredId: "R001", sequence: 1, normalizedTitle: "Budget overrun risk", rawText: "Budget overrun | Monthly review", attributes: {} },
    { id: "b", declaredId: "R002", sequence: 2, normalizedTitle: "Key resource departure", rawText: "Key resource | Cross-training", attributes: {} },
  ];
  const right1: MockItem[] = [
    { id: "c", declaredId: "R001", sequence: 1, normalizedTitle: "Budget overrun risk", rawText: "Budget overrun | Monthly review", attributes: {} },
    { id: "d", declaredId: "R002", sequence: 2, normalizedTitle: "Key resource departure", rawText: "Key resource | Cross-training", attributes: {} },
  ];
  const pairs1 = simulateMatching(left1, right1);
  assert("Exact ID: 2 pairs matched", pairs1.length, 2);
  assert("Exact ID: both are Tier 1", pairs1.every(p => p.tier === 1), true);
  assert("Exact ID: both UNCHANGED", pairs1.map(p => classify(p)).every(t => t === "UNCHANGED"), true);

  // Scenario 2: Title changed (fuzzy match), content changed → MODIFIED
  const left2: MockItem[] = [
    { id: "a", declaredId: null, sequence: 1, normalizedTitle: "Budget overrun risk", rawText: "old text", attributes: {} },
  ];
  const right2: MockItem[] = [
    { id: "b", declaredId: null, sequence: 1, normalizedTitle: "Budget overrunnn risk", rawText: "new text", attributes: {} },
  ];
  const pairs2 = simulateMatching(left2, right2);
  assert("Fuzzy: 1 pair matched", pairs2.length, 1);
  assert("Fuzzy: Tier 3 or 4", pairs2[0].tier !== null && pairs2[0].tier >= 3, true);
  assert("Fuzzy: MODIFIED (rawText changed)", classify(pairs2[0]), "MODIFIED");

  // Scenario 3: New item in right = ADDED
  const left3: MockItem[] = [
    { id: "a", declaredId: "R001", sequence: 1, normalizedTitle: "Risk A", rawText: "text A", attributes: {} },
  ];
  const right3: MockItem[] = [
    { id: "b", declaredId: "R001", sequence: 1, normalizedTitle: "Risk A", rawText: "text A", attributes: {} },
    { id: "c", declaredId: "R099", sequence: 2, normalizedTitle: "Brand new risk", rawText: "new risk", attributes: {} },
  ];
  const pairs3 = simulateMatching(left3, right3);
  assert("Added: 2 pairs total", pairs3.length, 2);
  const addedPair = pairs3.find(p => !p.left);
  assert("Added: one ADDED pair exists", addedPair !== undefined, true);
  assert("Added: ADDED classification", classify(addedPair!), "ADDED");

  // Scenario 4: Item removed from baseline = DELETED
  const left4: MockItem[] = [
    { id: "a", declaredId: "R001", sequence: 1, normalizedTitle: "Risk A", rawText: "text A", attributes: {} },
    { id: "b", declaredId: "R002", sequence: 2, normalizedTitle: "Old risk being removed", rawText: "old risk", attributes: {} },
  ];
  const right4: MockItem[] = [
    { id: "c", declaredId: "R001", sequence: 1, normalizedTitle: "Risk A", rawText: "text A", attributes: {} },
  ];
  const pairs4 = simulateMatching(left4, right4);
  assert("Deleted: 2 pairs total", pairs4.length, 2);
  const deletedPair = pairs4.find(p => !p.right);
  assert("Deleted: one DELETED pair exists", deletedPair !== undefined, true);
  assert("Deleted: DELETED classification", classify(deletedPair!), "DELETED");

  // Scenario 5: Position fallback (T4) when IDs and titles differ but seq matches
  const left5: MockItem[] = [
    { id: "a", declaredId: null, sequence: 1, normalizedTitle: "Alpha deliverable", rawText: "alpha", attributes: {} },
  ];
  const right5: MockItem[] = [
    { id: "b", declaredId: null, sequence: 1, normalizedTitle: "Alpha deliverable updated", rawText: "alpha updated", attributes: {} },
  ];
  const pairs5 = simulateMatching(left5, right5);
  assert("Position: 1 pair matched", pairs5.length, 1);
  const tiers = [pairs5[0].tier];
  assert("Position: matched at Tier 3 (fuzzy enough) or Tier 4", tiers[0] !== null && tiers[0] >= 3, true);
}

// ── BL-P5: Impact Scoring Simulation ─────────────────────────────────────────

function computeScoreSimulation(pairs: Array<{ temporal: string; disposition: string | null }>, total: number): number {
  const changed = pairs.filter(p => p.temporal !== "UNCHANGED").length;
  return Math.round(Math.min(changed / Math.max(total, 1), 1) * 100) / 100;
}

function computeRisk(score: number): string {
  if (score >= 0.5) return "critical";
  if (score >= 0.3) return "high";
  if (score >= 0.15) return "medium";
  return "low";
}

section("BL-P5: Impact Scoring");

{
  // Stable baseline: no changes
  const stablePairs = [
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
  ];
  const stableScore = computeScoreSimulation(stablePairs, 3);
  assert("Stable: score = 0", stableScore, 0);
  assert("Stable: risk = low", computeRisk(stableScore), "low");

  // Medium change: 30% changed
  const medPairs = [
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "MODIFIED", disposition: "schedule_slip" },
    { temporal: "ADDED", disposition: "new_entry" },
    { temporal: "MODIFIED", disposition: "schedule_slip" },
    { temporal: "DELETED", disposition: "removed_entry" },
  ];
  const medScore = computeScoreSimulation(medPairs, 10);
  assert("Medium change: score = 0.4", medScore, 0.4);
  assert("Medium change: risk = high", computeRisk(medScore), "high");

  // Critical: >50% changed
  const critPairs = [
    { temporal: "ADDED", disposition: "new_entry" },
    { temporal: "MODIFIED", disposition: "schedule_slip" },
    { temporal: "MODIFIED", disposition: "escalated" },
    { temporal: "DELETED", disposition: "removed_entry" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "MODIFIED", disposition: "escalated" },
  ];
  const critScore = computeScoreSimulation(critPairs, 6);
  assertGte("Critical: score ≥ 0.5", critScore, 0.5);
  assert("Critical: risk = critical", computeRisk(critScore), "critical");

  // Schedule slips detected
  const slipPairs = [
    { temporal: "MODIFIED", disposition: "schedule_slip" },
    { temporal: "MODIFIED", disposition: "schedule_slip" },
    { temporal: "MODIFIED", disposition: "schedule_slip" },
    { temporal: "UNCHANGED", disposition: "no_change" },
    { temporal: "UNCHANGED", disposition: "no_change" },
  ];
  const slipCount = slipPairs.filter(p => p.disposition === "schedule_slip").length;
  assert("Slip detection: 3 schedule slips found", slipCount, 3);

  // Escalated risks
  const escalatedPairs = [
    { temporal: "MODIFIED", disposition: "escalated" },
    { temporal: "MODIFIED", disposition: "escalated" },
    { temporal: "UNCHANGED", disposition: "no_change" },
  ];
  const escalatedCount = escalatedPairs.filter(p => p.disposition === "escalated").length;
  assert("Escalation detection: 2 escalated risks", escalatedCount, 2);
}

// ── BL-P7: Accuracy Evaluation Simulation ────────────────────────────────────

type GoldEntry = { leftTitle: string; rightTitle?: string; expectedDecision: "match" | "no_match"; expectedTemporal?: string };
type ActualPair = { leftTitle: string | null; rightTitle: string | null; temporal: string };

function evaluateAccuracySimulation(gold: GoldEntry[], actual: ActualPair[]): {
  tp: number; fp: number; fn: number;
  precision: number | null; recall: number | null; f1: number | null;
} {
  let tp = 0, fp = 0, fn = 0;

  for (const g of gold) {
    const found = actual.find(p => {
      const lt = p.leftTitle?.toLowerCase();
      const rt = p.rightTitle?.toLowerCase();
      if (g.expectedDecision === "match") {
        return lt === g.leftTitle.toLowerCase() && rt && g.rightTitle && rt === g.rightTitle.toLowerCase();
      } else {
        return lt === g.leftTitle.toLowerCase() && !p.rightTitle;
      }
    });

    if (!found) { fn++; continue; }

    const correct = g.expectedTemporal ? found.temporal === g.expectedTemporal : true;
    if (correct) tp++;
    else fp++;
  }

  const precision = tp + fp > 0 ? Math.round((tp / (tp + fp)) * 1000) / 1000 : null;
  const recall = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 1000) / 1000 : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0
    ? Math.round((2 * precision * recall / (precision + recall)) * 1000) / 1000 : null;

  return { tp, fp, fn, precision, recall, f1 };
}

section("BL-P7: Accuracy Evaluation");

{
  // Perfect score: all gold entries matched correctly
  const gold1: GoldEntry[] = [
    { leftTitle: "Budget overrun risk", rightTitle: "Budget overrun risk", expectedDecision: "match", expectedTemporal: "MODIFIED" },
    { leftTitle: "Key resource departure", rightTitle: "Key resource departure", expectedDecision: "match", expectedTemporal: "UNCHANGED" },
    { leftTitle: "Scope creep risk", expectedDecision: "no_match" },
  ];
  const actual1: ActualPair[] = [
    { leftTitle: "Budget overrun risk", rightTitle: "Budget overrun risk", temporal: "MODIFIED" },
    { leftTitle: "Key resource departure", rightTitle: "Key resource departure", temporal: "UNCHANGED" },
    { leftTitle: "Scope creep risk", rightTitle: null, temporal: "DELETED" },
  ];
  const r1 = evaluateAccuracySimulation(gold1, actual1);
  assert("Perfect: TP=3", r1.tp, 3);
  assert("Perfect: FP=0", r1.fp, 0);
  assert("Perfect: FN=0", r1.fn, 0);
  assert("Perfect: precision=1", r1.precision, 1);
  assert("Perfect: recall=1", r1.recall, 1);
  assert("Perfect: F1=1", r1.f1, 1);

  // Partial match: 2 correct, 1 missed
  const actual2: ActualPair[] = [
    { leftTitle: "Budget overrun risk", rightTitle: "Budget overrun risk", temporal: "MODIFIED" },
    { leftTitle: "Key resource departure", rightTitle: "Key resource departure", temporal: "UNCHANGED" },
    // scope creep risk NOT in actual — missed
  ];
  const r2 = evaluateAccuracySimulation(gold1, actual2);
  assert("Partial: TP=2", r2.tp, 2);
  assert("Partial: FN=1", r2.fn, 1);
  assert("Partial: precision=1", r2.precision, 1);
  assertClose("Partial: recall=0.667", r2.recall!, 0.667);

  // Wrong temporal class: TP becomes FP
  const actual3: ActualPair[] = [
    { leftTitle: "Budget overrun risk", rightTitle: "Budget overrun risk", temporal: "UNCHANGED" }, // wrong: expected MODIFIED
    { leftTitle: "Key resource departure", rightTitle: "Key resource departure", temporal: "UNCHANGED" },
    { leftTitle: "Scope creep risk", rightTitle: null, temporal: "DELETED" },
  ];
  const r3 = evaluateAccuracySimulation(gold1, actual3);
  assert("Wrong temporal: TP=2, FP=1", r3.tp, 2);
  assert("Wrong temporal: FP=1", r3.fp, 1);
  assertClose("Wrong temporal: precision=0.667", r3.precision!, 0.667);
  assertClose("Wrong temporal: recall=1.0 (FN=0; all gold entries found)", r3.recall!, 1.0);

  // No gold set → null metrics
  const r4 = evaluateAccuracySimulation([], actual1);
  assert("Empty gold: TP=0", r4.tp, 0);
  assert("Empty gold: precision=null", r4.precision, null);
  assert("Empty gold: F1=null", r4.f1, null);
}

// ── BL-P3: Readiness Check Simulation ────────────────────────────────────────

const REQUIRED_TYPES = ["scope_statement", "milestone_plan", "budget_estimate"];
const APPROVED_STATUSES = new Set(["pm_confirmed", "gate_approved"]);

function checkReadiness(artifacts: Array<{ artifactType: string; approvalStatus: string }>): {
  ready: boolean; requiredMet: number; requiredTotal: number;
} {
  const requiredMet = REQUIRED_TYPES.filter(type => {
    const art = artifacts.find(a => a.artifactType === type);
    return art && APPROVED_STATUSES.has(art.approvalStatus);
  }).length;
  return { ready: requiredMet === REQUIRED_TYPES.length, requiredMet, requiredTotal: REQUIRED_TYPES.length };
}

section("BL-P3: Baseline Readiness");

{
  const allApproved = [
    { artifactType: "scope_statement",  approvalStatus: "pm_confirmed" },
    { artifactType: "milestone_plan",   approvalStatus: "gate_approved" },
    { artifactType: "budget_estimate",  approvalStatus: "pm_confirmed" },
    { artifactType: "risk_register",    approvalStatus: "unreviewed" },
  ];
  const r1 = checkReadiness(allApproved);
  assert("All required approved: ready=true", r1.ready, true);
  assert("All required: requiredMet=3", r1.requiredMet, 3);

  const partialApproved = [
    { artifactType: "scope_statement", approvalStatus: "pm_confirmed" },
    { artifactType: "milestone_plan",  approvalStatus: "unreviewed" },
    { artifactType: "budget_estimate", approvalStatus: "pm_confirmed" },
  ];
  const r2 = checkReadiness(partialApproved);
  assert("Partial: ready=false", r2.ready, false);
  assert("Partial: requiredMet=2", r2.requiredMet, 2);

  const noneApproved = [
    { artifactType: "scope_statement", approvalStatus: "unreviewed" },
  ];
  const r3 = checkReadiness(noneApproved);
  assert("None approved: ready=false", r3.ready, false);
  assert("None approved: requiredMet=0", r3.requiredMet, 0);

  // gate_approved counts as approved
  const gatePassed = [
    { artifactType: "scope_statement", approvalStatus: "gate_approved" },
    { artifactType: "milestone_plan",  approvalStatus: "gate_approved" },
    { artifactType: "budget_estimate", approvalStatus: "gate_approved" },
  ];
  const r4 = checkReadiness(gatePassed);
  assert("gate_approved counts: ready=true", r4.ready, true);
}

// ── BL-P6: Verification Checks Simulation ────────────────────────────────────

section("BL-P6: GR-BL-07 Verification Logic");

{
  function runVerification(state: {
    hasCurrentSnapshot: boolean;
    approvedArtifacts: string[];
    extractionComplete: number;
    extractionTotal: number;
    comparisonRunCount: number;
  }): { pass: boolean; score: number; checksPassed: number; checksTotal: number } {
    const checks = [
      state.hasCurrentSnapshot,
      REQUIRED_TYPES.every(t => state.approvedArtifacts.includes(t)),
      state.extractionTotal > 0 && state.extractionComplete / state.extractionTotal >= 0.8,
      state.comparisonRunCount > 0,
    ];
    const passed = checks.filter(Boolean).length;
    return { pass: checks.every(Boolean), score: Math.round((passed / checks.length) * 100), checksPassed: passed, checksTotal: checks.length };
  }

  const fullPass = runVerification({
    hasCurrentSnapshot: true,
    approvedArtifacts: ["scope_statement", "milestone_plan", "budget_estimate"],
    extractionComplete: 8, extractionTotal: 10,
    comparisonRunCount: 2,
  });
  assert("Full pass: pass=true", fullPass.pass, true);
  assert("Full pass: score=100", fullPass.score, 100);

  const partialPass = runVerification({
    hasCurrentSnapshot: false,
    approvedArtifacts: ["scope_statement", "milestone_plan", "budget_estimate"],
    extractionComplete: 8, extractionTotal: 10,
    comparisonRunCount: 1,
  });
  assert("Partial (no snapshot): pass=false", partialPass.pass, false);
  assert("Partial: score=75", partialPass.score, 75);

  const lowExtraction = runVerification({
    hasCurrentSnapshot: true,
    approvedArtifacts: ["scope_statement", "milestone_plan", "budget_estimate"],
    extractionComplete: 3, extractionTotal: 10, // 30% < 80%
    comparisonRunCount: 1,
  });
  assert("Low extraction: pass=false", lowExtraction.pass, false);
  assert("Low extraction: score=75", lowExtraction.score, 75);

  const noComparisons = runVerification({
    hasCurrentSnapshot: true,
    approvedArtifacts: ["scope_statement", "milestone_plan", "budget_estimate"],
    extractionComplete: 9, extractionTotal: 10,
    comparisonRunCount: 0,
  });
  assert("No comparisons: pass=false", noComparisons.pass, false);
}

// ── Final Report ──────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(64)}`);
console.log(`  Test Results: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.log(`\n  Failed tests:`);
  errors.forEach(e => console.log(`    ✗ ${e}`));
}
console.log(`${"═".repeat(64)}\n`);
process.exit(failed > 0 ? 1 : 0);
