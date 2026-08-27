export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractRequirements, generateProjectFromNL } from "@/lib/ai";

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
      // Primary: pdf-parse (simple wrapper, handles most PDFs).
      // Fallback: pdfjs-dist@3.11.174 legacy build — handles PDFs with long
      // PostScript tokens that trigger "Command token too long" in pdf-parse's
      // bundled pdfjs (e.g. some InDesign-exported or PostScript-converted PDFs).
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse/lib/pdf-parse");
        const result = await pdfParse(buffer);
        text = result.text;
      } catch (pdfParseErr: any) {
        console.warn("[parse-requirements] pdf-parse failed, falling back to pdfjs-dist:", pdfParseErr?.message);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
        const pdfjsDoc = await loadingTask.promise;
        const pages: string[] = [];
        for (let p = 1; p <= pdfjsDoc.numPages; p++) {
          const page = await pdfjsDoc.getPage(p);
          const content = await page.getTextContent();
          pages.push((content.items as any[]).map((it: any) => it.str).join(" "));
        }
        text = pages.join("\n");
      }
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

    // Truncate to 12000 chars for AI processing
    const truncated = text.slice(0, 12000);

    // AI extraction — isolated so a key/timeout failure never blocks the upload.
    // If either call fails we degrade gracefully: the raw text is still returned
    // so the project creation form can proceed without AI-extracted fields.
    let requirements: Record<string, unknown> = {};
    let projectFields: Record<string, unknown> = {};
    try {
      [requirements, projectFields] = await Promise.all([
        extractRequirements(truncated),
        generateProjectFromNL(truncated),
      ]);
    } catch (aiErr: any) {
      console.error("[parse-requirements] AI extraction failed (non-fatal):", aiErr?.message ?? aiErr);
      // Fall through — return raw text without AI fields
    }

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
