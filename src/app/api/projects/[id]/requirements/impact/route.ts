export const dynamic = "force-dynamic";
export const maxDuration = 220;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { requireProjectAccess } from "@/lib/project-access";

const DOC_CLASS_LABEL: Record<string, string> = {
  sow: "Statement of Work", brd: "Business Requirements Document",
  srs: "Software Requirements Specification", estimation: "Estimation Sheet",
  proposal: "Proposal", contract: "Contract", cr: "Change Request", other: "Other",
};

function formatExtracted(content: any): string {
  if (!content) return "(no structured content)";
  const parts: string[] = [];
  if (content.objectives?.length)      parts.push(`Objectives:\n${content.objectives.map((o: string) => `  • ${o}`).join("\n")}`);
  if (content.inScope?.length)         parts.push(`In Scope:\n${content.inScope.map((o: string) => `  • ${o}`).join("\n")}`);
  if (content.outOfScope?.length)      parts.push(`Out of Scope:\n${content.outOfScope.map((o: string) => `  • ${o}`).join("\n")}`);
  if (content.keyRequirements?.length) parts.push(`Key Requirements:\n${content.keyRequirements.map((o: string) => `  • ${o}`).join("\n")}`);
  if (content.constraints?.length)     parts.push(`Constraints:\n${content.constraints.map((o: string) => `  • ${o}`).join("\n")}`);
  if (content.assumptions?.length)     parts.push(`Assumptions:\n${content.assumptions.map((o: string) => `  • ${o}`).join("\n")}`);
  if (content.acceptanceCriteria?.length) parts.push(`Acceptance Criteria:\n${content.acceptanceCriteria.map((o: string) => `  • ${o}`).join("\n")}`);
  return parts.join("\n\n") || "(no structured content extracted)";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id } = await params;
  const { documentIds } = await req.json();

  if (!Array.isArray(documentIds) || documentIds.length < 2) {
    return NextResponse.json({ error: "Select at least 2 documents to compare" }, { status: 400 });
  }
  if (documentIds.length > 8) {
    return NextResponse.json({ error: "Maximum 8 documents per analysis" }, { status: 400 });
  }

  const [project, docs, currentSnapshot, confirmedReqs] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true, code: true, description: true } }),
    (prisma.requirementsDocument as any).findMany({
      where: { id: { in: documentIds }, projectId: id, deletedAt: null },
      select: { id: true, fileName: true, docClass: true, createdAt: true, extractedContent: true },
      orderBy: { createdAt: "asc" },
    }),
    // Fetch current PMB snapshot members for baseline context
    (prisma as any).pmbSnapshot.findFirst({
      where: { projectId: id, isCurrent: true },
      select: { label: true, baselinedAt: true, snapshotNumber: true },
    }),
    prisma.requirement.findMany({
      where: { projectId: id, status: "confirmed" },
      select: { requirementKey: true, statement: true, type: true, category: true },
      take: 60,
    }),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (docs.length < 2) return NextResponse.json({ error: "Could not load the selected documents" }, { status: 404 });

  // Build the document corpus
  const docSections = docs.map((doc: any, i: number) => {
    const label = DOC_CLASS_LABEL[doc.docClass] ?? "Document";
    const date = new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `--- Document ${i + 1}: ${label} (${doc.fileName}, uploaded ${date}) ---\n${formatExtracted(doc.extractedContent)}`;
  }).join("\n\n");

  const baselineContext = currentSnapshot
    ? `\nThe project has an active Performance Measurement Baseline (PMB Snapshot #${currentSnapshot.snapshotNumber}: "${currentSnapshot.label}", established ${new Date(currentSnapshot.baselinedAt).toLocaleDateString()}).`
    : "\nNo formal PMB baseline has been established yet for this project.";

  const confirmedReqsContext = confirmedReqs.length > 0
    ? `\nPM-confirmed requirements (${confirmedReqs.length} total):\n${confirmedReqs.slice(0, 40).map(r => `  [${r.requirementKey}] (${r.type}) ${r.statement}`).join("\n")}`
    : "\nNo requirements have been confirmed by the PM yet.";

  const systemPrompt = `You are a senior PMO Scope Control Advisor reviewing project documents to identify scope impacts.
Project: ${project.name} (${project.code ?? ""})${baselineContext}
${confirmedReqsContext}

Your job is to compare the provided documents and deliver a structured impact analysis to the Project Manager. Be specific, concise, and actionable. Use bullet points. Format your response with these sections:

## 📋 Executive Summary
2–3 sentences on the overall scope change picture.

## ➕ New / Added Scope
Items present in later documents but absent or not mentioned in earlier ones.

## ➖ Removed / Reduced Scope
Items in earlier documents that have been removed, reduced, or de-prioritised.

## 🔄 Modified Requirements
Requirements that appear in multiple documents but with changed wording, priority, or acceptance criteria.

## ⚠️ Risk & Impact Assessment
Schedule, cost, and delivery risks introduced by these changes. Reference the PMB baseline where relevant.

## ✅ Recommended Actions for the PM
Concrete next steps: raise a change request, update the WBS, flag to stakeholders, etc.

If the documents appear to be versions of the same document type, treat the earliest as the baseline and the latest as the current version. If they are different document types (e.g. SoW vs CR), identify what the CR adds, removes, or modifies relative to the SoW.`;

  const userPrompt = `Analyse the following ${docs.length} documents for scope impact:\n\n${docSections}`;

  // Stream SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ chunk: event.delta.text });
          }
        }
        send({ done: true });
      } catch (err: any) {
        send({ error: err.message ?? "Analysis failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
