#!/usr/bin/env node
/**
 * Security regression suite.
 *
 * Asserts the invariants established by the security review. These are static
 * checks — no database, no network, no secrets — so they run anywhere, including
 * a pre-commit hook or a CI gate.
 *
 *   npm run test:security
 *
 * Each check names the finding ID it guards so a failure points straight at the
 * original issue.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function check(id, name, fn) {
  try {
    const detail = fn();
    results.push({ id, name, pass: true, detail: detail ?? "" });
  } catch (err) {
    results.push({ id, name, pass: false, detail: err.message });
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Source with comments stripped — so a check cannot be satisfied or tripped by prose. */
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
    else if (e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

// ── C1: tenant boundary on every project-scoped handler ─────────────────────
check("C1", "every project route handler enforces the tenant boundary", () => {
  const offenders = [];
  for (const rel of walk("src/app/api/projects/[id]")) {
    const src = read(rel);
    const guards = (src.match(/if \(!session\?\.user\)/g) ?? []).length;
    const scoped = (src.match(/requireProjectAccess\(/g) ?? []).length;
    if (guards > 0 && scoped < guards) {
      offenders.push(`${rel} (${guards} handlers, ${scoped} scoped)`);
    }
  }
  if (offenders.length) throw new Error(`unscoped handlers:\n    ${offenders.join("\n    ")}`);
  return "all handlers scoped";
});

check("C1", "requireProjectAccess filters by orgId", () => {
  const src = read("src/lib/project-access.ts");
  if (!/where:\s*\{[^}]*orgId/s.test(src)) throw new Error("project lookup is not filtered by orgId");
  if (!/status:\s*404/.test(src)) throw new Error("cross-tenant miss must return 404, not 403 (prevents ID enumeration)");
  return "orgId enforced, 404 on miss";
});

// ── C2: registration cannot join an existing tenant ─────────────────────────
check("C2", "registration does not accept a client-supplied orgId", () => {
  const src = read("src/app/api/auth/register/route.ts");
  if (/orgId:\s*z\./.test(src)) throw new Error("zod schema still accepts orgId from the client");
  if (/data\.orgId/.test(src)) throw new Error("handler still reads orgId from the request body");
  return "orgId is server-assigned only";
});

// ── C3: destructive endpoint removed ────────────────────────────────────────
check("C3", "no unguarded destructive admin endpoint", () => {
  if (fs.existsSync(path.join(ROOT, "src/app/api/admin/nuke-projects"))) {
    throw new Error("src/app/api/admin/nuke-projects still exists");
  }
  return "removed";
});

check("C3", "no hardcoded secret comparisons in source", () => {
  const bad = [];
  for (const dir of ["src/app", "src/lib"]) {
    for (const rel of walk(dir)) {
      const src = readCode(rel);
      if (/(token|secret|password|apiKey)\s*!==\s*["'][^"']{6,}["']/i.test(src)) bad.push(rel);
    }
  }
  if (bad.length) throw new Error(`hardcoded secret comparison in: ${bad.join(", ")}`);
  return "none";
});

// ── C4: auth fails closed ───────────────────────────────────────────────────
check("C4", "auth refuses to serve without a strong AUTH_SECRET", () => {
  const src = read("src/lib/auth.ts");
  if (!/AUTH_SECRET/.test(src) || !/throw new Error/.test(src)) {
    throw new Error("no startup assertion on AUTH_SECRET");
  }
  if (!/length < 32/.test(src)) throw new Error("secret length is not validated");
  return "fails closed at startup";
});

// ── H1: admin is scoped to one tenant ───────────────────────────────────────
check("H1", "requireAdmin returns an orgId for scoping", () => {
  const src = read("src/lib/admin-auth.ts");
  if (!/orgId/.test(src)) throw new Error("requireAdmin does not expose orgId");
  return "orgId exposed";
});

check("H1", "admin user listing is tenant-scoped", () => {
  const src = read("src/app/api/admin/users/route.ts");
  if (!/where:\s*(any\s*=\s*)?showDeleted\s*\?\s*\{\s*orgId/.test(src) && !/\{\s*orgId,\s*deletedAt/.test(src)) {
    throw new Error("admin user query is not filtered by orgId");
  }
  return "scoped";
});

// ── H2: database TLS is verified ────────────────────────────────────────────
check("H2", "database connection verifies the server certificate", () => {
  const src = readCode("src/lib/db.ts");
  if (/rejectUnauthorized:\s*false/.test(src)) throw new Error("rejectUnauthorized:false — connection is MITM-able");
  if (!/rejectUnauthorized:\s*true/.test(src)) throw new Error("certificate verification is not explicitly enabled");
  return "verified";
});

check("H2", "connection pool is bounded", () => {
  const src = read("src/lib/db.ts");
  if (!/max:\s*Number\(/.test(src)) throw new Error("pool has no max — will exhaust server connections across workers");
  return "bounded";
});

// ── H3: cron endpoints authenticate ─────────────────────────────────────────
check("H3", "cron endpoints require a bearer secret and fail closed", () => {
  const files = walk("src/app/api/cron");
  if (!files.length) return "no cron routes";
  for (const rel of files) {
    const src = read(rel);
    if (!/CRON_SECRET/.test(src)) throw new Error(`${rel} does not check CRON_SECRET`);
    if (!/if \(!expected\) return false/.test(src)) throw new Error(`${rel} does not fail closed when CRON_SECRET is unset`);
    if (!/timingSafeEqual/.test(src)) throw new Error(`${rel} does not use a constant-time comparison`);
  }
  return `${files.length} route(s) gated`;
});

check("H3", "cron paths are reachable without a session cookie", () => {
  const src = read("src/proxy.ts");
  if (!/api\/cron/.test(src)) throw new Error("proxy redirects /api/cron to /login — the scheduler can never reach it");
  return "exempted in proxy";
});

// ── H4: throttling on unauthenticated endpoints ─────────────────────────────
check("H4", "registration is rate limited", () => {
  const src = read("src/app/api/auth/register/route.ts");
  if (!/rateLimit\(/.test(src)) throw new Error("no rate limit on registration");
  return "limited";
});

// ── H5: security headers ────────────────────────────────────────────────────
check("H5", "baseline security headers are configured", () => {
  const src = read("next.config.ts");
  const required = [
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Strict-Transport-Security",
  ];
  const missing = required.filter((h) => !src.includes(h));
  if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
  if (!/frame-ancestors 'none'/.test(src)) throw new Error("CSP is missing frame-ancestors 'none'");
  return `${required.length} headers set`;
});

// ── M1: model input is server-derived ───────────────────────────────────────
check("M1", "recommendation endpoint derives signals from the database", () => {
  const src = readCode("src/app/api/dm/intelligence/recommend/route.ts");
  if (/body\.(spi|cpi|topRisk|projectName|deliveryScore)/.test(src)) {
    throw new Error("prompt is still built from client-supplied fields");
  }
  if (!/prisma\.project\.findFirst/.test(src)) throw new Error("does not read project state from the database");
  if (!/requireProjectAccess/.test(src)) throw new Error("missing tenant check");
  if (!/rateLimit\(/.test(src)) throw new Error("model-spending endpoint is not rate limited");
  return "server-derived, scoped, throttled";
});

// ── M2: upload bounds ───────────────────────────────────────────────────────
check("M2", "artifact upload bounds size and file type", () => {
  const src = read("src/app/api/projects/[id]/artifacts/[type]/upload/route.ts");
  if (!/MAX_UPLOAD_BYTES/.test(src)) throw new Error("no upload size cap");
  if (!/ALLOWED_EXT/.test(src)) throw new Error("no file extension allowlist");
  return "capped and allowlisted";
});

// ── Azure ───────────────────────────────────────────────────────────────────
check("A1", "build emits a standalone server bundle", () => {
  const src = read("next.config.ts");
  if (!/output:\s*["']standalone["']/.test(src)) throw new Error("output:'standalone' is not set");
  return "standalone";
});

check("A2", "Auth.js trusts the deployment host", () => {
  const src = read("src/lib/auth.ts");
  if (!/trustHost:\s*true/.test(src)) throw new Error("trustHost is not set — sign-in fails on Azure with UntrustedHost");
  return "trustHost enabled";
});

check("A4", "no route exceeds the Azure 230s request ceiling", () => {
  const over = [];
  for (const rel of walk("src/app/api")) {
    const m = read(rel).match(/export const maxDuration = (\d+)/);
    if (m && Number(m[1]) > 230) over.push(`${rel} (${m[1]}s)`);
  }
  if (over.length) throw new Error(`over the 230s cap:\n    ${over.join("\n    ")}`);
  return "all within cap";
});

// ── Brand typography ────────────────────────────────────────────────────────
check("FONT", "every export path sets the brand fonts", () => {
  const problems = [];

  const docx = readCode("src/lib/export-docx.ts");
  if (!/document:\s*\{\s*run:\s*\{\s*font:\s*FONT_BODY/.test(docx)) problems.push("docx: no document-default body font");
  if (!/heading1:\s*\{\s*run:\s*\{\s*font:\s*FONT_HEADING/.test(docx)) problems.push("docx: heading1 has no display font");

  for (const rel of [
    "src/lib/export-all-xlsx.ts",
    "src/lib/export-evm-xlsx.ts",
    "src/lib/export-risk-issue-xlsx.ts",
    "src/lib/export-rtm-xlsx.ts",
    "src/lib/export-wbs-xlsx.ts",
  ]) {
    const src = readCode(rel);
    const writes = (src.match(/wb\.xlsx\.writeBuffer\(\)/g) ?? []).length;
    const stamps = (src.match(/applyWorkbookFonts\(wb\)/g) ?? []).length;
    if (stamps < writes) problems.push(`${path.basename(rel)}: ${writes} writeBuffer, only ${stamps} font stamp(s)`);
  }

  const pptx = readCode("src/lib/export-pptx.ts");
  if (/fontFace:\s*["']Aptos["']/.test(pptx)) problems.push("pptx: hardcoded fontFace remains — use FONT_HEADING/FONT_BODY");

  const print = readCode("src/components/artifact-document.tsx");
  if (/font-family:\s*Arial/.test(print)) problems.push("print view: still hardcodes Arial");

  if (problems.length) throw new Error(problems.join("\n    "));
  return "docx, 5 xlsx exporters, pptx and print all branded";
});

// ── report ──────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.pass);
const fail = results.filter((r) => !r.pass);

console.log("\n  Security regression suite\n");
for (const r of results) {
  const mark = r.pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${r.id.padEnd(3)} ${r.name}`);
  if (r.detail) console.log(`         ${r.pass ? r.detail : r.detail.replace(/\n/g, "\n         ")}`);
}
console.log(`\n  ${pass.length} passed, ${fail.length} failed\n`);
process.exit(fail.length ? 1 : 0);
