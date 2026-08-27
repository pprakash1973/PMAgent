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
  /** Set by the fusion step, not by the stubbed arms. */
  matchedBy?: "keyword" | "semantic" | "both" | "position";
};

const stub = {
  count: 0,
  ftsRows: [] as Chunk[],
  ftsThrows: false,
  vecRows: [] as Chunk[],
  vecThrows: false,
  hasVectors: false,
  queryVector: [0.1, 0.2] as number[] | null,
  orderedRows: [] as Chunk[],
  ftsCalls: 0,
  vecCalls: 0,
  embedCalls: 0,
};

function chunk(i: number, text = `chunk ${i}`): Chunk {
  return { id: `c${i}`, text, sectionTitle: null, pageNumber: 1, documentId: "d1", chunkIndex: i };
}

// ── Intercept the module's dependencies before it loads ─────────────────────
const prismaStub = {
  documentChunk: {
    count: async () => stub.count,
    findMany: async ({ take }: { take: number }) => stub.orderedRows.slice(0, take),
  },
  // Both arms go through $queryRaw; tell them apart by the SQL they carry.
  $queryRaw: async (q: { strings?: string[] }) => {
    const sql = (q?.strings ?? []).join(" ");
    if (sql.includes("<=>")) {
      stub.vecCalls++;
      if (stub.vecThrows) throw new Error("operator does not exist: vector <=> unknown");
      return stub.vecRows;
    }
    stub.ftsCalls++;
    if (stub.ftsThrows) throw new Error("function to_tsvector does not exist");
    return stub.ftsRows;
  },
};

const embeddingsStub = {
  embedQuery: async () => {
    stub.embedCalls++;
    return stub.queryVector;
  },
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
};

