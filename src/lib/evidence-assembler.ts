/**
 * Evidence Assembler — Phase 2 of Grounding PRD
 *
 * Retrieves relevant DocumentChunks for a given artifact type.
 *
 * Retrieval today is lexical: PostgreSQL full-text search (tsvector/ts_rank).
 * The code is structured as independent "arms" so a semantic arm can be fused
 * in alongside it without reshaping the caller contract.
 *
 * Partition isolation: every query is filtered by projectId so no
 * cross-project content can appear in the assembled context.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface EvidenceChunk {
  id: string;
  text: string;
  sectionTitle: string | null;
  pageNumber: number | null;
  documentId: string;
  chunkIndex: number;
}

/** Which retrieval path actually produced the chunks — surfaced for logging and eval. */
export type RetrievalMode =
  | "keyword"   // full-text search returned enough results on its own
  | "backfill"  // FTS was thin; topped up with chunks in document order
  | "fallback"  // FTS unavailable or failed; document order only
  | "none";     // project has no chunks at all

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

const TOP_K = 12;          // max chunks handed to the model per artifact generation
const CANDIDATE_POOL = 30; // per-arm retrieval depth before ranking down to TOP_K
const MIN_USEFUL_HITS = 4; // below this, top up with document-order chunks

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
 * Lexical arm — ts_rank over an English tsvector, scoped to one project.
 *
 * The tsvector expression must stay identical to the GIN index
 * "DocumentChunk_text_search_idx" in scripts/migrate-neon-all.js. If they drift
 * (a different regconfig, a different column expression) Postgres cannot use the
 * index and silently reverts to a sequential scan — no error, just a slow query.
 */
async function keywordSearch(
  projectId: string,
  query: string,
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
        AND to_tsvector('english', dc.text) @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(to_tsvector('english', dc.text), plainto_tsquery('english', ${query})) DESC
      LIMIT ${limit}
    `
  );
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

  const searchQuery = terms.join(" ");

  let chunks: EvidenceChunk[] = [];
  let mode: RetrievalMode = "fallback";

  if (supportsFullTextSearch()) {
    try {
      chunks = (await keywordSearch(projectId, searchQuery, CANDIDATE_POOL)).slice(0, TOP_K);
      mode = "keyword";
    } catch (err) {
      // A retrieval failure must never block generation — degrade to document
      // order, which is worse than ranked but still grounded in the real source.
      console.error(`[evidence] keyword search failed for ${artifactType}:`, err);
      chunks = [];
      mode = "fallback";
    }
  }

  // Thin lexical result — top up so the model still sees real source text.
  if (chunks.length < MIN_USEFUL_HITS) {
    const existingIds = new Set(chunks.map((c) => c.id));
    const filler = await documentOrderChunks(projectId, TOP_K);
    for (const c of filler) {
      if (chunks.length >= TOP_K) break;
      if (!existingIds.has(c.id)) chunks.push(c);
    }
    if (mode === "keyword") mode = "backfill";
  }

  return {
    chunks,
    totalChunksInProject,
    queryTerms: terms,
    hasEvidence: chunks.length > 0,
    mode,
  };
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
