export const dynamic = "force-dynamic";
export const maxDuration = 220;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { requireProjectAccess } from "@/lib/project-access";
import { resolveModel } from "@/lib/model-router";

interface ExtractedRequirement {
  requirementKey: string;
  statement: string;
  type: "functional" | "non-functional" | "constraint" | "assumption";
  category: string;
  confidence: number;
  sourceQuote: string;
}

/**
 * Parse the AI's JSON response, with graceful fallback for truncated output.
 * When max_tokens is reached mid-response the JSON array is incomplete;
 * instead of throwing, we salvage every complete requirement object already emitted.
 */
function parseRequirementsJson(raw: string): ExtractedRequirement[] {
  // Strip fenced code block if present
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : raw;

  // 1. Happy path — well-formed JSON
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed?.requirements)) return parsed.requirements;
  } catch {
    // fall through to salvage path
  }

  // 2. Salvage path — truncated JSON (hit max_tokens mid-array).
  //    Extract every complete { ... } object whose "statement" field is non-empty.
  const salvaged: ExtractedRequirement[] = [];
  const objRegex = /\{[^{}]*"statement"\s*:\s*"[^"]{3,}"[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(candidate)) !== null) {
    try {
      const obj = JSON.parse(m[0]) as Partial<ExtractedRequirement>;
      if (obj.statement) salvaged.push(obj as ExtractedRequirement);
    } catch {
      // skip malformed object
    }
  }
  if (salvaged.length > 0) {
    console.warn(`[extract] JSON was truncated; salvaged ${salvaged.length} complete requirements`);
    return salvaged;
  }

  // 3. Nothing salvageable — return empty (caller will get extracted:0, no error)
  console.warn("[extract] Could not parse any requirements from AI response");
  return [];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id } = await params;

  // Pagination params — client sends chunkOffset to resume from where it left off
  const body = await req.json().catch(() => ({}));
  const chunkOffset = Math.max(0, Number(body.chunkOffset) || 0);
  const batchLimit = Math.min(20, Math.max(1, Number(body.batchLimit) || 10));

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Fetch one batch of chunks starting at chunkOffset.
  // Fetch BATCH_CHUNK_FETCH+1 so we know if there are more beyond this batch.
  const BATCH_CHAR_LIMIT = 20_000;
  const BATCH_CHUNK_FETCH = 80;
  const rawChunks = await prisma.documentChunk.findMany({
    where: { projectId: id },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    skip: chunkOffset,
    take: BATCH_CHUNK_FETCH + 1,
    select: { id: true, text: true, sectionTitle: true, pageNumber: true },
  });

  const hasMoreBeyondFetch = rawChunks.length > BATCH_CHUNK_FETCH;
  const batchChunks = hasMoreBeyondFetch ? rawChunks.slice(0, BATCH_CHUNK_FETCH) : rawChunks;

  // Build corpus for this batch, stopping at char limit
  let corpus = "";
  let chunksConsumed = 0;
  let hasMore = false;

  if (batchChunks.length > 0) {
    for (const chunk of batchChunks) {
      const prefix = chunk.sectionTitle ? `[${chunk.sectionTitle}] ` : "";
      const candidate = `${prefix}${chunk.text}\n`;
      if (corpus.length + candidate.length > BATCH_CHAR_LIMIT) {
        hasMore = true; // stopped early — more chunks remain in this fetch
        break;
      }
      corpus += candidate;
      chunksConsumed++;
    }
    if (!hasMore && hasMoreBeyondFetch) hasMore = true;
  } else {
    // Docs uploaded during project creation are stored without chunks — fall back to
    // the raw text saved in extractedContent.rawText on the RequirementsDocument record.
    // No pagination for legacy docs — extract all in one shot.
    const legacyDocs = await prisma.requirementsDocument.findMany({
      where: { projectId: id, deletedAt: null },
      select: { extractedContent: true, fileName: true },
      orderBy: { createdAt: "asc" },
    });
    for (const doc of legacyDocs) {
      const raw = (doc.extractedContent as any)?.rawText as string | undefined;
      if (raw) {
        corpus += `\n=== ${doc.fileName} ===\n${raw.slice(0, 30000)}\n`;
        if (corpus.length > 60_000) break;
      }
    }
    if (!corpus.trim()) {
      return NextResponse.json({ error: "No document content found. Upload source documents first." }, { status: 400 });
    }
  }

  const nextChunkOffset = chunkOffset + chunksConsumed;

  // Resolve model via router — defaults to Haiku for speed but allows DB override
  const { model: extractModel, maxTokens: extractMaxTokens } = await resolveModel("extraction");

  let extracted: ExtractedRequirement[] = [];
  try {
    // Router defaults to Haiku (~10× faster than Sonnet), keeping well within
    // the 220s maxDuration even for large corpora (60k chars).
    // 170s SDK timeout as a safety net for the DB work that follows.
    const message = await anthropic.messages.create(
      {
        model: extractModel,
        max_tokens: Math.min(extractMaxTokens, 16000),
        system: `You are a senior business analyst. Extract up to ${batchLimit} discrete requirements from the source document corpus provided.
A "requirement" is any statement that specifies:
- A functional need (what the system/project must do)
- A non-functional need (performance, security, compliance)
- A constraint (budget ceiling, deadline, regulatory rule, technology restriction)
- An explicit assumption

Rules:
- Only extract statements clearly present in the text — never infer or fabricate
- Each requirement must have a verbatim sourceQuote (exact text from the document proving it)
- Assign confidence: 1.0 = verbatim, 0.8 = paraphrased but clear, 0.6 = implied
- Return at most ${batchLimit} requirements — prioritise the most specific and actionable
- Return JSON only

Return JSON: { "requirements": [ { "requirementKey": "REQ-001", "statement": "...", "type": "functional|non-functional|constraint|assumption", "category": "scope|budget|timeline|quality|security|compliance|technical|resource|other", "confidence": 0.0-1.0, "sourceQuote": "exact verbatim text from source" } ] }`,
        messages: [{
          role: "user",
          content: `Project: ${project.name}\n\nSource corpus (document section ${chunkOffset === 0 ? "start" : `from chunk ${chunkOffset}`}):\n${corpus}\n\nExtract up to ${batchLimit} requirements. Return JSON only.`,
        }],
      },
      { timeout: 170_000 }
    );

    const text = message.content[0].type === "text" ? message.content[0].text : "{}";
    extracted = parseRequirementsJson(text);
  } catch (err: any) {
    console.error("[extract] AI call failed:", err?.message ?? err);
    return NextResponse.json(
      { error: `Requirement extraction failed: ${err?.message ?? "AI did not respond in time"}` },
      { status: 500 }
    );
  }

  // Find chunk IDs that best match each sourceQuote
  const chunkTextMap = batchChunks.map(c => ({ id: c.id, text: c.text.toLowerCase() }));

  function findChunkId(quote: string): string | null {
    const q = quote.toLowerCase().slice(0, 80);
    for (const c of chunkTextMap) {
      if (c.text.includes(q)) return c.id;
    }
    return null;
  }

  // Get highest existing REQ number to avoid collisions
  const existingReqs = await prisma.requirement.findMany({
    where: { projectId: id },
    select: { requirementKey: true },
  });
  const maxExisting = existingReqs.reduce((m, r) => {
    const n = parseInt(r.requirementKey.replace("REQ-", ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);

  // Upsert requirements
  let created = 0;
  for (let i = 0; i < extracted.length; i++) {
    const req = extracted[i];
    const key = `REQ-${String(maxExisting + i + 1).padStart(3, "0")}`;
    const sourceChunkId = req.sourceQuote ? findChunkId(req.sourceQuote) : null;
    await prisma.requirement.upsert({
      where: { projectId_requirementKey: { projectId: id, requirementKey: key } },
      create: {
        id: `${id}-${key}`,
        projectId: id,
        requirementKey: key,
        statement: req.statement,
        type: req.type ?? "functional",
        category: req.category ?? "other",
        source: "extracted",
        status: "proposed",
        confidence: req.confidence ?? 0.8,
        sourceChunkId: sourceChunkId ?? undefined,
        sourceQuote: req.sourceQuote?.slice(0, 500),
      },
      update: {
        statement: req.statement,
        confidence: req.confidence ?? 0.8,
        sourceChunkId: sourceChunkId ?? undefined,
        sourceQuote: req.sourceQuote?.slice(0, 500),
      },
    });
    created++;
  }

  return NextResponse.json({
    extracted: created,
    requirements: extracted,
    nextChunkOffset,
    hasMore,
  });
}
