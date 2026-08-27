/**
 * Rewrites `prisma migrate diff` output so it can be re-run safely.
 *
 * scripts/migrate-neon-all.js executes on every deploy, so every statement it
 * contains has to tolerate already-applied state. Prisma's generated DDL does
 * not: CREATE TABLE, CREATE INDEX and ADD CONSTRAINT all fail on a second run.
 *
 * CREATE TABLE / CREATE INDEX / ADD COLUMN take IF NOT EXISTS directly.
 * ADD CONSTRAINT has no such form in PostgreSQL, so each one is wrapped in a
 * DO block that swallows duplicate_object — the standard idiom.
 *
 *   node scripts/make-ddl-idempotent.mjs <input.sql> > <output.sql>
 */
import fs from "node:fs";

const src = fs.readFileSync(process.argv[2], "utf8");

// Drop Prisma's "-- CreateTable" banner comments, then split on the semicolon
// that ends each statement. Multi-line CREATE TABLE bodies survive because the
// only semicolons in this DDL are statement terminators.
const statements = src
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const out = [];
let tables = 0, indexes = 0, constraints = 0, columns = 0;

for (const stmt of statements) {
  if (/^CREATE TABLE\s+"/.test(stmt)) {
    out.push(stmt.replace(/^CREATE TABLE\s+/, "CREATE TABLE IF NOT EXISTS ") + ";");
    tables++;
  } else if (/^CREATE (UNIQUE )?INDEX\s+"/.test(stmt)) {
    out.push(stmt.replace(/^CREATE (UNIQUE )?INDEX\s+/, (m, u) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS `) + ";");
    indexes++;
  } else if (/ADD COLUMN\s+"/.test(stmt)) {
    out.push(stmt.replace(/ADD COLUMN\s+/, "ADD COLUMN IF NOT EXISTS ") + ";");
    columns++;
  } else if (/ADD CONSTRAINT\s+"/.test(stmt)) {
    // No IF NOT EXISTS for constraints — catch the duplicate instead.
    out.push(`DO $$ BEGIN\n  ${stmt};\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`);
    constraints++;
  } else {
    out.push(stmt + ";");
  }
}

console.log(out.join("\n\n"));
console.error(
  `  ${tables} tables, ${indexes} indexes, ${columns} columns, ${constraints} constraints — ${statements.length} statements total`
);
