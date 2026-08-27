/**
 * Evidence Assembler — Phase 2 of Grounding PRD
 *
 * Retrieves relevant DocumentChunks for a given artifact type.
 *
 * Retrieval is hybrid: a lexical arm (PostgreSQL tsvector/ts_rank) and a
 * semantic arm (pgvector cosine KNN) run concurrently and are fused by
 * Reciprocal Rank Fusion. Each arm gets a query shaped for what it is good at —
 * see ARTIFACT_SEARCH_TERMS vs ARTIFACT_SEARCH_INTENT below.
 *
 * Every arm is optional. Semantic retrieval needs pgvector plus a configured
 * embedding endpoint plus chunks that have actually been embedded; when any of
 * those is missing the arm returns empty and retrieval proceeds keyword-only.
 * The ladder, worst case last:
 *
 *   hybrid    both arms returned; RRF fused
 *   keyword   one arm returned (usually lexical; vectors not yet backfilled)
 *   backfill  arms were thin; topped up with chunks in document order
 *   fallback  no search available at all; document order only
 *
 * Partition isolation: every query is filtered by projectId so no
 * cross-project content can appear in the assembled context.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { embedQuery, toVectorLiteral } from "@/lib/embeddings";
import { hasVectorSupport } from "@/lib/chunk-embeddings";

export interface EvidenceChunk {
  id: string;
  text: string;
  sectionTitle: string | null;
  pageNumber: number | null;
  documentId: string;
  chunkIndex: number;
  /** Provenance — populated by the fusion step, absent on raw arm output. */
  matchedBy?: MatchedBy;
}

/** Which retrieval path actually produced the chunks — surfaced for logging and eval. */
export type RetrievalMode =
  | "hybrid"    // keyword and semantic arms both ran, fused by RRF
  | "keyword"   // lexical only (no vectors available, or the semantic arm failed)
  | "backfill"  // retrieval was thin; topped up with chunks in document order
  | "fallback"  // no search available at all; document order only
  | "none";     // project has no chunks at all

/** Which arm(s) surfaced a given chunk. Drives eval and "why was this cited". */
export type MatchedBy = "keyword" | "semantic" | "both" | "position";

export interface EvidenceContext {
  chunks: EvidenceChunk[];
  totalChunksInProject: number;
  queryTerms: string[];
  hasEvidence: boolean;
  mode: RetrievalMode;
}

// Search terms used per artifact type to retrieve the most relevant chunks
const ARTIFACT_SEARCH_TERMS: Record<string, string[]> = {
  project_charter:      ["project charter objectives scope deliverables stakeholders budget timeline sponsor"],
  business_case:        ["business case objectives benefits costs roi investment return problem solution"],
  stakeholder_register: ["stakeholders sponsor roles responsibilities contact organization power interest"],
  initiation_deck:      ["project overview objectives scope deliverables timeline budget sponsor governance"],
  assumption_log:       ["assumptions dependencies external factors risks constraints conditions"],
  benefits_register:    ["benefits value roi outcomes KPI measurement baseline target realization"],
  scope_statement:      ["scope deliverables inclusions exclusions acceptance criteria boundaries"],
  wbs:                  ["work breakdown structure phases deliverables tasks activities workpackages"],
  milestone_plan:       ["milestones dates schedule phases key events delivery completion"],
  resource_plan:        ["team resources roles allocation skills headcount staffing"],
  cost_plan:            ["budget cost estimate funding contingency reserve rates labor expenses"],
  raid_register:        ["risks assumptions issues dependencies mitigation contingency owner"],
  risk_register:        ["risks probability impact mitigation owner category threats opportunities"],
  communication_plan:   ["communication stakeholders meetings reports frequency channel method"],
  raci_matrix:          ["responsible accountable consulted informed RACI roles activities"],
  quality_plan:         ["quality standards acceptance criteria metrics testing validation"],
  action_log:           ["actions tasks owner due date priority status follow-up"],
  issue_register:       ["issues problems blockers severity resolution owner"],
  decision_log:         ["decisions rationale alternatives approved date impact"],
  weekly_status:        ["status progress schedule budget risks accomplishments plan"],
  monthly_status:       ["monthly report status executive summary milestone budget performance"],
  change_log:           ["change requests scope changes impact approval CCB baseline"],
  lessons_learned:      ["lessons learned retrospective improvements recommendations closure"],
  closure_report:       ["closure objectives achieved deliverables accepted budget final sign-off"],
  traceability_matrix:  ["requirements traceability WBS milestone acceptance criteria validation"],
};

