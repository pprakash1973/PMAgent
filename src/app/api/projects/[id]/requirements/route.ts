export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";

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

  let rawText: string;
  try {
    rawText = await extractFileText(file);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  // AI extraction
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
  let extractedContent: Record<string, unknown> = {};
  try {
    const fenced = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    extractedContent = JSON.parse(fenced ? fenced[1] : responseText);
  } catch {
    // save with empty extraction, still store the doc
  }

  const doc = await prisma.requirementsDocument.create({
    data: {
      projectId: id,
      fileName: file.name,
      fileFormat: file.name.split(".").pop()?.toLowerCase() ?? "unknown",
      storageUri: `inline:${id}:${Date.now()}`,
      extractedContent: extractedContent as object,
      extractionConfidence: 0.85,
      pmConfirmed: false,
      uploadedById: user.id,
    },
  });

  return NextResponse.json({ doc, extractedContent }, { status: 201 });
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
