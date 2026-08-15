/**
 * sync-skills.ts
 *
 * Downloads all skills from your Anthropic account and writes them into
 * .claude/skills/<name>/SKILL.md so they are git-tracked alongside the project.
 * Also writes .claude/skills-registry.json mapping skill name → skill_id.
 *
 * Usage:
 *   npx tsx scripts/sync-skills.ts
 *
 * Requires: ANTHROPIC_API_KEY in environment (or .env.local)
 */

import Anthropic from "@anthropic-ai/sdk";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SKILLS_DIR = path.resolve(__dirname, "../.claude/skills");
const REGISTRY_PATH = path.resolve(__dirname, "../.claude/skills-registry.json");

interface RegistryEntry {
  id: string;
  latestVersion: string;
  updatedAt: string;
}

type Registry = Record<string, RegistryEntry>;

function stripFrontmatter(content: string): string {
  // Remove the ---…--- YAML block so only the markdown body remains
  return content.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

async function resolveLatestVersion(skillId: string): Promise<string | null> {
  let latest: bigint | undefined;
  let latestStr: string | undefined;
  for await (const v of client.beta.skills.versions.list(skillId)) {
    if (/^\d+$/.test(v.version)) {
      const ts = BigInt(v.version);
      if (latest === undefined || ts > latest) {
        latest = ts;
        latestStr = v.version;
      }
    }
  }
  return latestStr ?? null;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — add it to .env.local");
    process.exit(1);
  }

  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  const registry: Registry = {};
  let synced = 0;
  let skipped = 0;

  console.log("Fetching skills from Anthropic API…\n");

  for await (const skill of client.beta.skills.list()) {
    try {
      const version = await resolveLatestVersion(skill.id);
      if (!version) {
        console.warn(`  ⚠  ${skill.id}: no versioned release — skipping`);
        skipped++;
        continue;
      }

      // Get version metadata to determine the skill's directory name
      const meta = await client.beta.skills.versions.retrieve(version, {
        skill_id: skill.id,
      });

      const dirName = (meta.directory || meta.name || skill.id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");

      // Download the zip archive
      const resp = await client.beta.skills.versions.download(version, {
        skill_id: skill.id,
      });
      const buf = Buffer.from(await resp.arrayBuffer());
      const zip = new AdmZip(buf);

      // Find SKILL.md regardless of wrapper directory depth
      const entry = zip
        .getEntries()
        .find(
          (e) => !e.isDirectory && e.name.toLowerCase() === "skill.md"
        );

      if (!entry) {
        console.warn(`  ⚠  ${dirName}: no SKILL.md in archive — skipping`);
        skipped++;
        continue;
      }

      const content = entry.getData().toString("utf-8");

      const outDir = path.join(SKILLS_DIR, dirName);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "SKILL.md"), content, "utf-8");

      registry[dirName] = {
        id: skill.id,
        latestVersion: version,
        updatedAt: skill.updated_at,
      };

      console.log(`  ✓  ${dirName.padEnd(30)} ${skill.id}`);
      synced++;
    } catch (err) {
      console.error(`  ✗  ${skill.id}: ${String(err)}`);
      skipped++;
    }
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");

  console.log(`\n${synced} skills synced  ·  ${skipped} skipped`);
  console.log(`Registry → .claude/skills-registry.json\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