/**
 * Natural-language intent per artifact type — the semantic arm's query.
 *
 * Deliberately NOT the same strings as ARTIFACT_SEARCH_TERMS above. That map is
 * a bag of PM vocabulary, which is what plainto_tsquery wants and close to the
 * worst possible input to an embedding model: embeddings encode meaning, and a
 * keyword soup has no coherent meaning to encode. Each arm gets the query form
 * it is actually good at.
 *
 * These strings are static, so their vectors are computed once and cached —
 * query-side embedding cost is effectively zero.
 */
const ARTIFACT_SEARCH_INTENT: Record<string, string> = {
  project_charter:      "What is this project for? Its objectives, scope, deliverables, sponsor, budget and timeline, and who authorises it.",
  business_case:        "Why is this project worth doing? The problem, the proposed solution, expected benefits, costs and return on investment.",
  stakeholder_register: "Who is involved in this project? Sponsors, decision makers, affected teams, their roles, influence and interest.",
  initiation_deck:      "An overview of the project for kickoff: what it delivers, when, for whom, at what cost, and how it is governed.",
  assumption_log:       "What is being assumed or taken for granted? External dependencies, preconditions and constraints the plan relies on.",
  benefits_register:    "What value does this project create, how is it measured, what is the baseline and target, and when is it realised?",
  scope_statement:      "What is included in this project and what is explicitly excluded? Deliverables, boundaries and acceptance criteria.",
  wbs:                  "How is the work decomposed? The phases, deliverables and work packages that must be built, tested and delivered.",
  milestone_plan:       "What are the key dates and checkpoints? Phase gates, delivery dates and completion events.",
  resource_plan:        "Who is needed to do the work? Roles, skills, headcount, allocation and how the team is staffed over time.",
  cost_plan:            "What will this cost? Budget breakdown, estimates, rates, funding, contingency and reserve.",
  raid_register:        "What risks, assumptions, issues and dependencies affect delivery, and who owns each?",
  risk_register:        "What could go wrong on this project? Threats, how likely each is, its impact, and who owns mitigating it.",
  communication_plan:   "How will the project communicate? Who needs what information, how often, and through which channel.",
  raci_matrix:          "Who is responsible, accountable, consulted and informed for each activity or decision?",
  quality_plan:         "How will quality be assured? Standards, acceptance criteria, metrics, testing and validation approach.",
  action_log:           "What actions need doing, by whom, and by when?",
  issue_register:       "What problems and blockers exist right now, how severe are they, and how are they being resolved?",
  decision_log:         "What decisions have been made, why, what alternatives were considered, and what was their impact?",
  weekly_status:        "How is the project progressing this week against schedule and budget? Accomplishments, risks and next steps.",
  monthly_status:       "How has the project performed this month? Executive summary, milestone progress, budget position and outlook.",
  change_log:           "What changes have been requested to scope, cost or schedule, and how were they assessed and approved?",
  lessons_learned:      "What went well, what went badly, and what should be done differently next time?",
  closure_report:       "Was the project completed as intended? Objectives achieved, deliverables accepted, final budget and sign-off.",
  traceability_matrix:  "How does each requirement map to the work that delivers it and the tests that verify it?",
};

const DEFAULT_INTENT = "What does this project involve — its scope, objectives and deliverables?";

const TOP_K = 12;          // max chunks handed to the model per artifact generation
const CANDIDATE_POOL = 30; // per-arm retrieval depth before ranking down to TOP_K
const MIN_USEFUL_HITS = 4; // below this, top up with document-order chunks
const RRF_K = 60;          // standard RRF damping; tune against the Phase 4 eval, not by feel

