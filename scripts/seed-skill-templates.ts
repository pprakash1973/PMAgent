/**
 * seed-skill-templates.ts
 *
 * Reads every SKILL.md under .claude/skills/ and upserts a global
 * ArtifactTemplate row in the database.  The skill content becomes the
 * systemAddendum — appended to PMI_SYSTEM_PROMPT on every matching
 * artifact generation call.
 *
 * Usage:
 *   npx tsx scripts/seed-skill-templates.ts [--org <orgId>] [--dry-run]
 *
 * --org     Target org ID.  Omit to seed every org in the DB.
 * --dry-run Print what would be created/updated without touching the DB.
 *
 * Requires: DATABASE_URL in environment (or .env.local)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Lazy-initialize with pg adapter (required by driverAdapters preview feature)
let _pool: Pool | null = null;
let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(_pool);
    _prisma = new PrismaClient({ adapter } as any);
  }
  return _prisma;
}

const SKILLS_DIR = path.resolve(__dirname, "../.claude/skills");

// ── Artifact-type mapping ────────────────────────────────────────────────────
// Maps skill directory name → artifact types it should cover.
// A skill listed under "all" becomes a catch-all template (lower priority but
// always applied).  Multiple skills that share the same artifactType are
// combined in the order listed here.

const SKILL_MAP: Record<string, string[]> = {
  // PMI / Waterfall
  "pmi-charter":          ["project_charter"],
  "pmi-wbs":              ["wbs"],
  "wbs-mastery":          ["wbs"],              // combined with pmi-wbs below
  "pmi-raci":             ["raci_matrix"],
  "pmi-risk":             ["risk_register"],
  "pmi-schedule":         ["schedule"],
  "pmi-budget":           ["budget_forecast"],
  "evm-analysis":         ["evm_analysis", "budget_forecast"],
  "pmi-status":           ["status_report"],
  "pmi-changelog":        ["change_log"],
  "pmi-close":            ["lessons_learned"],
  "pmi-dashboard":        ["dashboard"],
  "pmi-critical-path":    [], // handled by dedicated API route — skip global template

  // Agile
  "agile-backlog-manager":   ["sprint_plan", "backlog"],
  "agile-retrospective":     ["retrospective"],
  "agile-team-charter":      ["project_charter"], // combined with pmi-charter for agile
  "agile-lifecycle-selector": [],                  // used at project creation only

  // Cross-cutting (applied to every artifact type via the "all" catch-all)
  "ust-brand-guidelines":  ["all"],
  "quality-guardrails":    ["all"],   // scope-fidelity, traceability & PII guardrails
};

// ── Methodology tag ──────────────────────────────────────────────────────────
// Skills prefixed "agile-" will be stored with a name suffix so they can
// co-exist with the PMI version of the same artifact type.

const AGILE_SKILLS = new Set([
  "agile-backlog-manager",
  "agile-retrospective",
  "agile-team-charter",
  "agile-lifecycle-selector",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSkillContent(dirName: string): string | null {
  const mdPath = path.join(SKILLS_DIR, dirName, "SKILL.md");
  if (!fs.existsSync(mdPath)) return null;
  const raw = fs.readFileSync(mdPath, "utf-8");
  // Strip YAML frontmatter — it's Claude Code metadata, not methodology content
  return raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

function listSkillDirs(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR).filter((d) => {
    const full = path.join(SKILLS_DIR, d);
    return (
      fs.statSync(full).isDirectory() &&
      fs.existsSync(path.join(full, "SKILL.md"))
    );
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const orgIdx = args.indexOf("--org");
  const targetOrgId = orgIdx !== -1 ? args[orgIdx + 1] : null;

  const dirs = listSkillDirs();
  if (dirs.length === 0) {
    console.error(
      "No skill directories found under .claude/skills/\n" +
        "Run `npx tsx scripts/sync-skills.ts` first."
    );
    process.exit(1);
  }

  console.log(`Found ${dirs.length} skill directories\n`);

  // Gather target orgs (skip DB entirely for dry-runs without a specific org)
  const orgs: Array<{ id: string; name?: string }> = targetOrgId
    ? [{ id: targetOrgId }]
    : dryRun
      ? [{ id: "<org-placeholder>", name: "DRY-RUN (no DB)" }]
      : await (getPrisma() as any).organization.findMany({ select: { id: true, name: true } });

  if (orgs.length === 0) {
    console.error("No organisations found in database.");
    process.exit(1);
  }

  // Build a merged content map: artifactType → combined skill content
  // (some artifact types are covered by multiple complementary skills)
  const contentMap = new Map<string, { content: string; isAgile: boolean }[]>();

  for (const dir of dirs) {
    const artifactTypes = SKILL_MAP[dir];
    if (!artifactTypes || artifactTypes.length === 0) {
      console.log(`  skip  ${dir} (no artifact-type mapping or route-specific)`);
      continue;
    }

    const content = readSkillContent(dir);
    if (!content) {
      console.warn(`  warn  ${dir}: SKILL.md is empty — skipping`);
      continue;
    }

    const isAgile = AGILE_SKILLS.has(dir);

    for (const type of artifactTypes) {
      if (!contentMap.has(type)) contentMap.set(type, []);
      contentMap.get(type)!.push({ content, isAgile });
    }
  }

  // For each org, upsert one template per artifact type
  let created = 0;
  let updated = 0;

  for (const org of orgs) {
    console.log(`\nOrg: ${(org as any).name ?? org.id}`);

    for (const [artifactType, entries] of contentMap) {
      // Separate PMI and Agile content
      const pmiParts = entries.filter((e) => !e.isAgile).map((e) => e.content);
      const agileParts = entries.filter((e) => e.isAgile).map((e) => e.content);

      const templates: Array<{
        artifactType: string;
        name: string;
        systemAddendum: string;
        methodology?: string;
      }> = [];

      if (pmiParts.length > 0) {
        templates.push({
          artifactType,
          name: `PMI Skill: ${artifactType}`,
          systemAddendum: pmiParts.join("\n\n---\n\n"),
        });
      }

      if (agileParts.length > 0) {
        templates.push({
          artifactType,
          name: `Agile Skill: ${artifactType}`,
          systemAddendum: agileParts.join("\n\n---\n\n"),
          methodology: "agile_scrum",
        });
      }

      for (const tpl of templates) {
        const label = `  ${tpl.name.padEnd(42)} [${tpl.artifactType}]`;

        if (dryRun) {
          console.log(`  DRY  ${label}`);
          continue;
        }

        // Check if a template already exists for this org + type + name
        const existing = await (getPrisma() as any).artifactTemplate.findFirst({
          where: { orgId: org.id, artifactType: tpl.artifactType, name: tpl.name },
        });

        if (existing) {
          await (getPrisma() as any).artifactTemplate.update({
            where: { id: existing.id },
            data: { systemAddendum: tpl.systemAddendum, isActive: true },
          });
          console.log(`  upd  ${label}`);
          updated++;
        } else {
          await (getPrisma() as any).artifactTemplate.create({
            data: {
              orgId:          org.id,
              name:           tpl.name,
              artifactType:   tpl.artifactType,
              scope:          "global",
              accountId:      null,
              systemAddendum: tpl.systemAddendum,
              userAddendum:   null,
              isActive:       true,
            },
          });
          console.log(`  new  ${label}`);
          created++;
        }
      }
    }
  }

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Done — ${created} created, ${updated} updated`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await _prisma?.$disconnect();
    await _pool?.end();
  });
