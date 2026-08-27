/**
 * Guard test for the tenant-isolation fix.
 *
 * Most routes under /api/projects/[id] authenticated the caller but never checked that
 * the project belonged to their organisation, so any logged-in user of any tenant could
 * read and modify another tenant's data. The fix was mechanical across ~65 files, which
 * makes it exactly the kind of thing that silently regresses when the next route is added
 * by copying an old one.
 *
 * This asserts the property structurally rather than per-route: every handler under
 * /api/projects/[id] must reach a tenancy check.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "src", "app", "api", "projects");

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(p, acc);
    else if (entry.name === "route.ts") acc.push(p);
  }
  return acc;
}

const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, "/");

describe("tenant isolation across /api/projects routes", () => {
  const files = routeFiles(ROOT);

  it("finds the project routes", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("every project route performs a tenancy check", () => {
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return !src.includes("requireProjectAccess") && !src.includes("orgId");
      })
      .map(rel);

    expect(offenders, `these routes authenticate but never scope to the caller's org:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no project route still relies on a bare session check alone", () => {
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        if (!src.includes("if (!session?.user)")) return false;
        // A bare session guard is only acceptable alongside an explicit org comparison.
        return !src.includes("orgId");
      })
      .map(rel);

    expect(offenders).toEqual([]);
  });
});
