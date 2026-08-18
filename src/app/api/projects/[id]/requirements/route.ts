export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { extractPdfText } from "@/lib/pdf";

// Doc class → points toward evidence readiness score
const DOC_CLASS_POINTS: Record<string, number> = {
  sow: 30, brd: 25, srs: 20, estimation: 15, proposal: 10, contract: 10, cr: 5, other: 5,
};

function evidenceBand(score: number): string {
  if (score >= 70) return "strong";
  if (score >= 40) return "adequate";
  if (score >= 20) return "marginal";
  return "insufficient";
}

async function computeAndSaveReadiness(projectId: string) {
  const docs = await prisma.requirementsDocument.findMany({
    where: { projectId, deletedAt: null, ingestionState: "ready" },
    select: { docClass: true },
  });
  // Each class counts once (uploading 3 SOWs doesn't triple-count)
  const seenClasses = new Set(docs.map(d => d.docClass));
  let score = 0;
  for (const cls of seenClasses) score += DOC_CLASS_POINTS[cls] ?? 5;
  score = Math.min(score, 100);
  const band = evidenceBand(score);
  await prisma.project.update({
    where: { id: projectId },
    data: { evidenceReadinessScore: score, evidenceReadinessBand: band },
  });
  return { score, band };
}

// Chunk raw text into ~500-char segments with locator metadata
function chunkText(text: string): Array<{
  chunkIndex: number; pageNumber: number; charStart: number; charEnd: number;
  sectionTitle: string | null; text: string; tokenCount: number;
}> {
  const CHARS_PER_PAGE = 3000;
  const TARGET_CHUNK = 500;

  // Split on paragraph boundaries first
  const paragraphs = text.split(/\n{2,}/);
  const chunks: ReturnType<typeof chunkText> = [];
  let chunkIndex = 0;
  let globalChar = 0;
  let currentText = "";
  let currentStart = 0;
  let currentSection: string | null = null;

  function flush() {
    const t = currentText.trim();
    if (!t) return;
    const charStart = currentStart;
    const charEnd = charStart + t.length;
    chunks.push({
      chunkIndex: chunkIndex++,
      pageNumber: Math.floor(charStart / CHARS_PER_PAGE) + 1,
      charStart,
      charEnd,
      sectionTitle: currentSection,
      text: t,
      tokenCount: Math.ceil(t.length / 4), // rough token estimate
    });
    currentText = "";
  }

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) { globalChar += para.length + 2; continue; }

    // Detect section headings (all-caps lines or lines ending with : under 80 chars)
    if ((trimmed === trimmed.toUpperCase() && trimmed.length < 80 && /[A-Z]/.test(trimmed))
      || (trimmed.endsWith(":") && trimmed.length < 80)) {
      flush();
      currentSection = trimmed;
      globalChar += para.length + 2;
      continue;
    }

    if (currentText.length + trimmed.length > TARGET_CHUNK) flush();

    if (!currentText) currentStart = globalChar;
    currentText += (currentText ? " " : "") + trimmed;
    globalChar += para.length + 2;
  }
  flush();
  return chunks;
}

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (ext === "pdf") {
    return await extractPdfText(buffer);
  }
  if (ext === "docx") {
    try {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      throw new Error(
        "Could not read the DOCX file. Ensure it is a valid Word document (not a .doc renamed to .docx). Try re-saving it from Microsoft Word and uploading again."
      );
    }
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = require("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of wb.SheetNames) {
      lines.push(`=== ${sheetName} ===`);
      lines.push(XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
    }
    return lines.join("\n");
  }
  if (ext === "txt" || ext === "csv") return buffer.toString("utf-8");
  if (ext === "doc") throw new Error("Old .doc format not supported. Re-save as .docx.");
  throw new Error(`Unsupported file type: .${ext}`);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const docClass = (formData.get("docClass") as string | null) ?? "other";
  const effectiveDateRaw = formData.get("effectiveDate") as string | null;
  const effectiveDate = effectiveDateRaw ? new Date(effectiveDateRaw) : null;
  const confidentialityTier = (formData.get("confidentialityTier") as string | null) ?? "standard";

  // Prevent duplicate uploads — reject if this filename is already stored for this project
  const existing = await prisma.requirementsDocument.findFirst({
    where: { projectId: id, fileName: file.name, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `"${file.name}" is already uploaded for this project. Delete the existing document first if you want to replace it.` },
      { status: 409 }
    );
  }

  let rawText: string;
  try {
    rawText = await extractFileText(file);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  // AI extraction — non-fatal if it fails; document is still saved with empty extraction
  let extractedContent: Record<string, unknown> = {};
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `You are a PMO AI assistant. Extract structured project information from requirements documents.
Return ONLY valid JSON in this exact shape:
{
  "projectName": string | null,
  "objectives": string[],
  "inScope": string[],
  "outOfScope": string[],
  "stakeholders": [{ "name": string, "role": string }],
  "constraints": string[],
  "assumptions": string[],
  "acceptanceCriteria": string[],
  "keyRequirements": string[]
}
Extract as much detail as possible. Use null/empty arrays for missing sections.`,
      messages: [{
        role: "user",
        content: `Project: ${project.name}\n\nDocument content:\n${rawText.slice(0, 15000)}`,
      }],
    });
    const responseText = message.content[0].type === "text" ? message.content[0].text : "{}";
    const fenced = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    extractedContent = JSON.parse(fenced ? fenced[1] : responseText);
  } catch {
    // AI extraction failed — continue with empty metadata; document is still stored and chunked
  }

  // Chunk the raw text
  const chunks = chunkText(rawText);

  // Persist document + chunks in a transaction
  let doc;
  try {
    doc = await prisma.$transaction(async (tx) => {
      const created = await tx.requirementsDocument.create({
        data: {
          projectId: id,
          fileName: file.name,
          fileFormat: file.name.split(".").pop()?.toLowerCase() ?? "unknown",
          storageUri: `inline:${id}:${Date.now()}`,
          extractedContent: extractedContent as object,
          extractionConfidence: 0.85,
          pmConfirmed: false,
          uploadedById: user.id,
          docClass,
          effectiveDate,
          confidentialityTier,
          ingestionState: "ready",
          chunkCount: chunks.length,
        },
      });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map(c => ({
            id: `${created.id}-${c.chunkIndex}`,
            documentId: created.id,
            projectId: id,
            ...c,
          })),
        });
      }

      return created;
    });
  } catch (err: any) {
    console.error("[requirements upload] DB transaction failed:", err);
    return NextResponse.json(
      { error: "Failed to save document. Please try again." },
      { status: 500 }
    );
  }

  // Recompute evidence readiness
  const readiness = await computeAndSaveReadiness(id).catch(() => ({ score: 0, band: "insufficient" }));

  return NextResponse.json({ doc, extractedContent, readiness, chunkCount: chunks.length }, { status: 201 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const docs = await prisma.requirementsDocument.findMany({
    where: { projectId: id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(docs);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

  // Deletion is blocked only if this doc's requirements are captured in the current baseline snapshot
  const latestBl = await (prisma as any).scopeBaseline.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
    select: { snapshot: true, label: true },
  }).catch(() => null);

  if (latestBl) {
    const docReqs = await prisma.requirement.findMany({
      where: { projectId: id, sourceDocId: docId },
      select: { requirementKey: true },
    });
    const docReqKeys = new Set(docReqs.map((r: any) => r.requirementKey));
    const snapshot: any[] = latestBl.snapshot ?? [];
    const inBaseline = snapshot.some((r: any) => docReqKeys.has(r.requirementKey));
    if (inBaseline) {
      return NextResponse.json(
        { error: `This document's requirements are locked in baseline "${latestBl.label}". Roll back that baseline before deleting.` },
        { status: 403 }
      );
    }
  }

  const doc = await prisma.requirementsDocument.findFirst({
    where: { id: docId, projectId: id, deletedAt: null },
    select: { id: true },
  });
  if (!doc) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Remove requirements that trace back to this document
  try {
    await prisma.requirement.deleteMany({ where: { projectId: id, sourceDocId: docId } });
  } catch {
    // sourceDocId column may not exist on older deployments — skip
  }

  // Hard-delete DocumentChunk records (soft-deleting the parent doesn't cascade)
  await prisma.documentChunk.deleteMany({ where: { documentId: docId } });

  // Soft-delete the document
  await prisma.requirementsDocument.update({
    where: { id: docId },
    data: { deletedAt: new Date() },
  });

  const readiness = await computeAndSaveReadiness(id).catch(() => ({ score: 0, band: "insufficient" }));
  return NextResponse.json({ ok: true, readiness });
}