const chunkEmbeddingsStub = {
  hasVectorSupport: async () => stub.hasVectors,
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
  if (request === "@/lib/embeddings") return embeddingsStub;
  if (request === "@/lib/chunk-embeddings") return chunkEmbeddingsStub;
  if (request === "@prisma/client") {
    // Prisma.sql is a tagged template; the stub only needs to preserve the SQL
    // text so the $queryRaw stub can tell the two arms apart.
    return {
      Prisma: {
        sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings: [...strings], vals }),
        join: (parts: unknown[]) => ({ strings: [], vals: parts }),
      },
    };
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
    count: 0, ftsRows: [], ftsThrows: false, vecRows: [], vecThrows: false,
    hasVectors: false, queryVector: [0.1, 0.2], orderedRows: [],
    ftsCalls: 0, vecCalls: 0, embedCalls: 0,
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
  eq(stub.ftsCalls, 1, "fts calls");
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
  eq(stub.ftsCalls, 0, "must not issue a to_tsvector query on SQLite");
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

  // ── Hybrid: both arms ─────────────────────────────────────────────────────

  await test("both arms returning yields mode=hybrid", async () => {
    process.env.DATABASE_URL = PG;
    reset({
      count: 50,
      hasVectors: true,
      ftsRows: Array.from({ length: 6 }, (_, i) => chunk(i)),
      vecRows: Array.from({ length: 6 }, (_, i) => chunk(i + 3)),
    });
    const ctx = await assembleEvidence("p1", "cost_plan");
    eq(ctx.mode, "hybrid", "mode");
    eq(stub.ftsCalls, 1, "keyword arm ran");
    eq(stub.vecCalls, 1, "semantic arm ran");
  });

  await test("RRF ranks a chunk found by both arms above either arm's top hit", async () => {
    process.env.DATABASE_URL = PG;
    // keyword: A B C   semantic: C D E
    // C scores 1/(60+3) + 1/(60+1); A only 1/(60+1). C must win.
    reset({
      count: 50,
      hasVectors: true,
      ftsRows: [chunk(1, "A"), chunk(2, "B"), chunk(3, "C")].map((c, i) => ({ ...c, id: ["A", "B", "C"][i] })),
      vecRows: [chunk(3, "C"), chunk(4, "D"), chunk(5, "E")].map((c, i) => ({ ...c, id: ["C", "D", "E"][i] })),
    });
    const ctx = await assembleEvidence("p1", "quality_plan");
    eq(ctx.mode, "hybrid", "mode");
    eq(ctx.chunks[0].id, "C", "chunk found by both arms must rank first");
    eq(ctx.chunks[0].matchedBy, "both", "provenance");
    const ids = ctx.chunks.map((c: Chunk) => c.id);
    eq(new Set(ids).size, ids.length, "fusion must dedup across arms");
    eq(ids.length, 5, "union of both arms, deduped");
  });

  await test("provenance distinguishes single-arm hits", async () => {
    process.env.DATABASE_URL = PG;
    reset({
      count: 50,
      hasVectors: true,
      ftsRows: [{ ...chunk(1), id: "kw-only" }],
      vecRows: [{ ...chunk(2), id: "sem-only" }],
      orderedRows: Array.from({ length: 20 }, (_, i) => chunk(i)),
    });
    const ctx = await assembleEvidence("p1", "raci_matrix");
    const byId = Object.fromEntries(ctx.chunks.map((c: Chunk) => [c.id, c.matchedBy]));
    eq(byId["kw-only"], "keyword", "keyword-only provenance");
    eq(byId["sem-only"], "semantic", "semantic-only provenance");
    if (!ctx.chunks.some((c: Chunk) => c.matchedBy === "position")) {
      throw new Error("document-order filler must be marked as positional, not as a search hit");
    }
  });

  // ── Degradation ladder ────────────────────────────────────────────────────

  await test("no pgvector means no semantic query is attempted", async () => {
    process.env.DATABASE_URL = PG;
    reset({ count: 50, hasVectors: false, ftsRows: Array.from({ length: 8 }, (_, i) => chunk(i)) });
    const ctx = await assembleEvidence("p1", "change_log");
    eq(ctx.mode, "keyword", "mode");
    eq(stub.vecCalls, 0, "must not query a column that does not exist");
    eq(stub.embedCalls, 0, "must not spend an embedding call it cannot use");
  });

  await test("unconfigured embedding endpoint degrades to keyword", async () => {
    process.env.DATABASE_URL = PG;
    reset({
      count: 50,
      hasVectors: true,
      queryVector: null, // embedQuery returns null when no endpoint is configured
      ftsRows: Array.from({ length: 8 }, (_, i) => chunk(i)),
    });
    const ctx = await assembleEvidence("p1", "decision_log");
    eq(ctx.mode, "keyword", "mode");
    eq(stub.vecCalls, 0, "no vector query without a query vector");
    eq(ctx.chunks.length, 8, "keyword results survive intact");
  });

  await test("semantic arm failure cannot take down the keyword arm", async () => {
    process.env.DATABASE_URL = PG;
    reset({
      count: 50,
      hasVectors: true,
      vecThrows: true,
      ftsRows: Array.from({ length: 8 }, (_, i) => chunk(i)),
    });
    const ctx = await assembleEvidence("p1", "issue_register");
    eq(ctx.mode, "keyword", "mode");
    eq(ctx.chunks.length, 8, "keyword results survive");
  });

  await test("keyword arm failure still returns semantic results", async () => {
    process.env.DATABASE_URL = PG;
    reset({
      count: 50,
      hasVectors: true,
      ftsThrows: true,
      vecRows: Array.from({ length: 8 }, (_, i) => chunk(i)),
    });
    const ctx = await assembleEvidence("p1", "lessons_learned");
    eq(ctx.hasEvidence, true, "semantic arm alone is still evidence");
    eq(ctx.chunks.length, 8, "chunks");
    eq(ctx.chunks[0].matchedBy, "semantic", "provenance");
  });

  await test("both arms failing still degrades to document order", async () => {
    process.env.DATABASE_URL = PG;
    reset({
      count: 50,
      hasVectors: true,
      ftsThrows: true,
      vecThrows: true,
      orderedRows: Array.from({ length: 20 }, (_, i) => chunk(i)),
    });
    const ctx = await assembleEvidence("p1", "closure_report");
    eq(ctx.mode, "fallback", "mode");
    eq(ctx.chunks.length, 12, "chunks");
  });

  await test("intent vectors are embedded once, not per generation", async () => {
    process.env.DATABASE_URL = PG;
    reset({ count: 50, hasVectors: true, vecRows: [chunk(0)], ftsRows: [chunk(1)] });
    // Same artifact type three times — the intent string is identical, so its
    // vector must be computed once and reused.
    await assembleEvidence("p1", "benefits_register");
    await assembleEvidence("p2", "benefits_register");
    await assembleEvidence("p3", "benefits_register");
    eq(stub.embedCalls, 1, "embedQuery calls for three generations of one type");
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