const CHUNK_SELECT = {
  id: true, text: true, sectionTitle: true, pageNumber: true,
  documentId: true, chunkIndex: true,
} as const;

/**
 * Full-text search is Postgres-only. Local dev runs on SQLite (see lib/db.ts),
 * where to_tsvector does not exist and the query throws. Detect that up front
 * rather than relying on a driver error.
 */
function supportsFullTextSearch(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.length > 0 && !url.startsWith("file:");
}

/**
 * Turn a term list into a disjunctive tsquery: "risks impact owner" →
 * "risks | impact | owner".
 *
 * This must NOT use plainto_tsquery (or websearch_to_tsquery), which both join
 * every term with AND. The search terms above are 8-10 word topic lists, so
 * AND semantics require a single ~500-character chunk to contain all of them —
 * which effectively never happens, and the arm returns nothing. OR semantics
 * are what a bag-of-keywords query means; ts_rank then does the discriminating,
 * scoring chunks by how many of the terms they hit and how often.
 *
 * Tokens are stripped to [a-z0-9] before being joined, so no tsquery operator
 * can reach to_tsquery even though these strings are developer-authored today.
 */
function toOrTsQuery(terms: string[]): string | null {
  const tokens = new Set(
    terms
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1)
  );
  return tokens.size ? [...tokens].join(" | ") : null;
}

/**
 * Lexical arm — ts_rank over an English tsvector, scoped to one project.
 *
 * The tsvector expression must stay identical to the GIN index
 * "DocumentChunk_text_search_idx" in scripts/migrate-neon-all.js. If they drift
 * (a different regconfig, a different column expression) Postgres cannot use the
 * index and silently reverts to a sequential scan — no error, just a slow query.
 */
async function keywordSearch(
  projectId: string,
  orQuery: string,
  limit: number
): Promise<EvidenceChunk[]> {
  return prisma.$queryRaw<EvidenceChunk[]>(
    Prisma.sql`
      SELECT
        dc.id,
        dc.text,
        dc."sectionTitle",
        dc."pageNumber",
        dc."documentId",
        dc."chunkIndex"
      FROM "DocumentChunk" dc
      WHERE dc."projectId" = ${projectId}
        AND to_tsvector('english', dc.text) @@ to_tsquery('english', ${orQuery})
      ORDER BY ts_rank(to_tsvector('english', dc.text), to_tsquery('english', ${orQuery})) DESC
      LIMIT ${limit}
    `
  );
}

/**
 * Semantic arm — exact cosine KNN over this project's embedded chunks.
 *
 * `embedding IS NOT NULL` is not optional: chunks predating the backfill, and
 * restricted-tier chunks on an out-of-tenant endpoint, legitimately have no
 * vector. Without the filter pgvector treats NULL as maximally distant and they
 * would crowd out real matches at the tail of the result set.
 *
 * No ANN index by design — see the note in scripts/migrate-neon-all.js.
 */
async function semanticSearch(
  projectId: string,
  queryVector: number[],
  limit: number
): Promise<EvidenceChunk[]> {
  const literal = toVectorLiteral(queryVector);
  return prisma.$queryRaw<EvidenceChunk[]>(
    Prisma.sql`
      SELECT
        dc.id,
        dc.text,
        dc."sectionTitle",
        dc."pageNumber",
        dc."documentId",
        dc."chunkIndex"
      FROM "DocumentChunk" dc
      WHERE dc."projectId" = ${projectId}
        AND dc."embedding" IS NOT NULL
      ORDER BY dc."embedding" <=> ${literal}::vector
      LIMIT ${limit}
    `
  );
}

/**
 * Reciprocal Rank Fusion.
 *
 *   score(chunk) = Σ over arms of  1 / (RRF_K + rank_in_that_arm)
 *
 * Rank-based rather than score-based because ts_rank (unbounded, corpus
 * dependent) and cosine distance (0–2) are not comparable, and normalising them
 * needs per-query calibration that drifts as the corpus grows. RRF sidesteps
 * that entirely: a chunk both arms rank well beats one that dominates a single
 * arm, which is the whole point of running two.
 */
