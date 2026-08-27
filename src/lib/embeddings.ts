/**
 * Embedding provider — the semantic arm's vector source.
 *
 * Two endpoints, chosen by configuration at deploy time rather than in code:
 *
 *   azure   text-embedding-3-small deployed inside your Azure tenant.
 *           Chunk text never crosses the tenant boundary.
 *   openai  api.openai.com with the existing OPENAI_API_KEY.
 *           Zero setup; chunk text leaves the tenant.
 *
 * Both must run the SAME model at the SAME dimensionality. Vectors from
 * different models are not comparable, and a stored corpus embedded by one
 * cannot be searched by another — hence EMBEDDING_MODEL is fixed here rather
 * than made configurable. DocumentChunk.embeddingModel records what actually
 * produced each row so a model change is detectable instead of silently
 * corrupting similarity scores.
 *
 * Anthropic has no embeddings API, which is why this does not go through
 * lib/providers — that abstraction is for chat completions.
 */

import type OpenAIType from "openai";
import { getApiKey } from "@/lib/providers/get-api-key";
import { getSystemSetting } from "@/lib/system-settings";

/** Fixed: changing either value invalidates every stored vector. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** text-embedding-3-small accepts 8191 tokens; chunks are ~125. Defensive only. */
const MAX_CHARS_PER_INPUT = 24_000;

/** Inputs per request. The API allows far more; smaller batches fail cheaper. */
const BATCH_SIZE = 96;

export type EmbeddingEndpoint =
  | { kind: "azure"; apiKey: string; endpoint: string; deployment: string; apiVersion: string }
  | { kind: "openai"; apiKey: string }
  | { kind: "disabled"; reason: string };

/** True when inference happens inside the customer's own tenant. */
export function isInTenant(ep: EmbeddingEndpoint): boolean {
  return ep.kind === "azure";
}

/**
 * Documents marked `restricted` are only embedded when inference is in-tenant.
 * Skipping costs nothing functionally: those chunks stay fully searchable via
 * the keyword arm, and hybrid retrieval simply degrades to lexical for them.
 */
export function canEmbedTier(tier: string | null | undefined, ep: EmbeddingEndpoint): boolean {
  if (ep.kind === "disabled") return false;
  if (tier === "restricted") return isInTenant(ep);
  return true;
}

async function setting(key: string, envVar: string): Promise<string | undefined> {
  try {
    const v = await getSystemSetting(key);
    if (v) return v;
  } catch {
    // Settings table unreachable — fall through to env.
  }
  return process.env[envVar];
}

let _endpointCache: { value: EmbeddingEndpoint; expiresAt: number } | null = null;

/**
 * Resolve the configured endpoint. Explicit `embedding.provider` wins; otherwise
 * an Azure endpoint being present implies Azure, then a plain OpenAI key.
 * Absent everything, embeddings are off and retrieval stays keyword-only.
 */
export async function resolveEmbeddingEndpoint(): Promise<EmbeddingEndpoint> {
  if (_endpointCache && _endpointCache.expiresAt > Date.now()) return _endpointCache.value;

  const resolved = await resolveUncached();
  _endpointCache = { value: resolved, expiresAt: Date.now() + 60_000 };
  return resolved;
}

export function invalidateEmbeddingEndpoint() {
  _endpointCache = null;
}

async function resolveUncached(): Promise<EmbeddingEndpoint> {
  const mode = (await setting("embedding.provider", "EMBEDDING_PROVIDER"))?.toLowerCase();
  if (mode === "off" || mode === "disabled") {
    return { kind: "disabled", reason: "embedding.provider is set to off" };
  }

  const azureEndpoint = await setting("embedding.azure.endpoint", "AZURE_OPENAI_ENDPOINT");
  const azureKey = await setting("embedding.azure.apiKey", "AZURE_OPENAI_API_KEY");
  const azureDeployment = await setting("embedding.azure.deployment", "AZURE_OPENAI_EMBEDDING_DEPLOYMENT");
  const azureVersion = (await setting("embedding.azure.apiVersion", "AZURE_OPENAI_API_VERSION")) ?? "2024-10-21";

  const wantsAzure = mode === "azure" || (!mode && !!azureEndpoint);
  if (wantsAzure) {
    const missing = [
      !azureEndpoint && "AZURE_OPENAI_ENDPOINT",
      !azureKey && "AZURE_OPENAI_API_KEY",
      !azureDeployment && "AZURE_OPENAI_EMBEDDING_DEPLOYMENT",
    ].filter(Boolean);
    if (missing.length) {
      return { kind: "disabled", reason: `Azure embedding selected but missing: ${missing.join(", ")}` };
    }
    return {
      kind: "azure",
      apiKey: azureKey!,
      endpoint: azureEndpoint!,
      deployment: azureDeployment!,
      apiVersion: azureVersion,
    };
  }

  const openaiKey = await getApiKey("openai");
  if (!openaiKey) {
    return { kind: "disabled", reason: "no embedding endpoint configured" };
  }
  return { kind: "openai", apiKey: openaiKey };
}

async function clientFor(ep: EmbeddingEndpoint): Promise<OpenAIType> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OpenAI, AzureOpenAI } = require("openai");
  if (ep.kind === "azure") {
    return new AzureOpenAI({
      apiKey: ep.apiKey,
      endpoint: ep.endpoint,
      apiVersion: ep.apiVersion,
      deployment: ep.deployment,
    });
  }
  if (ep.kind === "openai") {
    return new OpenAI({ apiKey: ep.apiKey });
  }
  throw new Error("embeddings are disabled");
}

function prepare(text: string): string {
  // The API rejects empty input; a single space keeps batch indices aligned
  // with the caller's array so a blank chunk cannot shift every later vector.
  const t = text.trim();
  if (!t) return " ";
  return t.length > MAX_CHARS_PER_INPUT ? t.slice(0, MAX_CHARS_PER_INPUT) : t;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  endpointKind: EmbeddingEndpoint["kind"];
}

/**
 * Embed a batch of texts. Returns null when embeddings are unavailable or the
 * call fails — callers must treat that as "semantic arm unavailable", never as
 * an error worth failing the surrounding operation for.
 *
 * Output order matches input order, which the chunk writer relies on.
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult | null> {
  if (texts.length === 0) return { vectors: [], model: EMBEDDING_MODEL, endpointKind: "disabled" };

  const ep = await resolveEmbeddingEndpoint();
  if (ep.kind === "disabled") {
    console.warn(`[embeddings] skipped: ${ep.reason}`);
    return null;
  }

  try {
    const client = await clientFor(ep);
    const vectors: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map(prepare);
      const res = await client.embeddings.create({
        model: ep.kind === "azure" ? ep.deployment : EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      // The API may return items out of order; `index` is authoritative.
      const ordered = [...res.data].sort((a, b) => a.index - b.index);
      if (ordered.length !== batch.length) {
        throw new Error(`expected ${batch.length} vectors, got ${ordered.length}`);
      }
      for (const item of ordered) {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `dimension mismatch: got ${item.embedding.length}, expected ${EMBEDDING_DIMENSIONS}. ` +
            `Check the Azure deployment is ${EMBEDDING_MODEL}.`
          );
        }
        vectors.push(item.embedding);
      }
    }

    return { vectors, model: EMBEDDING_MODEL, endpointKind: ep.kind };
  } catch (err) {
    console.error("[embeddings] request failed:", err);
    return null;
  }
}

/** Query-side embedding. Query strings are static, so callers should cache. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const res = await embedTexts([text]);
  return res?.vectors[0] ?? null;
}

/** Postgres vector literal — pgvector parses '[1,2,3]'. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
