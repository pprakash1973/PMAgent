export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic, ARTIFACT_SCHEMA_HINTS } from "@/lib/ai";
import { syncArtifactToTables } from "@/lib/artifact-sync";

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
    // pdf-parse v1 (pinned) — pure-JS, serverless-safe
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

  const isFirstUpload = !existingArtifact?.content;
  const existingContent = isFirstUpload
    ? null
    : JSON.stringify(existingArtifact!.content, null, 2);

  const schemaHint = ARTIFACT_SCHEMA_HINTS[type] ?? null;

  const systemPrompt = isFirstUpload
    ? `You are a PMO AI assistant. The user is uploading a ${type.replace(/_/g, " ")} document created in an external tool.
Your job is to extract all information from the uploaded file and structure it as a valid ${type.replace(/_/g, " ")} artifact JSON.

Required JSON structure (use EXACTLY these top-level keys):
${schemaHint ?? "Use standard PMO artifact structure appropriate for " + type.replace(/_/g, " ")}

Rules:
- Extract EVERY piece of information from the uploaded file — do not drop rows, entries, or values.
- Use the exact key names shown above — do not rename or restructure.
- For array fields, produce one object per row/item in the upload.
- Leave fields empty string or empty array rather than omitting them.
Return ONLY the complete artifact as valid JSON wrapped in \`\`\`json ... \`\`\` blocks.`
    : `You are a PMO AI assistant. The user has downloaded an artifact, edited it, and re-uploaded it.
Your job is to merge the uploaded content into the existing artifact JSON while preserving its structure and schema.

Rules:
- The uploaded file is the source of truth: incorporate EVERY change, addition, and edit it contains.
- New items (e.g. added scope items, risks, rows, stakeholders, tasks) MUST be appended to the correct arrays — never dropped.
- Edited values in the upload override the existing values for the same field.
- Keep existing fields that the upload does not mention.
- Preserve the existing JSON shape/keys exactly; do not rename or restructure keys.
Return ONLY the complete merged artifact as valid JSON wrapped in \`\`\`json ... \`\`\` blocks.`;

  const userMessage = isFirstUpload
    ? `Artifact type: ${type}

Uploaded file content (extracted text):
${extractedText.slice(0, 12000)}

Extract all data from the upload and return it as a complete ${type.replace(/_/g, " ")} JSON artifact using the required key structure.`
    : `Artifact type: ${type}

Existing artifact JSON:
${existingContent}

Uploaded file content (extracted text from the user's edited document):
${extractedText.slice(0, 12000)}

Merge the uploaded data into the artifact JSON, making sure every addition and edit from the upload is reflected. Return the complete updated artifact as JSON only.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  if (message.stop_reason === "max_tokens") {
    return NextResponse.json(
      { error: "The merged artifact was too large to process in one pass. Please split the upload or reduce its size and try again." },
      { status: 422 }
    );
  }

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  let mergedContent: Record<string, unknown>;
  try {
    mergedContent = extractJson(responseText);
  } catch {
    return NextResponse.json(
      { error: "Could not parse the merged artifact from the AI response. Please try uploading again." },
      { status: 422 }
    );
  }

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

  // Sync artifact content into live DB tables (RAID tab, Resources tab, milestones)
  await syncArtifactToTables(id, type, mergedContent).catch(() => {});

  return NextResponse.json(artifact);
}
