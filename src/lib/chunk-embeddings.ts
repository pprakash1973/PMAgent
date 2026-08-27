/**
 * Persistence for chunk vectors.
 *
 * Prisma cannot read or write an Unsupported("vector") column, so everything
 * here is raw SQL. Shared by document ingestion and the backfill script so both
 * batch, cast and guard identically.
 *
 * Embedding progress is NOT tracked on RequirementsDocument.ingestionState.
 * A document is "ready" the moment its chunks exist — keyword retrieval works
 * without vectors, and computeAndSaveReadiness() only counts ready documents,
 * so gating readiness on embedding would make uploads look degraded for no
 * reason. Outstanding work is simply `WHERE embedding IS NULL`, which the
 * partial index DocumentChunk_embedding_pending_idx serves.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  embedTexts,
  resolveEmbeddingEndpoint,
  canEmbedTier,
  toVectorLiteral,
  EMBEDDING_DIMENSIONS,
} from "@/lib/embeddings";

/** Rows per UPDATE. Keeps the statement and its parameter list a sane size. */
const WRITE_BATCH = 96;

let _vectorSupport: boolean | null = null;

/**
 * Whether this database actually has the embedding column.
 *
 * pgvector is deployed best-effort (see scripts/migrate-neon-all.js): the
 * extension needs privileges the deploy role may not hold, and on Azure
 * Database for PostgreSQL it must also be allowlisted in azure.extensions.
 * Probing information_schema once is cheaper than letting every semantic query
 * fail against a cluster that never got the column.
 */
export async function hasVectorSupport(): Promise<boolean> {
  if (_vectorSupport !== null) return _vectorSupport;

  const url = process.env.DATABASE_URL ?? "";
  if (!url || url.startsWith("file:")) {
    _vectorSupport = false;
    return false;
  }

  try {
    const rows = await prisma.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'DocumentChunk' AND column_name = 'embedding'
      ) AS exists
    `);
    _vectorSupport = rows[0]?.exists === true;
  } catch (err) {
    console.warn("[embeddings] vector support probe failed, assuming unavailable:", err);
    _vectorSupport = false;
  }
  return _vectorSupport;
}

/** Test seam / settings-change hook. */
export function resetVectorSupportCache() {
  _vectorSupport = null;
}

export interface EmbedChunksResult {
  attempted: number;
  stored: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Embed the given chunks and write their vectors.
 *
 * Never throws: embedding is an enhancement, and a failure here must leave the
 * document fully usable through the keyword arm. Callers get a result they can
 * log, not an error they must handle.
 */
export async function embedAndStoreChunks(
  chunks: Array<{ id: string; text: string }>,
  opts: { confidentialityTier?: string | null } = {}
): Promise<EmbedChunksResult> {
  const attempted = chunks.length;
  if (attempted === 0) return { attempted: 0, stored: 0, skipped: true, reason: "no chunks" };

  if (!(await hasVectorSupport())) {
    return { attempted, stored: 0, skipped: true, reason: "database has no embedding column" };
  }

  const endpoint = await resolveEmbeddingEndpoint();
  if (!canEmbedTier(opts.confidentialityTier, endpoint)) {
    const reason =
      endpoint.kind === "disabled"
        ? endpoint.reason
        : `confidentialityTier=${opts.confidentialityTier} requires an in-tenant endpoint; ` +
          `current endpoint is ${endpoint.kind}`;
    return { attempted, stored: 0, skipped: true, reason };
  }

  let stored = 0;
  try {
    for (let i = 0; i < chunks.length; i += WRITE_BATCH) {
      const batch = chunks.slice(i, i + WRITE_BATCH);
      const res = await embedTexts(batch.map((c) => c.text));
      if (!res) return { attempted, stored, skipped: true, reason: "embedding request failed" };

      stored += await writeVectors(
        batch.map((c, j) => ({ id: c.id, vector: res.vectors[j] })),
        res.model
      );
    }
    return { attempted, stored, skipped: false };
  } catch (err) {
    console.error("[embeddings] persist failed:", err);
    return { attempted, stored, skipped: true, reason: (err as Error).message };
  }
}

/**
 * Single UPDATE ... FROM (VALUES ...) per batch.
 *
 * Every value carries an explicit cast: without them Postgres infers `unknown`
 * for the VALUES columns and the join to dc.id fails at plan time.
 */
async function writeVectors(
  rows: Array<{ id: string; vector: number[] }>,
  model: string
): Promise<number> {
  const usable = rows.filter((r) => r.vector?.length === EMBEDDING_DIMENSIONS);
  if (usable.length === 0) return 0;

  const tuples = usable.map(
    (r) => Prisma.sql`(${r.id}::text, ${toVectorLiteral(r.vector)}::vector)`
  );

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "DocumentChunk" AS dc
    SET "embedding" = v.emb, "embeddingModel" = ${model}
    FROM (VALUES ${Prisma.join(tuples)}) AS v(id, emb)
    WHERE dc.id = v.id
  `);

  return usable.length;
}

/** Chunks in a project still awaiting a vector. Used by the backfill script. */
export async function countPendingEmbeddings(projectId?: string): Promise<number> {
  if (!(await hasVectorSupport())) return 0;
  const rows = projectId
    ? await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS count FROM "DocumentChunk"
        WHERE "embedding" IS NULL AND "projectId" = ${projectId}
      `)
    : await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS count FROM "DocumentChunk" WHERE "embedding" IS NULL
      `);
  return Number(rows[0]?.count ?? 0);
}
