/**
 * Backfill vectors for chunks ingested before semantic retrieval existed.
 *
 * Idempotent and resumable: it only ever selects `WHERE embedding IS NULL`, so
 * re-running after an interruption picks up exactly where it stopped. Safe to
 * run against a live database — retrieval treats a partially embedded corpus as
 * normal, since the semantic arm filters unembedded chunks out.
 *
 *   npx tsx scripts/backfill-embeddings.ts --dry-run
 *   npx tsx scripts/backfill-embeddings.ts
 *   npx tsx scripts/backfill-embeddings.ts --project <projectId>
 *   npx tsx scripts/backfill-embeddings.ts --limit 500
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { Prisma } from "@prisma/client";
import { embedAndStoreChunks, hasVectorSupport, countPendingEmbeddings } from "../src/lib/chunk-embeddings";
import { resolveEmbeddingEndpoint, isInTenant, EMBEDDING_MODEL } from "../src/lib/embeddings";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes("--dry-run");
const PROJECT = flag("project");
const LIMIT = Number(flag("limit") ?? Infinity);
const PAGE = 200;

/** ~4 chars per token, at $0.02 per 1M tokens for text-embedding-3-small. */
function estimateCost(totalChars: number): string {
  const tokens = totalChars / 4;
  return `$${((tokens / 1_000_000) * 0.02).toFixed(4)}`;
}

type PendingChunk = {
  id: string;
  text: string;
  projectId: string;
  confidentialityTier: string | null;
};

/**
 * Chunks awaiting a vector, joined to their document's confidentiality tier.
 * The tier drives whether each chunk may be sent to the configured endpoint,
 * so it must come from the document, not be assumed.
 */
async function fetchPending(afterId: string | null): Promise<PendingChunk[]> {
  return prisma.$queryRaw<PendingChunk[]>(Prisma.sql`
    SELECT dc.id, dc.text, dc."projectId", rd."confidentialityTier"
    FROM "DocumentChunk" dc
    JOIN "RequirementsDocument" rd ON rd.id = dc."documentId"
    WHERE dc."embedding" IS NULL
      AND rd."deletedAt" IS NULL
      ${PROJECT ? Prisma.sql`AND dc."projectId" = ${PROJECT}` : Prisma.empty}
      ${afterId ? Prisma.sql`AND dc.id > ${afterId}` : Prisma.empty}
    ORDER BY dc.id
    LIMIT ${PAGE}
  `);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.error("DATABASE_URL must point at Postgres — embeddings need pgvector.");
    process.exit(1);
  }

  if (!(await hasVectorSupport())) {
    console.error(
      "This database has no DocumentChunk.embedding column.\n" +
      "Run `node scripts/migrate-neon-all.js` first. If it reported pgvector as\n" +
      "skipped, the extension is unavailable — on Azure Database for PostgreSQL\n" +
      "'vector' must be allowlisted in the azure.extensions server parameter."
    );
    process.exit(1);
  }

  const endpoint = await resolveEmbeddingEndpoint();
  if (endpoint.kind === "disabled") {
    console.error(`No embedding endpoint configured: ${endpoint.reason}`);
    process.exit(1);
  }

  const total = await countPendingEmbeddings(PROJECT);
  console.log(`\n  Endpoint     ${endpoint.kind}${isInTenant(endpoint) ? " (in-tenant)" : " (external)"}`);
  console.log(`  Model        ${EMBEDDING_MODEL}`);
  console.log(`  Scope        ${PROJECT ? `project ${PROJECT}` : "all projects"}`);
  console.log(`  Pending      ${total} chunk(s)`);
  if (!isInTenant(endpoint)) {
    console.log(`  Note         restricted-tier documents will be skipped (external endpoint)`);
  }
  console.log("");

  if (total === 0) {
    console.log("  Nothing to do.\n");
    return;
  }

  let processed = 0, stored = 0, skipped = 0, chars = 0;
  let cursor: string | null = null;

  for (;;) {
    if (processed >= LIMIT) break;

    const page: PendingChunk[] = await fetchPending(cursor);
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    // One call per tier — the tier gate is per-document, and mixing tiers in a
    // batch would apply the strictest or loosest rule to all of them.
    const byTier = new Map<string, PendingChunk[]>();
    for (const c of page) {
      const tier = c.confidentialityTier ?? "standard";
      const list = byTier.get(tier) ?? [];
      list.push(c);
      byTier.set(tier, list);
    }

    for (const [tier, group] of byTier) {
      chars += group.reduce((sum, c) => sum + c.text.length, 0);
      processed += group.length;

      if (DRY_RUN) continue;

      const res = await embedAndStoreChunks(
        group.map((c) => ({ id: c.id, text: c.text })),
        { confidentialityTier: tier }
      );
      if (res.skipped) {
        skipped += group.length;
        console.log(`  ~ ${group.length} chunk(s) [tier=${tier}] skipped — ${res.reason}`);
      } else {
        stored += res.stored;
      }
    }

    if (!DRY_RUN) {
      process.stdout.write(`\r  ${stored} embedded, ${skipped} skipped, ${processed}/${total} seen`);
    }
  }

  if (DRY_RUN) {
    console.log(`  Would embed ${processed} chunk(s), ~${Math.round(chars / 4).toLocaleString()} tokens`);
    console.log(`  Estimated cost: ${estimateCost(chars)}\n`);
    return;
  }

  console.log(`\n\n  Done — ${stored} embedded, ${skipped} skipped, ${processed} seen.`);
  console.log(`  Approximate cost: ${estimateCost(chars)}`);

  const remaining = await countPendingEmbeddings(PROJECT);
  if (remaining > 0) {
    console.log(`  ${remaining} chunk(s) still pending — re-run to continue, or check the skip reasons above.`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("\nBackfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
