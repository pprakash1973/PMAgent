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
    const supported = ["pdf", "doc", "docx", "txt", "md"];
    if (!supported.includes(ext)) {
      return NextResponse.json(
        { error: { code: "UNSUPPORTED_FORMAT", message: `Unsupported file type .${ext}. Use PDF, DOCX, DOC, or TXT.` } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (ext === "docx" || ext === "doc") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      // txt / md
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json({ error: { code: "EMPTY_FILE", message: "Could not extract any text from the file." } }, { status: 400 });
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
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: err.message || "Failed to parse file" } }, { status: 500 });
  }
}
