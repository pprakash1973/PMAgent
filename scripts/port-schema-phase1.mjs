/**
 * Phase 1 of the personal-repo reconciliation: bring the 9 missing Prisma
 * models into the corporate schema.
 *
 * Purely additive. Corporate's schema is a strict subset of the personal one —
 * there are zero models present on corporate and absent on personal — so no
 * existing definition is modified, only extended with back-references.
 *
 * Run once. It is idempotent: a second run detects the models are present and
 * exits without touching the file.
 *
 *   node scripts/port-schema-phase1.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const SCHEMA = "prisma/schema.prisma";

const MODELS = [
  "Assumption", "BudgetRevision", "CollectionCycle", "CollectionToken",
  "Decision", "Dependency", "ScopeBaseline", "TaskActualsLedger", "TaskAssignment",
];

/** Back-references each host model needs so Prisma's relations resolve. */
const BACKREFS = {
  Project: [
    "  decisions            Decision[]",
    "  scopeBaselines       ScopeBaseline[]",
    "  assumptions          Assumption[]",
    "  dependencies         Dependency[]",
    "  budgetRevisions      BudgetRevision[]",
    "  taskAssignments      TaskAssignment[]",
    "  collectionCycles     CollectionCycle[]",
    "  collectionTokens     CollectionToken[]",
    "  taskActuals          TaskActualsLedger[]",
  ],
  Artifact: [
    "  scopeBaselineId String?",
    "  scopeBaseline   ScopeBaseline? @relation(fields: [scopeBaselineId], references: [id])",
  ],
  ChangeRequest: ["  budgetRevisions BudgetRevision[]"],
  ProjectResource: [
    "  assignments TaskAssignment[]",
    "  tokens      CollectionToken[]",
    "  actuals     TaskActualsLedger[]",
  ],
  ScheduleTask: [
    "  assignments TaskAssignment[]",
    "  actuals     TaskActualsLedger[]",
  ],
};

const personal = execSync("git show pprakash/main:prisma/schema.prisma", {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

/** Pull one `model X { ... }` block out of a schema, brace-balanced. */
function extractModel(src, name) {
  const start = src.indexOf(`model ${name} {`);
  if (start < 0) throw new Error(`model ${name} not found in the personal schema`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

/** Insert lines just before the closing brace of a model block. */
function addToModel(src, name, lines) {
  const start = src.indexOf(`model ${name} {`);
  if (start < 0) throw new Error(`host model ${name} not found in the corporate schema`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  const body = src.slice(start, i);
  const already = lines.every((l) => body.includes(l.trim().split(/\s+/)[0]));
  if (already) return { src, skipped: true };
  return {
    src: `${src.slice(0, i)}\n  // ── ported from pprakash/main (phase 1) ──\n${lines.join("\n")}\n${src.slice(i)}`,
    skipped: false,
  };
}

let schema = fs.readFileSync(SCHEMA, "utf8");

if (MODELS.every((m) => schema.includes(`model ${m} {`))) {
  console.log("All 9 models already present — nothing to do.");
  process.exit(0);
}

for (const [host, lines] of Object.entries(BACKREFS)) {
  const r = addToModel(schema, host, lines);
  schema = r.src;
  console.log(`  ${r.skipped ? "skip" : "  +="} ${host} (${lines.length} field(s))`);
}

const blocks = MODELS.map((m) => extractModel(personal, m));
schema = `${schema.trimEnd()}

// ─────────────────────────────────────────────────────────────────────────────
// Ported from pprakash/main — phase 1 of the personal-repo reconciliation.
//
// These 9 models back features that exist on the personal repo but never
// reached the corporate line: decisions, assumptions, dependencies, scope
// baselines, budget revisions, and the task-actuals collection flow.
//
// Copied verbatim rather than re-derived, so the ported route handlers work
// against the field names they already expect.
// ─────────────────────────────────────────────────────────────────────────────

${blocks.join("\n\n")}
`;

fs.writeFileSync(SCHEMA, schema);
console.log(`\n  +9 models appended: ${MODELS.join(", ")}`);
