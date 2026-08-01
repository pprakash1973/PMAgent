/**
 * BL Integration test — runs against live Neon DB.
 * Run: DATABASE_URL="..." npx tsx scripts/test-bl-integration.mts
 */
// Must be set before any Prisma import resolution
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:")) {
  console.error("Set DATABASE_URL to the Neon postgres URL before running.");
  process.exit(1);
}

import { prisma } from "../src/lib/db.js";
const db = prisma as any;

let pass = 0, fail = 0;
function ok(label: string) { console.log(`  ✓ ${label}`); pass++; }
function ko(label: string, detail?: string) {
  console.log(`  ✗ ${label}${detail ? ": " + detail : ""}`); fail++;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2, 14);
}

async function getFirstProject() {
  const p = await (prisma as any).$queryRaw`SELECT id, name FROM "Project" LIMIT 1`;
  return (p as any[])[0] ?? null;
}

async function getFirstArtifactVersionPair(projectId: string) {
  const versions = await db.artifactVersion.findMany({
    where: { artifact: { projectId } },
    select: {
      id: true,
      versionNumber: true,
      artifactId: true,
      approvalStatus: true,
      artifact: { select: { artifactType: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  // Group by artifactId, find one with >= 2 versions
  const byArtifact: Record<string, any[]> = {};
  for (const v of versions) {
    (byArtifact[v.artifactId] ??= []).push(v);
  }
  for (const [, vs] of Object.entries(byArtifact)) {
    if (vs.length >= 2) return { left: vs[0], right: vs[1] };
  }
  return null;
}

// ── Test 1: DB connectivity + table presence ──────────────────────────────────

console.log("\n── T1: DB Connectivity ──────────────────────────────────────────");

const project = await getFirstProject();
if (project) {
  ok(`Project found: ${project.name}`);
} else {
  ko("No projects in DB");
}

const avCount = await db.artifactVersion.count();
if (avCount > 0) {
  ok(`ArtifactVersions: ${avCount}`);
} else {
  ko("No artifact versions in DB");
}

// ── Test 2: BL tables exist and are queryable ─────────────────────────────────

console.log("\n── T2: BL Tables Queryable ──────────────────────────────────────");

for (const model of ["pmbSnapshot","pmbSnapshotMember","comparisonRun","comparisonPair","impactReport","comparisonGoldEntry","accuracyReport"] as const) {
  try {
    const cnt = await db[model].count();
    ok(`${model}: ${cnt} rows`);
  } catch (e: any) {
    ko(`${model} query failed`, e.message);
  }
}

// ── Test 3: PMB Snapshot readiness check ─────────────────────────────────────

console.log("\n── T3: PMB Readiness (lib import) ───────────────────────────────");

if (project) {
  const { checkBaselineReadiness } = await import("../src/lib/pmb-snapshot.js");
  try {
    const readiness = await checkBaselineReadiness(project.id);
    ok(`readiness.checks returned ${readiness.checks.length} artifact types`);
    ok(`ready=${readiness.ready}, requiredMet=${readiness.requiredMet}/3`);
  } catch (e: any) {
    ko("checkBaselineReadiness threw", e.message);
  }
}

// ── Test 4: PMB Snapshot create (then delete to stay clean) ──────────────────

console.log("\n── T4: PMB Snapshot create + delete ─────────────────────────────");

if (project) {
  const { createSnapshot } = await import("../src/lib/pmb-snapshot.js");
  let snapId: string | null = null;
  try {
    const result = await createSnapshot(
      project.id,
      "Integration Test Snapshot",
      "ad_hoc",
      "test-user",
      "Created by integration test — safe to delete"
    );
    snapId = result.snapshot.id;
    ok(`Snapshot created: id=${snapId}, members=${result.memberCount}`);
  } catch (e: any) {
    ko("createSnapshot threw", e.message);
  }

  if (snapId) {
    // cleanup
    await db.pmbSnapshotMember.deleteMany({ where: { snapshotId: snapId } });
    await db.pmbSnapshot.delete({ where: { id: snapId } });
    ok("Snapshot cleaned up");
  }
}

// ── Test 5: Comparison run (needs 2 versions of same artifact) ─────────────────

console.log("\n── T5: Comparison run ───────────────────────────────────────────");

if (project) {
  const pair = await getFirstArtifactVersionPair(project.id);
  if (pair) {
    ok(`Found version pair for artifact ${pair.left.artifactId} (v${pair.left.versionNumber} vs v${pair.right.versionNumber})`);
    const { runComparison } = await import("../src/lib/comparison-engine.js");
    try {
      const result = await runComparison(
        project.id,
        pair.left.id,
        pair.right.id,
        pair.left.artifact.artifactType
      );
      ok(`Comparison runId=${result.runId}, matched=${result.stats.matched}, added=${result.stats.added}, deleted=${result.stats.deleted}`);

      // ── Test 6: Impact computation ─────────────────────────────────────────
      console.log("\n── T6: Impact computation ───────────────────────────────────────");
      const { computeImpact } = await import("../src/lib/impact-engine.js");
      try {
        const impact = await computeImpact(result.runId, project.id);
        ok(`Impact: risk=${impact.overallRisk}, confidence=${impact.confidence?.toFixed(2)}`);
        ok(`Impact scores: scope=${impact.scopeScore?.toFixed(2)}, schedule=${impact.scheduleScore?.toFixed(2)}, cost=${impact.costScore?.toFixed(2)}`);
      } catch (e: any) {
        ko("computeImpact threw", e.message);
      }

      // ── Test 7: Gold set + accuracy eval ──────────────────────────────────
      console.log("\n── T7: Gold entry + accuracy eval ───────────────────────────────");
      const { evaluateAccuracy } = await import("../src/lib/accuracy-evaluator.js");

      // Insert a gold entry
      const goldId = randomId();
      await db.comparisonGoldEntry.create({
        data: {
          id: goldId,
          projectId: project.id,
          artifactType: pair.left.artifact.artifactType,
          leftItemTitle: "test-item-" + randomId(),
          expectedMatchDecision: "no_match",
          createdAt: new Date(),
        },
      });
      ok("Gold entry created");

      try {
        const acc = await evaluateAccuracy(result.runId, project.id);
        ok(`Accuracy: tp=${acc.truePositives}, fp=${acc.falsePositives}, fn=${acc.falseNegatives}, grade=${acc.grade}`);
      } catch (e: any) {
        ko("evaluateAccuracy threw", e.message);
      }

      // cleanup gold entry
      await db.comparisonGoldEntry.delete({ where: { id: goldId } });
      ok("Gold entry cleaned up");

      // cleanup comparison run (cascades to pairs, impact, accuracy)
      await db.impactReport.deleteMany({ where: { runId: result.runId } });
      await db.accuracyReport.deleteMany({ where: { runId: result.runId } });
      await db.comparisonPair.deleteMany({ where: { runId: result.runId } });
      await db.comparisonRun.delete({ where: { id: result.runId } });
      ok("Comparison run cleaned up");

    } catch (e: any) {
      ko("runComparison threw", e.message);
    }
  } else {
    console.log("  ~ No artifact with 2+ versions found — skipping comparison tests");
  }
}

// ── Test 8: GR-BL-07 verification ─────────────────────────────────────────────

console.log("\n── T8: GR-BL-07 Baseline Verification ───────────────────────────");

if (project) {
  const { verifyBaseline } = await import("../src/lib/baseline-copilot.js");
  try {
    const v = await verifyBaseline(project.id);
    ok(`verify: pass=${v.pass}, score=${v.score}`);
    v.checks.forEach((c) => ok(`  check ${c.id}: ${c.pass ? "pass" : "fail"} — ${c.detail}`));
  } catch (e: any) {
    ko("verifyBaseline threw", e.message);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

await (db as any).$disconnect?.();

console.log(`\n${"═".repeat(64)}`);
console.log(`  Integration Results: ${pass} passed, ${fail} failed`);
console.log(`${"═".repeat(64)}\n`);
if (fail > 0) process.exit(1);
