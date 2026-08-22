export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { resolveModel } from "@/lib/model-router";
import { extractJson } from "@/lib/extract-json";
import { rateLimit } from "@/lib/rate-limit";

// A meeting transcript is text — it does not need the 10 MB the artifact uploader allows.
// Keeping this tight is the first line of defence against decompression bombs, since
// .docx is a ZIP that a crafted file can expand from megabytes to gigabytes of XML.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Hard ceiling on post-extraction text. Bounds everything downstream of the parser and
// rejects obvious bombs. NOTE: this runs after the parser has already allocated, so it
// mitigates rather than eliminates the OOM risk — a streaming parser would be needed
// to remove it entirely.
const MAX_EXTRACTED_CHARS = 2_000_000;

// LLM budget per user. Generous for real use; stops a client looping uploads to burn credits.
const EXTRACT_LIMIT = 10;
const EXTRACT_WINDOW_MS = 10 * 60 * 1000;

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (ext === "pdf") {
    const pdfParse = require("pdf-parse/lib/pdf-parse");
    try {
      const result = await pdfParse(buffer);
      return result.text;
    } catch (pdfErr: any) {
      const msg = pdfErr?.message ?? "";
      if (msg.includes("XRef") || msg.includes("encrypt") || msg.includes("password")) {
        throw new Error("PDF could not be read — it may be password-protected or corrupted. Please export it as a plain PDF or save the transcript as a .txt file.");
      }
      throw new Error(`PDF parsing failed: ${msg}`);
    }
  }
  if (ext === "docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }
  if (ext === "doc") {
    throw new Error("Old .doc format is not supported. Please re-save as .docx.");
  }
  throw new Error(`Unsupported file type: .${ext}. Supported: pdf, docx, txt, md`);
}

/** Parses the file and enforces the post-extraction size ceiling. */
async function extractBoundedText(file: File): Promise<string> {
  const text = await extractFileText(file);
  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new Error(
      "This file expands to far more text than a transcript should contain. Please upload the transcript itself rather than a full document archive."
    );
  }
  return text;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true, name: true } });
  if (!project || project.orgId !== user.orgId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Bill the LLM budget to the user, scoped to this route.
  const limited = rateLimit(`decisions-extract:${user.id}`, EXTRACT_LIMIT, EXTRACT_WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many extractions. Please wait ${Math.ceil(limited.retryAfterSec / 60)} minute(s) and try again.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  let extractedText: string;
  try {
    extractedText = await extractBoundedText(file);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  const truncated = extractedText.slice(0, 12000);

  const systemPrompt = `You are a PMO AI assistant. Extract formal decisions from a meeting transcript or document.

A "decision" is an explicit, actionable choice or agreement made by the group — not a discussion point, action item, or question.

Return JSON with a top-level "decisions" array. Each item must have:
- title: concise statement of what was decided (one clear sentence)
- rationale: brief reason or context (1-2 sentences; empty string if not stated)
- madeBy: name or role of who made or owns the decision (empty string if not mentioned)
- madeAt: ISO date string (YYYY-MM-DD) of when it was decided (use today's date if not mentioned)

Aim for 3-15 decisions. Skip vague statements, action items, and non-decisions.
Return ONLY valid JSON: { "decisions": [...] }`;

  const today = new Date().toISOString().slice(0, 10);
  const userMessage = `Project: ${project.name}
Today's date: ${today}

Transcript / document content:
${truncated}

Extract all decisions from this content. Return JSON only.`;

  try {
    const config = await resolveModel("artifact");
    const message = await anthropic.messages.create({
      model: config.model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";
    let parsed: { decisions: any[] };
    try {
      parsed = extractJson(responseText) as { decisions: any[] };
    } catch {
      return NextResponse.json({ error: "Could not parse decisions from AI response. Please try again." }, { status: 422 });
    }

    const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
    return NextResponse.json({ decisions });
  } catch (err: any) {
    // Provider errors can carry model names, request ids and quota details — log, don't leak.
    console.error("[decisions/extract] AI call failed:", err);
    return NextResponse.json({ error: "Decision extraction failed. Please try again." }, { status: 500 });
  }
}
