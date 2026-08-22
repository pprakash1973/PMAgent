export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { resolveModel } from "@/lib/model-router";
import { extractJson } from "@/lib/extract-json";

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (ext === "pdf") {
    const pdfParse = require("pdf-parse/lib/pdf-parse");
    const result = await pdfParse(buffer);
    return result.text;
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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` },
      { status: 413 }
    );
  }

  let extractedText: string;
  try {
    extractedText = await extractFileText(file);
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
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}