function rrfFuse(arms: Array<{ name: MatchedBy; chunks: EvidenceChunk[] }>): EvidenceChunk[] {
  const scores = new Map<string, { chunk: EvidenceChunk; score: number; arms: Set<MatchedBy> }>();

  for (const arm of arms) {
    arm.chunks.forEach((chunk, rank) => {
      const entry = scores.get(chunk.id) ?? { chunk, score: 0, arms: new Set<MatchedBy>() };
      entry.score += 1 / (RRF_K + rank + 1); // rank is 0-based; RRF is 1-based
      entry.arms.add(arm.name);
      scores.set(chunk.id, entry);
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, arms: hit }) => ({
      ...chunk,
      matchedBy: hit.size > 1 ? ("both" as const) : ([...hit][0] ?? "keyword"),
    }));
}

/** Positional arm — first N chunks in document order. Not relevance, just coverage. */
async function documentOrderChunks(projectId: string, limit: number): Promise<EvidenceChunk[]> {
  if (limit <= 0) return [];
  const rows = await prisma.documentChunk.findMany({
    where: { projectId },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: limit,
    select: CHUNK_SELECT,
  });
  return rows as EvidenceChunk[];
}

/**
 * Assemble evidence for a given artifact type from a project's document store.
 */
export async function assembleEvidence(
  projectId: string,
  artifactType: string
): Promise<EvidenceContext> {
  const totalChunksInProject = await prisma.documentChunk.count({
    where: { projectId },
  });

  const terms = ARTIFACT_SEARCH_TERMS[artifactType] ?? ["project scope objectives deliverables"];

  if (totalChunksInProject === 0) {
    return { chunks: [], totalChunksInProject: 0, queryTerms: terms, hasEvidence: false, mode: "none" };
  }

  const searchQuery = toOrTsQuery(terms);
  const intent = ARTIFACT_SEARCH_INTENT[artifactType] ?? DEFAULT_INTENT;

  // Both arms run concurrently; neither can fail the other. Each resolves to an
  // empty array on any problem so fusion degrades to whichever arm did return.
  const [keywordHits, semanticHits] = await Promise.all([
    runKeywordArm(projectId, searchQuery, artifactType),
    runSemanticArm(projectId, intent, artifactType),
  ]);

  let chunks: EvidenceChunk[] = [];
  let mode: RetrievalMode;

  if (keywordHits.length && semanticHits.length) {
    chunks = rrfFuse([
      { name: "keyword", chunks: keywordHits },
      { name: "semantic", chunks: semanticHits },
    ]).slice(0, TOP_K);
    mode = "hybrid";
  } else if (keywordHits.length || semanticHits.length) {
    const only = keywordHits.length ? keywordHits : semanticHits;
    const name: MatchedBy = keywordHits.length ? "keyword" : "semantic";
    chunks = only.slice(0, TOP_K).map((c) => ({ ...c, matchedBy: name }));
    mode = "keyword";
  } else {
    chunks = [];
    mode = "fallback";
  }

  // Thin result — top up so the model still sees real source text.
  if (chunks.length < MIN_USEFUL_HITS) {
    const existingIds = new Set(chunks.map((c) => c.id));
    const filler = await documentOrderChunks(projectId, TOP_K);
    for (const c of filler) {
      if (chunks.length >= TOP_K) break;
      if (!existingIds.has(c.id)) chunks.push({ ...c, matchedBy: "position" });
    }
    if (mode !== "fallback") mode = "backfill";
  }

  return {
    chunks,
    totalChunksInProject,
    queryTerms: terms,
    hasEvidence: chunks.length > 0,
    mode,
  };
}

/** Lexical arm, isolated so its failure cannot take down the semantic arm. */
async function runKeywordArm(
  projectId: string,
  query: string | null,
  artifactType: string
): Promise<EvidenceChunk[]> {
  if (!supportsFullTextSearch() || !query) return [];
  try {
    return await keywordSearch(projectId, query, CANDIDATE_POOL);
  } catch (err) {
    console.error(`[evidence] keyword arm failed for ${artifactType}:`, err);
    return [];
  }
}

