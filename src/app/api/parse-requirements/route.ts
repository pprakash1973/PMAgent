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
      // pdf-parse v2 — class-based API: new PDFParse({ data }).getText()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text;
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

    // Run both extractions in parallel
    const [requirements, projectFields] = await Promise.all([
      extractRequirements(truncated),
      generateProjectFromNL(truncated),
    ]);

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
