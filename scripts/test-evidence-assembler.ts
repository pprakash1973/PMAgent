/**
 * Behavioural tests for the evidence assembler's retrieval paths.
 *
 * Runs against a stubbed Prisma client, so it needs no database. What it proves
 * is the decision logic — which arm runs, what happens when one fails, and that
 * TOP_K / dedup hold — not the SQL itself. SQL correctness needs the retrieval
 * eval in Phase 4 against a real Postgres.
 *
 *   npx tsx scripts/test-evidence-assembler.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import Module from "node:module";
import path from "node:path";

// ── Stub state, driven per test ─────────────────────────────────────────────
type Chunk = {
  id: string; text: string; sectionTitle: string | null;
  pageNumber: number | null; documentId: string; chunkIndex: number;
};

const stub = {
  count: 0,
  ftsRows: [] as Chunk[],
  ftsThrows: false,
  orderedRows: [] as Chunk[],
  queryRawCalls: 0,
};

function chunk(i: number, text = `chunk ${i}`): Chunk {
  return { id: `c${i}`, text, sectionTitle: null, pageNumber: 1, documentId: "d1", chunkIndex: i };
}

// ── Intercept "@/lib/db" and "@prisma/client" before the module under test ──
const prismaStub = {
  documentChunk: {
    count: async () => stub.count,
    findMany: async ({ take }: { take: number }) => stub.orderedRows.slice(0, take),
  },
  $queryRaw: async () => {
    stub.queryRawCalls++;
    if (stub.ftsThrows) throw new Error("relation does not exist");
    return stub.ftsRows;
  },
};

// _load is private API — the only interception point that works for the CJS
// output tsx produces. Typed rather than cast to `any` so a Node change breaks
// this loudly instead of silently no-op'ing the stub.
type LoaderModule = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const loader = Module as LoaderModule;
const origLoad = loader._load;

loader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/db") return { prisma: prismaStub };
  if (request === "@prisma/client") {
    // Prisma.sql is a tagged template; the stub only needs it not to throw.
    return { Prisma: { sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings, vals }) } };
  }
  return origLoad.call(this, request, parent, isMain);
};

const modPath = path.resolve(__dirname, "../src/lib/evidence-assembler.ts");
const { assembleEvidence } = require(modPath);

// ── Harness ─────────────────────────────────────────────────────────────────
const results: { name: string; pass: boolean; detail: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, pass: true, detail: "" });
  } catch (err) {
    results.push({ name, pass: false, detail: (err as Error).message });
  }
}

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function reset(overrides: Partial<typeof stub> = {}) {
  Object.assign(stub, {
    count: 0, ftsRows: [], ftsThrows: false, orderedRows: [], queryRawCalls: 0,
  }, overrides);
}

const PG = "postgresql://u:p@host/db";

// ── Tests ───────────────────────────────────────────────────────────────────

async function main() {

  await test("empty project returns mode=none and no evidence", async () => {
  process.env.DATABASE_URL = PG;
  reset({ count: 0 });
  const ctx = await assembleEvidence("p1", "risk_register");
  eq(ctx.mode, "none", "mode");
  eq(ctx.hasEvidence, false, "hasEvidence");
  eq(ctx.chunks.length, 0, "chunks");
  if (ctx.queryTerms.length === 0) throw new Error("queryTerms must be populated even when empty");
  });

  await test("healthy FTS result yields mode=keyword", async () => {
  process.env.DATABASE_URL = PG;
  const rows = Array.from({ length: 8 }, (_, i) => chunk(i));
  reset({ count: 50, ftsRows: rows });
  const ctx = await assembleEvidence("p1", "risk_register");
  eq(ctx.mode, "keyword", "mode");
  eq(ctx.chunks.length, 8, "chunks");
  eq(stub.queryRawCalls, 1, "fts calls");
  });

  await test("TOP_K caps the candidate pool at 12", async () => {
  process.env.DATABASE_URL = PG;
  reset({ count: 500, ftsRows: Array.from({ length: 30 }, (_, i) => chunk(i)) });
  const ctx = await assembleEvidence("p1", "wbs");
  eq(ctx.chunks.length, 12, "chunks");
  });

  await test("thin FTS result is topped up and reported as backfill", async () => {
  process.env.DATABASE_URL = PG;
  reset({
    count: 50,
    ftsRows: [chunk(0), chunk(1)],
    orderedRows: Array.from({ length: 20 }, (_, i) => chunk(i)),
  });
  const ctx = await assembleEvidence("p1", "wbs");
  eq(ctx.mode, "backfill", "mode");
  eq(ctx.chunks.length, 12, "chunks");
  const ids = ctx.chunks.map((c: Chunk) => c.id);
  eq(new Set(ids).size, ids.length, "dedup — no chunk may appear twice");
  eq(ids.slice(0, 2), ["c0", "c1"], "FTS hits must stay ranked first");
  });

  await test("FTS failure degrades to document order, never throws", async () => {
  process.env.DATABASE_URL = PG;
  reset({
    count: 50,
    ftsThrows: true,
    orderedRows: Array.from({ length: 20 }, (_, i) => chunk(i)),
  });
  const ctx = await assembleEvidence("p1", "wbs");
  eq(ctx.mode, "fallback", "mode");
  eq(ctx.hasEvidence, true, "must still return evidence");
  eq(ctx.chunks.length, 12, "chunks");
  });

  await test("SQLite dev DB skips FTS entirely rather than erroring", async () => {
  process.env.DATABASE_URL = "file:./dev.db";
  reset({ count: 50, orderedRows: Array.from({ length: 20 }, (_, i) => chunk(i)) });
  const ctx = await assembleEvidence("p1", "wbs");
  eq(ctx.mode, "fallback", "mode");
  eq(stub.queryRawCalls, 0, "must not issue a to_tsvector query on SQLite");
  eq(ctx.chunks.length, 12, "chunks");
  });

  await test("unknown artifact type falls back to generic search terms", async () => {
  process.env.DATABASE_URL = PG;
  reset({ count: 10, ftsRows: Array.from({ length: 6 }, (_, i) => chunk(i)) });
  const ctx = await assembleEvidence("p1", "not_a_real_artifact");
  eq(ctx.mode, "keyword", "mode");
  if (!ctx.queryTerms[0].includes("scope")) {
    throw new Error(`expected generic fallback terms, got ${ctx.queryTerms[0]}`);
  }
  });

// ── Report ──────────────────────────────────────────────────────────────────
  console.log("\n  Evidence assembler — retrieval paths\n");
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
    if (!r.pass) console.log(`         ${r.detail}`);
}
  console.log(`\n  ${results.length - failed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();

