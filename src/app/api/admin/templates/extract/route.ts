export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

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
  if (ext === "txt" || ext === "md") return buffer.toString("utf-8");
  if (ext === "doc") throw new Error("Old .doc format not supported — re-save as .docx.");
  throw new Error(`Unsupported file type: .${ext}. Use PDF, DOCX, or TXT.`);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large — max 5 MB" }, { status: 413 });
  }

  let text: string;
  try {
    text = await extractFileText(file);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  const trimmed = text.trim().slice(0, 8000);
  return NextResponse.json({ text: trimmed, chars: trimmed.length });
}
