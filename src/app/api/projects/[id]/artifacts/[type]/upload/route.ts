export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1]);
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth++ === 0) start = i; }
    else if (text[i] === "}") { if (--depth === 0 && start !== -1) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error("AI did not return valid JSON");
}

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (ext === "pdf") {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
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
      lines.push(`=== Sheet: ${sheetName} ===`);
      const ws = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws);
      lines.push(csv);
    }
    return lines.join("\n");
  }

  if (ext === "pptx") {
    // Extract text from PPTX by parsing XML inside the zip
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const texts: string[] = [];
    for (const [name, zipEntry] of Object.entries(zip.files) as [string, any][]) {
      if (name.match(/ppt\/slides\/slide\d+\.xml/)) {
        const xml: string = await zipEntry.async("string");
        const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [];
        const slideText = matches.map((m: string) => m.replace(/<[^>]+>/g, "")).join(" ");
        texts.push(slideText);
      }
    }
    return texts.join("\n");
  }

  if (ext === "csv") {
    return buffer.toString("utf-8");
  }

  if (ext === "txt") {
    return buffer.toString("utf-8");
  }

  if (ext === "doc") {
    throw new Error("Old .doc format is not supported. Please re-save as .docx and try again.");
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, type } = await params;

  const [project, existingArtifact] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.artifact.findFirst({ where: { projectId: id, artifactType: type } }),
  ]);

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  let extractedText: string;
  try {
    extractedText = await extractFileText(file);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  const existingContent = existingArtifact?.content
    ? JSON.stringify(existingArtifact.content, null, 2)
    : "{}";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are a PMO AI assistant. The user has uploaded a file containing updated artifact data.
Merge the uploaded content into the existing artifact JSON, preserving the existing structure.
The uploaded data takes precedence for fields it contains. Return ONLY valid JSON wrapped in \`\`\`json ... \`\`\` blocks.`,
    messages: [
      {
        role: "user",
        content: `Artifact type: ${type}

Existing artifact JSON:
${existingContent}

Uploaded file content (extracted text):
${extractedText.slice(0, 8000)}

Merge the uploaded data into the artifact JSON and return the updated artifact. Return JSON only.`,
      },
    ],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  const mergedContent = extractJson(responseText);

  let artifact;
  if (existingArtifact) {
    artifact = await prisma.artifact.update({
      where: { id: existingArtifact.id },
      data: { content: mergedContent as object, status: "draft" },
    });
  } else {
    artifact = await prisma.artifact.create({
      data: {
        projectId: id,
        artifactType: type,
        phase: "planning",
        status: "draft",
        content: mergedContent as object,
      },
    });
  }

  return NextResponse.json(artifact);
}
