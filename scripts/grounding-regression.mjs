#!/usr/bin/env node
/**
 * Grounding regression suite.
 *
 * Artifact generation has three entry points — the single-artifact route, the
 * batch route, and the Copilot action helper. Each calls generateArtifact() with
 * six positional arguments, two of which carry grounding:
 *
 *   arg 4  evidenceContext  retrieved chunks from the project's documents
 *   arg 5  domainContext    industry pre-flight guidance
 *
 * Historically each path passed a different subset (single had domain but no
 * evidence, batch had evidence but no domain, Copilot had neither) and nothing
 * caught it — passing `undefined` is perfectly valid TypeScript. These are
 * static checks, so they run with no database and no network.
 *
 *   npm run test:grounding
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function check(name, fn) {
  try {
    results.push({ name, pass: true, detail: fn() ?? "" });
  } catch (err) {
    results.push({ name, pass: false, detail: err.message });
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Source with comments stripped, so prose cannot satisfy or trip a check. */
function readCode(rel) {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * Split an argument list on top-level commas only — nested calls like
 * `templateMap.get(type)` and member access like `ctx[i].domainContext`
 * must not be split apart.
 */
function splitArgs(inner) {
  const args = [];
  let depth = 0, current = "";
  for (const ch of inner) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) { args.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/** Every generateArtifact() invocation outside its own definition. */
function findCallSites() {
  const sites = [];
  for (const rel of [...walk("src/app/api"), ...walk("src/lib")]) {
    if (rel.endsWith(`lib${path.sep}ai.ts`)) continue; // the definition itself
    const src = readCode(rel);
    let i = 0;
    while ((i = src.indexOf("generateArtifact(", i)) !== -1) {
      const openParen = i + "generateArtifact".length;
      // Skip imports/re-exports, which are not calls
      const lineStart = src.lastIndexOf("\n", i) + 1;
      const line = src.slice(lineStart, src.indexOf("\n", i));
      if (/^\s*(import|export)\b/.test(line)) { i = openParen; continue; }

      let depth = 0, end = openParen;
      for (; end < src.length; end++) {
        if (src[end] === "(") depth++;
        else if (src[end] === ")") { depth--; if (depth === 0) break; }
      }
      sites.push({ file: rel, args: splitArgs(src.slice(openParen + 1, end)) });
      i = end;
    }
  }
  return sites;
}

// ── Every generation path must be grounded ──────────────────────────────────
check("all three generateArtifact call sites exist", () => {
  const sites = findCallSites();
  if (sites.length !== 3) {
    throw new Error(`expected 3 call sites, found ${sites.length}: ${sites.map(s => s.file).join(", ")}`);
  }
  return sites.map((s) => path.basename(s.file)).join(", ");
});

check("no generation path passes undefined evidence", () => {
  const bad = findCallSites().filter((s) => (s.args[3] ?? "undefined") === "undefined");
  if (bad.length) {
    throw new Error(
      `these paths generate artifacts without reading the document store:\n    ${bad.map(b => b.file).join("\n    ")}`
    );
  }
  return "all 3 paths retrieve evidence";
});

check("no generation path passes undefined domain context", () => {
  const bad = findCallSites().filter((s) => (s.args[4] ?? "undefined") === "undefined");
  if (bad.length) {
    throw new Error(`missing domain context in:\n    ${bad.map(b => b.file).join("\n    ")}`);
  }
  return "all 3 paths pass domain context";
});

check("grounding inputs come from the shared assembler", () => {
  const missing = [
    "src/app/api/projects/[id]/artifacts/route.ts",
    "src/app/api/projects/[id]/artifacts/batch/route.ts",
    "src/lib/generate-artifact-for-project.ts",
  ].filter((rel) => !/assembleGenerationContext\(/.test(readCode(rel)));
  if (missing.length) {
    throw new Error(`bypassing lib/artifact-context.ts:\n    ${missing.join("\n    ")}`);
  }
  return "single, batch and copilot all use assembleGenerationContext";
});

// ── Retrieval invariants ────────────────────────────────────────────────────
check("retrieval is scoped to one project", () => {
  const src = readCode("src/lib/evidence-assembler.ts");
  const selects = src.match(/FROM "DocumentChunk"[\s\S]*?(?=LIMIT|$)/g) ?? [];
  if (!selects.length) throw new Error("no raw chunk query found");
  for (const q of selects) {
    if (!/WHERE[\s\S]*?"projectId" = /.test(q)) {
      throw new Error("a chunk query is not filtered by projectId — cross-project leakage");
    }
  }
  if (!/where: \{ projectId \}/.test(src)) throw new Error("an ORM chunk query is not scoped by projectId");
  return `${selects.length} raw quer(y|ies) + ORM paths all project-scoped`;
});

check("the tsvector expression matches the deployed GIN index", () => {
  const assembler = readCode("src/lib/evidence-assembler.ts");
  const migration = read("scripts/migrate-neon-all.js");

  const idx = migration.match(/USING gin\(to_tsvector\('(\w+)',\s*"?text"?\)\)/i);
  if (!idx) throw new Error("no GIN index on DocumentChunk in migrate-neon-all.js");

  const query = assembler.match(/to_tsvector\('(\w+)',\s*dc\.text\)/);
  if (!query) throw new Error("no to_tsvector query in the assembler");

  if (idx[1] !== query[1]) {
    throw new Error(
      `regconfig mismatch: index uses '${idx[1]}', query uses '${query[1]}' — ` +
      `Postgres cannot use the index and silently seq-scans`
    );
  }
  return `both use '${idx[1]}'`;
});

check("retrieval failure cannot break generation", () => {
  const assembler = readCode("src/lib/evidence-assembler.ts");
  if (!/catch\s*\(err\)/.test(assembler)) throw new Error("keyword search failure is not caught");

  const ctx = readCode("src/lib/artifact-context.ts");
  if (!/assembleEvidence\([\s\S]{0,120}?\.catch\(/.test(ctx)) {
    throw new Error("assembleGenerationContext does not catch evidence assembly failure");
  }
  if (!/generateDomainContext\([\s\S]{0,200}?\.catch\(/.test(ctx)) {
    throw new Error("assembleGenerationContext does not catch domain pre-flight failure");
  }
  return "both grounding inputs degrade instead of throwing";
});

check("non-Postgres databases skip full-text search", () => {
  const src = readCode("src/lib/evidence-assembler.ts");
  if (!/supportsFullTextSearch\(\)/.test(src)) throw new Error("no capability guard before the FTS query");
  if (!/startsWith\("file:"\)/.test(src)) throw new Error("guard does not detect the SQLite dev URL");
  return "guarded";
});

// ── Report ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);

console.log("\n  Grounding regression suite\n");
for (const r of results) {
  console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
  if (r.detail) console.log(`         ${r.detail.replace(/\n/g, "\n         ")}`);
}
console.log(`\n  ${results.length - failed.length} passed, ${failed.length} failed\n`);
process.exit(failed.length ? 1 : 0);