/**
 * Semantic arm. Returns [] — not an error — whenever vectors are unavailable:
 * no pgvector on this cluster, no embedding endpoint configured, or the query
 * embedding call failed. Retrieval then proceeds keyword-only.
 */
async function runSemanticArm(
  projectId: string,
  intent: string,
  artifactType: string
): Promise<EvidenceChunk[]> {
  try {
    if (!(await hasVectorSupport())) return [];

    const vector = await embedIntent(intent);
    if (!vector) return [];

    return await semanticSearch(projectId, vector, CANDIDATE_POOL);
  } catch (err) {
    console.error(`[evidence] semantic arm failed for ${artifactType}:`, err);
    return [];
  }
}

/**
 * The 25 intent strings are static, so each is embedded at most once per
 * process. In-flight promises are cached too, so concurrent batch generation
 * cannot fire the same request several times.
 */
const _intentVectors = new Map<string, Promise<number[] | null>>();

function embedIntent(intent: string): Promise<number[] | null> {
  let pending = _intentVectors.get(intent);
  if (!pending) {
    pending = embedQuery(intent).then((vec) => {
      // Don't cache a failure — the endpoint may just have been briefly down.
      if (!vec) _intentVectors.delete(intent);
      return vec;
    });
    _intentVectors.set(intent, pending);
  }
  return pending;
}

/**
 * Format assembled evidence chunks into a prompt-ready string block.
 * Each chunk is labeled with its source location for traceability.
 */
export function formatEvidenceForPrompt(ctx: EvidenceContext): string {
  if (!ctx.hasEvidence) return "";

  const lines: string[] = [
    "SOURCE DOCUMENTS (your ONLY source of project-specific facts):",
    "You MUST use facts from these documents. Do NOT use parametric knowledge to invent names, numbers, or dates.",
    "",
  ];

  ctx.chunks.forEach((chunk, i) => {
    const loc = [
      chunk.pageNumber ? `p.${chunk.pageNumber}` : null,
      chunk.sectionTitle ? `§ ${chunk.sectionTitle}` : null,
    ].filter(Boolean).join(" — ");
    lines.push(`--- SOURCE ${i + 1}${loc ? ` (${loc})` : ""} ---`);
    lines.push(chunk.text.trim());
    lines.push("");
  });

  lines.push("--- END SOURCE DOCUMENTS ---");
  lines.push("");
  lines.push(
    "GROUNDING RULES:",
    '- For any field where the SOURCE DOCUMENTS provide clear evidence: use that evidence.',
    '- For any field where the SOURCE DOCUMENTS provide no evidence: output the string "GAP: <one-sentence description of what information is missing>".',
    '- Never invent project-specific values (sponsor names, budget figures, dates, scope items) not found in the SOURCE DOCUMENTS.',
    '- Generic PM methodology (PMBOK processes, templates, best-practice text) is acceptable parametric knowledge.',
    ""
  );

  return lines.join("\n");
}

/**
 * Count how many GAP markers appear in a generated artifact's JSON values.
 */
export function countGaps(content: Record<string, unknown>): number {
  let count = 0;
  const scan = (val: unknown) => {
    if (typeof val === "string" && val.startsWith("GAP:")) { count++; return; }
    if (Array.isArray(val)) { val.forEach(scan); return; }
    if (val && typeof val === "object") { Object.values(val).forEach(scan); }
  };
  scan(content);
  return count;
}

/**
 * Extract field paths that contain GAP markers for Gap register storage.
 */
export function extractGapFields(
  content: Record<string, unknown>,
  artifactType: string
): Array<{ fieldId: string; question: string }> {
  const gaps: Array<{ fieldId: string; question: string }> = [];
  const scan = (val: unknown, path: string) => {
    if (typeof val === "string" && val.startsWith("GAP:")) {
      gaps.push({ fieldId: path, question: val.replace(/^GAP:\s*/, "") });
      return;
    }
    if (Array.isArray(val)) { val.forEach((v, i) => scan(v, `${path}[${i}]`)); return; }
    if (val && typeof val === "object") {
      Object.entries(val as Record<string, unknown>).forEach(([k, v]) => scan(v, `${path}.${k}`));
    }
  };
  scan(content, artifactType);
  return gaps;
}
