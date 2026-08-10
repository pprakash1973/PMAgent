export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractRequirements, generateProjectFromNL } from "@/lib/ai";

// ─── Text cleaning ────────────────────────────────────────────────────────────

/**
 * Strip repeated per-page noise (headers, footers, page numbers) from raw PDF text.
 * pdfjs joins all text items on a page with spaces and separates pages with \n.
 * Phrases that appear on 3+ pages are almost certainly headers/footers — remove them.
 */
function cleanDocumentText(raw: string): string {
  // Split into page-level segments (each \n is a page boundary from pdfjs)
  const pages = raw.split("\n");

  // Build frequency map of significant substrings per page
  const freq = new Map<string, number>();
  for (const page of pages) {
    // Slide a window over the page looking for candidate repeated phrases (20–120 chars)
    const words = page.split(/\s+/);
    for (let start = 0; start < words.length; start++) {
      for (let len = 4; len <= Math.min(16, words.length - start); len++) {
        const phrase = words.slice(start, start + len).join(" ");
        if (phrase.length >= 20 && phrase.length <= 120) {
          freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
        }
      }
    }
  }

  // Phrases found on 3+ pages are header/footer noise
  const noiseSet = new Set(
    [...freq.entries()].filter(([, n]) => n >= 3).map(([p]) => p)
  );

  // Build a combined regex that removes all noise phrases
  if (noiseSet.size > 0) {
    const escapedPhrases = [...noiseSet].map((p) =>
      p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const noiseRe = new RegExp(`(${escapedPhrases.join("|")})`, "gi");
    raw = raw.replace(noiseRe, " ");
  }

  // Also strip common PDF boilerplate patterns regardless of frequency
  raw = raw
    .replace(/\bPage\s+\d+\s+(of\s+\d+)?\b/gi, " ")
    .replace(/©\s*\d{4}[^\n]{0,80}/g, " ")
    .replace(/confidential\s+and\s+proprietary[^\n]{0,100}/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return raw;
}

// ─── Regex requirement extraction ─────────────────────────────────────────────

/**
 * Directly extract explicitly numbered requirements (REQ-001, FR-001, etc.) from text.
 * This is completely token-budget-free and works on documents of any size.
 * Returns [] when the document has no numbered requirement IDs (falls back to AI).
 */
function extractNumberedRequirements(text: string): string[] {
  // Pattern: 2-5 uppercase letters, dash, 3+ digits (REQ-001, FR-001, NFR-010, UC-002 …)
  const idPattern = /\b([A-Z]{2,5}-\d{3,})\b/g;
  const matches = [...text.matchAll(idPattern)];

  // Need at least 3 matches to treat this as a structured requirements document
  if (matches.length < 3) return [];

  const results: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const reqId = matches[i][1];
    const afterId = matches[i].index! + reqId.length;
    // Grab text up to the next requirement ID (or 600 chars, whichever comes first)
    const nextIdIdx = i + 1 < matches.length ? matches[i + 1].index! : afterId + 600;
    const endIdx = Math.min(nextIdIdx, afterId + 600);

    let content = text.slice(afterId, endIdx).trim();

    // Strip MoSCoW priority word that often appears as the first token (table column)
    content = content.replace(
      /^\s*(Must Have|Should Have|Could Have|Won't Have|Must|Should|Could|Won't)\s+/i,
      ""
    );

    // Strip table-header noise that can appear mid-document
    content = content.replace(
      /\b(Req(uirement)?\s+ID|Priority|Acceptance\s+Criteria|Requirement\s+Statement)\b/gi,
      " "
    );

    content = content.replace(/\s+/g, " ").trim();
    if (content.length > 500) content = content.slice(0, 500).trim();

    if (content.length > 20) {
      results.push(`${reqId}: ${content}`);
    }
  }
  return results;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: { code: "NO_FILE", message: "No file uploaded" } }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    // .doc (old binary Word) is NOT supported by mammoth — only .docx is
    if (ext === "doc") {
      return NextResponse.json(
        { error: { code: "UNSUPPORTED_FORMAT", message: "Old .doc format is not supported. Please save your file as .docx (Word 2007 or later) and try again." } },
        { status: 400 }
      );
    }

    const supported = ["pdf", "docx", "txt", "md"];
    if (!supported.includes(ext)) {
      return NextResponse.json(
        { error: { code: "UNSUPPORTED_FORMAT", message: `Unsupported file type .${ext}. Supported formats: PDF, DOCX, TXT.` } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (ext === "pdf") {
      // Use pdfjs-dist 3.x legacy build — pdfjs v2 (bundled with pdf-parse) hard-fails
      // on many real-world PDFs with "Command token too long: 128".
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
      pdfjs.GlobalWorkerOptions.workerSrc = "";
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const pdfDoc = await loadingTask.promise;
      const pages: string[] = [];
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent();
        // Preserve line breaks by checking vertical position changes between items
        const items: any[] = content.items;
        let pageText = "";
        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          const prev = items[j - 1];
          if (prev && Math.abs(item.transform[5] - prev.transform[5]) > 5) {
            // Significant y-gap → new line
            pageText += "\n";
          } else if (j > 0) {
            pageText += " ";
          }
          pageText += item.str;
        }
        pages.push(pageText);
      }
      text = pages.join("\n");
    } else if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      if (result.messages?.some((m: any) => m.type === "error")) {
        console.warn("mammoth warnings:", result.messages);
      }
      text = result.value;
    } else {
      // txt / md — plain UTF-8
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: { code: "EMPTY_FILE", message: "Could not extract any text from the file. Make sure the document contains readable text (not just images or scans)." } },
        { status: 400 }
      );
    }

    // Clean repeated header/footer noise from the raw extracted text
    const cleanedText = cleanDocumentText(text);

    // ── Regex-first extraction for explicitly numbered requirements ──────────
    // This is token-budget-free and works regardless of document size/pages.
    // Falls back to AI scopeItems extraction for unstructured documents.
    const numberedReqs = extractNumberedRequirements(cleanedText);
    const hasNumberedReqs = numberedReqs.length >= 3;

    // AI extraction: for structured docs we only need metadata (goals, stakeholders,
    // constraints, etc.) — scopeItems is already covered by regex above.
    // Cap at 100k chars for the AI call.
    const truncated = cleanedText.slice(0, 100_000);

    const [aiExtracted, projectFields] = await Promise.all([
      extractRequirements(truncated),
      generateProjectFromNL(truncated),
    ]);

    // Merge: regex requirements take priority over AI's scopeItems
    const requirements = hasNumberedReqs
      ? { ...aiExtracted, scopeItems: numberedReqs }
      : aiExtracted;

    return NextResponse.json({
      fileName: file.name,
      fileFormat: ext,
      extractedText: truncated,
      requirements,
      projectFields,
    });
  } catch (err: any) {
    console.error("parse-requirements error:", err);
    const msg = err?.message || "Failed to parse file";
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: `Parse error: ${msg}` } },
      { status: 500 }
    );
  }
}
