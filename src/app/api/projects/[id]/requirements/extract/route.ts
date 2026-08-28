export const dynamic = "force-dynamic";
export const maxDuration = 220;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { requireProjectAccess } from "@/lib/project-access";

interface ExtractedRequirement {
  requirementKey: string;
  statement: string;
  type: "functional" | "non-functional" | "constraint" | "assumption";
  category: string;
  confidence: number;
  sourceQuote: string;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Pull chunks for this project — enough to cover a large BRD end-to-end.
  // claude-sonnet-4-6 has a 200k context window so we can send substantially
  // more text than the old 12k limit (which only covered the intro/TOC section).
  const CORPUS_CHAR_LIMIT = 60_000;
  const chunks = await prisma.documentChunk.findMany({
    where: { projectId: id },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: 500,
    select: { id: true, text: true, sectionTitle: true, pageNumber: true },
  });

  // Build corpus — spread across the document rather than just the first N chars.
  let corpus = "";

  if (chunks.length > 0) {
    for (const chunk of chunks) {
      const prefix = chunk.sectionTitle ? `[${chunk.sectionTitle}] ` : "";
      const candidate = `${prefix}${chunk.text}\n`;
      if (corpus.length + candidate.length > CORPUS_CHAR_LIMIT) break;
      corpus += candidate;
    }
  } else {
    // Docs uploaded during project creation are stored without chunks — fall back to
    // the raw text saved in extractedContent.rawText on the RequirementsDocument record.
    const legacyDocs = await prisma.requirementsDocument.findMany({
      where: { projectId: id, deletedAt: null },
      select: { extractedContent: true, fileName: true },
      orderBy: { createdAt: "asc" },
    });
    for (const doc of legacyDocs) {
      const raw = (doc.extractedContent as any)?.rawText as string | undefined;
      if (raw) {
        corpus += `\n=== ${doc.fileName} ===\n${raw.slice(0, 30000)}\n`;
        if (corpus.length > CORPUS_CHAR_LIMIT) break;
      }
    }
    if (!corpus.trim()) {
      return NextResponse.json({ error: "No document content found. Upload source documents first." }, { status: 400 });
    }
  }

  let extracted: ExtractedRequirement[] = [];
  try {
    // Haiku: ~10× faster than Sonnet for structured extraction — keeps well within
    // the 220s maxDuration even for large corpora (60k chars).
    // 170s SDK timeout as a safety net for the DB work that follows.
    const message = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        system: `You are a senior business analyst. Extract ALL discrete requirements from the source document corpus provided.
A "requirement" is any statement that specifies:
- A functional need (what the system/project must do)
- A non-functional need (performance, security, compliance)
- A constraint (budget ceiling, deadline, regulatory rule, technology restriction)
- An explicit assumption

Rules:
- Only extract statements clearly present in the text — never infer or fabricate
- Each requirement must have a verbatim sourceQuote (exact text from the document proving it)
- Assign confidence: 1.0 = verbatim, 0.8 = paraphrased but clear, 0.6 = implied
- Return JSON only

Return JSON: { "requirements": [ { "requirementKey": "REQ-001", "statement": "...", "type": "functional|non-functional|constraint|assumption", "category": "scope|budget|timeline|quality|security|compliance|technical|resource|other", "confidence": 0.0-1.0, "sourceQuote": "exact verbatim text from source" } ] }`,
        messages: [{
          role: "user",
          content: `Project: ${project.name}\n\nSource corpus:\n${corpus}\n\nExtract all requirements. Return JSON only.`,
        }],
      },
      { timeout: 170_000 }
    );

    const text = message.content[0].type === "text" ? message.content[0].text : "{}";
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
    const candidate = fenced ? fenced[1] : (text.match(/\{[\s\S]*\}/) ?? [text])[0];
    const parsed = JSON.parse(candidate);
    extracted = parsed.requirements ?? [];
  } catch (err: any) {
    console.error("[extract] AI call failed:", err?.message ?? err);
    return NextResponse.json(
      { error: `Requirement extraction failed: ${err?.message ?? "AI did not respond in time"}` },
      { status: 500 }
    );
  }

  // Find chunk IDs that best match each sourceQuote
  const chunkTextMap = chunks.map(c => ({ id: c.id, text: c.text.toLowerCase() }));

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

  return NextResponse.json({ extracted: created, requirements: extracted });
}
