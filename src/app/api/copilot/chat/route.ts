export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";

const TAB_QUICK_ACTIONS: Record<string, string[]> = {
  schedule:   ["What tasks are at risk this week?", "Close all completed tasks", "Update task progress"],
  artifacts:  ["Explain this artifact", "Regenerate the Initiation Deck", "Regenerate the Weekly Status Report"],
  risks:      ["Summarize risk exposure", "Log a new risk", "Mark top risk as mitigated"],
  costs:      ["Where am I trending over budget?", "What's my current CPI?", "Summarize cost performance"],
  status:     ["Regenerate the Weekly Status Report", "What needs my attention this week?", "Summarize project health"],
  resources:  ["Who is over-allocated?", "Summarize team capacity", "Which resources are unassigned?"],
  default:    ["Summarize project status", "What needs my attention?", "Close all done tasks"],
};

// ── Intent detection ──────────────────────────────────────────────────────────

type Intent =
  | { type: "LOG_RISK"; tier: "b"; params: { description: string; category?: string; probability?: string; impact?: string; owner?: string } }
  | { type: "LOG_ISSUE"; tier: "b"; params: { title: string; description?: string; priority?: string; owner?: string } }
  | { type: "REGEN_ARTIFACT"; tier: "c"; params: { artifactType: string; label: string } }
  | { type: "EXPLAIN_ARTIFACT"; tier: "a"; params: { artifactType?: string } }
  | { type: "CLOSE_TASK"; tier: "b"; params: { ref: string } }
  | { type: "UPDATE_TASK_PROGRESS"; tier: "b"; params: { ref: string; percent: number } }
  | { type: "CLOSE_RISK"; tier: "b"; params: { ref: string } }
  | { type: "CLOSE_ISSUE"; tier: "b"; params: { ref: string } }
  | { type: "CLOSE_MILESTONE"; tier: "b"; params: { ref: string } }
  | { type: "BULK_CLOSE_TASKS"; tier: "c"; params: { filter: string } }
  | { type: "UPDATE_PROJECT_STATUS"; tier: "c"; params: { healthStatus: string } }
  | null;

function detectIntent(message: string): Intent {
  const msg = message.toLowerCase();

  // Artifact regeneration — Tier C (catalog-driven, covers all artifact types)
  if (/regen|regenerate|generate|update|rewrite|create|refresh|make|produce|build/.test(msg)) {
    const ALIASES: Record<string, string> = {
      "initiation deck": "initiation_deck",
      "project initiation": "initiation_deck",
      "charter deck": "initiation_deck",
      "ewsr": "weekly_status",
      "wsr": "weekly_status",
      "weekly status": "weekly_status",
      "status report": "weekly_status",
      "wbs": "wbs",
      "work breakdown": "wbs",
      "evm": "evm_analysis",
      "earned value": "evm_analysis",
      "raci": "raci_matrix",
      "raid": "raid_register",
    };
    for (const [alias, artifactType] of Object.entries(ALIASES)) {
      if (msg.includes(alias)) {
        const entry = ARTIFACT_CATALOG.find((a) => a.type === artifactType);
        if (entry) return { type: "REGEN_ARTIFACT", tier: "c", params: { artifactType: entry.type, label: entry.label } };
      }
    }
    for (const entry of ARTIFACT_CATALOG) {
      const normalized = entry.label.toLowerCase().replace(/_/g, " ");
      if (msg.includes(normalized) || msg.includes(entry.type.replace(/_/g, " "))) {
        return { type: "REGEN_ARTIFACT", tier: "c", params: { artifactType: entry.type, label: entry.label } };
      }
    }
  }

  // Bulk close tasks — Tier C (must check before single-task close)
  if (/close\s+all|complete\s+all|mark\s+all/.test(msg) && /task/.test(msg))
    return { type: "BULK_CLOSE_TASKS", tier: "c", params: { filter: message } };

  // Close / complete a specific task — Tier B
  if (/close\s+(the\s+)?task|complete\s+(the\s+)?task|mark\s+(the\s+)?.+\s+(task|as\s+(done|complete|finished))|finish\s+(the\s+)?task/.test(msg))
    return { type: "CLOSE_TASK", tier: "b", params: { ref: message } };

  // Update task progress — Tier B
  const progressMatch = msg.match(/(?:set|update|mark)\s+.{0,40}(?:to|at)\s+(\d{1,3})\s*%/);
  if (progressMatch && /task|progress|percent|complete/.test(msg))
    return { type: "UPDATE_TASK_PROGRESS", tier: "b", params: { ref: message, percent: parseInt(progressMatch[1], 10) } };

  // Close / mitigate a risk — Tier B
  if (/close\s+(the\s+)?risk|mitigat|resolve\s+(the\s+)?risk|mark\s+.{0,30}risk\s+as\s+(closed|mitigated|resolved)/.test(msg))
    return { type: "CLOSE_RISK", tier: "b", params: { ref: message } };

  // Close an issue — Tier B
  if (/close\s+(the\s+)?issue|resolve\s+(the\s+)?issue|mark\s+.{0,30}issue\s+as\s+(closed|resolved|done)/.test(msg))
    return { type: "CLOSE_ISSUE", tier: "b", params: { ref: message } };

  // Complete a milestone — Tier B
  if (/complete\s+(the\s+)?milestone|close\s+(the\s+)?milestone|mark\s+.{0,30}milestone\s+as\s+(complete|done|achieved)/.test(msg))
    return { type: "CLOSE_MILESTONE", tier: "b", params: { ref: message } };

  // Update project health status — Tier C
  if (/set\s+(project\s+)?(health|status)\s+to\s+(red|amber|green)|mark\s+project\s+as\s+(red|amber|green|at.risk|on.track|off.track)/.test(msg)) {
    const hs = /red|off.track/.test(msg) ? "RED" : /amber|at.risk/.test(msg) ? "AMBER" : "GREEN";
    return { type: "UPDATE_PROJECT_STATUS", tier: "c", params: { healthStatus: hs } };
  }

  // Log risk — Tier B
  if (/log.{0,15}risk|add.{0,15}risk|new.{0,15}risk|risk.{0,15}log/.test(msg))
    return { type: "LOG_RISK", tier: "b", params: { description: message } };

  // Log issue — Tier B
  if (/log.{0,15}issue|add.{0,15}issue|new.{0,15}issue|issue.{0,15}log/.test(msg))
    return { type: "LOG_ISSUE", tier: "b", params: { title: message } };

  // Explain artifact — Tier A
  if (/explain|what is|why.{0,10}need|what does|tell me about/.test(msg) && /artifact|charter|wbs|risk|schedule|budget|raci|ewsr|report/.test(msg))
    return { type: "EXPLAIN_ARTIFACT", tier: "a", params: {} };

  return null;
}

async function extractRiskParams(message: string, anthropicClient: typeof anthropic) {
  const res = await anthropicClient.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `Extract risk details from this PM request as JSON only (no markdown):
{"description":"...","category":"Technical|Schedule|Cost|Resource|External","probability":"low|medium|high","impact":"low|medium|high","owner":"name or empty string"}

Request: "${message}"`,
    }],
  });
  try {
    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    return JSON.parse(text.replace(/```json?|```/g, "").trim());
  } catch { return { description: message, category: "Technical", probability: "medium", impact: "medium", owner: "" }; }
}

async function extractIssueParams(message: string, anthropicClient: typeof anthropic) {
  const res = await anthropicClient.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `Extract issue details from this PM request as JSON only (no markdown):
{"title":"...","description":"...","priority":"low|medium|high|critical","owner":"name or empty string"}

Request: "${message}"`,
    }],
  });
  try {
    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    return JSON.parse(text.replace(/```json?|```/g, "").trim());
  } catch { return { title: message, description: "", priority: "medium", owner: "" }; }
}

async function extractEntityRef(message: string, entityType: "task" | "risk" | "issue" | "milestone", anthropicClient: typeof anthropic): Promise<{ name?: string; id?: string }> {
  const res = await anthropicClient.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    messages: [{
      role: "user",
      content: `Extract the ${entityType} name or ID being referenced in this PM request as JSON only (no markdown):
{"name":"the ${entityType} name or empty string","id":"R-001 or T-001 style ID if mentioned, else empty string"}

Request: "${message}"`,
    }],
  });
  try {
    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    return JSON.parse(text.replace(/```json?|```/g, "").trim());
  } catch { return { name: "", id: "" }; }
}

// ── Document tools ────────────────────────────────────────────────────────────

const DOCUMENT_TOOLS = [
  {
    name: "list_project_documents",
    description: "Lists all documents available for this project: AI-generated artifacts (Change Log, Risk Register, WBS, etc.) and uploaded source documents (RFPs, change logs, contracts, etc.). Call this first to discover what is available before calling read_document.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_document",
    description: "Reads the full content of a specific project document by its ID. Use list_project_documents first to get IDs. Returns structured content for artifacts or extracted text for uploaded documents.",
    input_schema: {
      type: "object",
      properties: {
        document_id: { type: "string", description: "The ID of the document to read (from list_project_documents output)" },
      },
      required: ["document_id"],
    },
  },
];

async function executeProjectTool(toolName: string, toolInput: any, projectId: string): Promise<any> {
  if (toolName === "list_project_documents") {
    const [artifacts, reqDocs, requirements] = await Promise.all([
      prisma.artifact.findMany({
        where: { projectId },
        select: { id: true, artifactType: true, status: true, createdAt: true },
      }),
      (prisma as any).requirementsDocument.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, fileName: true, fileFormat: true, docClass: true, createdAt: true, ingestionState: true },
      }),
      prisma.requirement.findMany({
        where: { projectId, status: { not: "rejected" } },
        select: { requirementKey: true, statement: true, type: true, category: true, status: true },
        take: 100,
      }),
    ]);
    return {
      generated_artifacts: artifacts.map((a: any) => ({ id: a.id, type: a.artifactType, status: a.status })),
      uploaded_documents: reqDocs.map((d: any) => ({
        id: d.id, name: d.fileName, format: d.fileFormat, class: d.docClass, ready: d.ingestionState === "ready",
      })),
      extracted_requirements: requirements.map((r: any) => ({
        key: r.requirementKey, statement: r.statement, type: r.type, category: r.category, status: r.status,
      })),
    };
  }

  if (toolName === "read_document") {
    const { document_id } = toolInput as { document_id: string };

    // Try generated artifact first
    const artifact = await prisma.artifact.findFirst({ where: { id: document_id, projectId } });
    if (artifact) {
      const raw = artifact.content;
      const text = raw ? JSON.stringify(raw, null, 2).slice(0, 12000) : "No content generated yet";
      return { type: "artifact", artifactType: artifact.artifactType, content: text };
    }

    // Try uploaded requirements document — query chunks directly (correct field is `text`, not `content`)
    const reqDoc = await (prisma as any).requirementsDocument.findFirst({
      where: { id: document_id, projectId, deletedAt: null },
    });
    if (reqDoc) {
      const dbChunks = await prisma.documentChunk.findMany({
        where: { documentId: document_id },
        orderBy: [{ chunkIndex: "asc" } as any],
        take: 60,
        select: { text: true, sectionTitle: true } as any,
      });

      let text: string;
      if ((dbChunks as any[]).length > 0) {
        text = (dbChunks as any[])
          .map((c: any) => c.sectionTitle ? `[${c.sectionTitle}]\n${c.text}` : c.text)
          .join("\n\n")
          .slice(0, 12000);
      } else if (reqDoc.extractedContent && Object.keys(reqDoc.extractedContent).length > 0) {
        // Fall back to structured extraction (useful when chunks not yet created)
        text = JSON.stringify(reqDoc.extractedContent, null, 2).slice(0, 10000);
      } else {
        text = "Document content is not available. The file may still be processing.";
      }
      return {
        type: "uploaded_document",
        fileName: reqDoc.fileName,
        format: reqDoc.fileFormat,
        docClass: reqDoc.docClass,
        content: text,
      };
    }

    return { error: `Document ${document_id} not found in project ${projectId}` };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(assistantName: string, tab: string, project: any, kpiSnapshot: any) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are ${assistantName}, an AI assistant embedded in PM Agent — an enterprise project management platform.
Today is ${today}.

Your role is to help the Project Manager (PM) understand their project data, answer questions, and perform actions.

## Active Context
- Tab: ${tab}
- Project: ${project?.name ?? "Unknown"} (${project?.code ?? ""})
- Phase: ${project?.currentPhase ?? "Unknown"}
- Health: ${project?.healthStatus ?? "Unknown"}
${kpiSnapshot ? `- EVM: SPI=${kpiSnapshot.spi ?? "N/A"}, CPI=${kpiSnapshot.cpi ?? "N/A"}` : ""}
${project?.budget ? `- Budget: ${project.currency ?? "USD"} ${project.budget.toLocaleString()}` : ""}

## Capabilities
- Tier A (Analysis): Summarize, impact assessment, gap analysis, forecast, explain any artifact or document
- Tier B (Auto-write): Log a risk, log an issue
- Tier C (Confirm first): Regenerate any artifact

## What Can You Do — Capability Self-Disclosure
When the user asks anything like "what can you do", "what can you help me with", "what are your capabilities", "how can you assist me", or similar, respond with this structured bullet-point summary:

**${assistantName} can help you with:**

**💬 Chat Assistant (Analysis & Advice)**
- Summarize overall project health, schedule, cost, and risk posture
- Answer questions about SPI, CPI, RAG status, EVM metrics, and budget burn
- Perform impact assessment when scope or requirements change
- Identify gaps between baseline requirements and delivered scope
- Analyze uploaded documents (RFPs, change logs, contracts, CSV files)
- Explain any generated artifact (WBS, RACI, RAID, Initiation Deck, Status Report)
- Identify tasks at risk, overdue milestones, and resource constraints
- Forecast schedule or cost overruns based on current trends
- Review change requests and assess schedule/cost/quality impact

**⚡ Quick Actions (Auto-Execute)**
- Log a new risk (description, category, probability, impact, owner)
- Log a new issue (title, description, priority, owner)
- Mark a task as complete / update task progress percentage
- Mitigate / close a risk or resolve an issue
- Mark a milestone as achieved
- Update project health status (Green / Amber / Red)
- Bulk-close all completed tasks

**📄 Artifact Generation (With Confirmation)**
- Regenerate the Weekly Status Report (EWSR)
- Regenerate the Project Initiation Deck
- Regenerate the WBS, EVM Analysis, RACI Matrix, or RAID Register

**What ${assistantName} cannot do:**
- Access data outside this project (cannot compare across portfolio)
- Edit schedule dates or resource assignments directly
- Send emails or notifications on your behalf
- Make financial transactions or approvals

## Document Tools — MANDATORY USE FOR ANALYSIS
You have two tools: list_project_documents and read_document.

**You MUST use these tools whenever the user asks for:**
- Impact analysis / impact assessment
- Gap analysis / scope gap
- Change analysis (change log, change request, CR)
- Document review or summary
- Schedule or cost implications of a change
- Comparison of baseline vs current state

**Protocol for analysis requests:**
1. Call list_project_documents to see all available artifacts and uploaded files
2. Call read_document for EVERY relevant document (the change log, scope baseline, schedule, etc.) — read them in parallel, not one at a time
3. Synthesize a structured analysis from the actual content you read — never ask the user to paste content

**CSV and spreadsheet files:** These contain the raw data rows. Read them directly — the content field will contain the full CSV text with all rows and columns.

**Extracted requirements:** list_project_documents also returns extracted_requirements — use these for scope baseline comparisons.

## Response Style — Summary First, Details on Request

**Default response format for ALL analysis, status, and document-review tasks:**

1. **Lead with a high-level summary in 4–6 bullet points** — one crisp sentence each. Cover only the most important findings: what's healthy, what's at risk, what needs action.
2. **End every summary with a follow-up prompt** — ask the PM whether they want to drill into a specific area. Examples:
   - "Would you like the full breakdown on cost variance, schedule delays, or open risks?"
   - "Want me to go deeper on any of these areas?"
   - "Shall I expand the analysis on [topic]?"
3. **Only produce the detailed, thorough response** when the PM explicitly asks (e.g. "yes, expand on risks", "give me the full cost analysis", "tell me more").

**Quick questions** (e.g. "what is my CPI?", "who owns risk R-002?"): answer in 1–2 sentences — no bullet summary needed, no follow-up prompt.

**Action confirmations** (e.g. after logging a risk or closing a task): confirm what was done in 1–2 sentences — no follow-up prompt.

**Other rules:**
- Always use PM terminology (SPI, EVM, RAG, scope baseline, milestone, critical path)
- When referencing document content in detail mode: quote the relevant row or clause verbatim
- Never say you cannot access documents — use the tools`;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { copilotEnabled: true, assistantName: true },
  });
  if (!user?.copilotEnabled)
    return NextResponse.json({ error: "AI Assistant is disabled for your account" }, { status: 403 });

  const body = await req.json();
  const { message, projectId, tab = "default", history = [], kpiSnapshot } = body as {
    message: string; projectId?: string; tab?: string;
    history?: { role: "user" | "assistant"; content: string }[];
    kpiSnapshot?: any;
  };

  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  const project = projectId
    ? await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, code: true, currentPhase: true, healthStatus: true, budget: true, currency: true, startDate: true, endDate: true, description: true },
      })
    : null;

  const assistantName = user.assistantName || "Copilot";
  const systemPrompt = buildSystemPrompt(assistantName, tab, project, kpiSnapshot);
  const userId = session.user.id!;

  // Persist / resume conversation
  let conversation = await prisma.assistantConversation.findFirst({
    where: { userId, projectId: projectId ?? null, status: "active" },
    orderBy: { lastActiveAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.assistantConversation.create({
      data: { userId, projectId: projectId ?? null },
    });
  }

  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: "user", content: message, tabContext: tab },
  });

  const conversationId = conversation.id;

  // ── Intent detection ─────────────────────────────────────────────────────────
  const intent = detectIntent(message);
  let actionRecord: any = null;

  if (intent && projectId) {
    if (intent.type === "LOG_RISK") {
      const params = await extractRiskParams(message, anthropic);
      // Execute Tier B immediately
      try {
        const risk = await prisma.risk.create({
          data: {
            projectId,
            riskId: `R-${String((await prisma.risk.count({ where: { projectId } })) + 1).padStart(3, "0")}`,
            description: params.description || message,
            category: params.category || "Technical",
            probability: params.probability || "medium",
            impact: params.impact || "medium",
            owner: params.owner || "",
          },
        });
        actionRecord = await prisma.assistantAction.create({
          data: {
            conversationId,
            actionType: "LOG_RISK",
            tier: "b",
            payload: { riskId: risk.id, riskCode: risk.riskId, description: risk.description, category: risk.category, probability: risk.probability, impact: risk.impact },
            status: "auto_executed",
          },
        });
      } catch (e: any) {
        actionRecord = { error: e.message };
      }
    }

    if (intent.type === "LOG_ISSUE") {
      const params = await extractIssueParams(message, anthropic);
      try {
        const issue = await (prisma as any).issue.create({
          data: {
            projectId,
            title: params.title || message,
            description: params.description || "",
            priority: params.priority || "medium",
            status: "open",
            owner: params.owner || "",
          },
        });
        actionRecord = await prisma.assistantAction.create({
          data: {
            conversationId,
            actionType: "LOG_ISSUE",
            tier: "b",
            payload: { issueId: issue.id, title: issue.title, priority: issue.priority },
            status: "auto_executed",
          },
        });
      } catch (e: any) {
        actionRecord = { error: e.message };
      }
    }

    if (intent.type === "REGEN_ARTIFACT") {
      actionRecord = await prisma.assistantAction.create({
        data: {
          conversationId,
          actionType: "REGEN_ARTIFACT",
          tier: "c",
          payload: { artifactType: intent.params.artifactType, label: intent.params.label, projectId },
          status: "proposed",
        },
      });
    }

    if (intent.type === "CLOSE_TASK") {
      const ref = await extractEntityRef(intent.params.ref, "task", anthropic);
      try {
        const task = await prisma.scheduleTask.findFirst({
          where: {
            projectId,
            name: { contains: ref.name || ref.id || "", mode: "insensitive" as const },
          },
        });
        if (task) {
          const prev = { status: task.status, percentComplete: task.percentComplete };
          await prisma.scheduleTask.update({ where: { id: task.id }, data: { status: "done", percentComplete: 100 } });
          actionRecord = await prisma.assistantAction.create({
            data: {
              conversationId, actionType: "CLOSE_TASK", tier: "b",
              payload: { taskId: task.id, taskName: task.name, prev },
              status: "auto_executed",
            },
          });
        }
      } catch (e: any) { actionRecord = { error: e.message }; }
    }

    if (intent.type === "UPDATE_TASK_PROGRESS") {
      const ref = await extractEntityRef(intent.params.ref, "task", anthropic);
      try {
        const task = await prisma.scheduleTask.findFirst({
          where: {
            projectId,
            name: { contains: ref.name || ref.id || "", mode: "insensitive" },
          },
        });
        if (task) {
          const prev = { status: task.status, percentComplete: task.percentComplete };
          const pct = Math.min(100, Math.max(0, intent.params.percent));
          await prisma.scheduleTask.update({ where: { id: task.id }, data: { percentComplete: pct, status: pct === 100 ? "done" : task.status } });
          actionRecord = await prisma.assistantAction.create({
            data: {
              conversationId, actionType: "UPDATE_TASK_PROGRESS", tier: "b",
              payload: { taskId: task.id, taskName: task.name, percent: pct, prev },
              status: "auto_executed",
            },
          });
        }
      } catch (e: any) { actionRecord = { error: e.message }; }
    }

    if (intent.type === "CLOSE_RISK") {
      const ref = await extractEntityRef(intent.params.ref, "risk", anthropic);
      try {
        const risk = await prisma.risk.findFirst({
          where: {
            projectId,
            OR: [
              { description: { contains: ref.name || "", mode: "insensitive" } },
              { riskId: ref.id || undefined },
            ],
          },
        });
        if (risk) {
          const prev = { status: risk.status };
          await prisma.risk.update({ where: { id: risk.id }, data: { status: "mitigated" } });
          actionRecord = await prisma.assistantAction.create({
            data: {
              conversationId, actionType: "CLOSE_RISK", tier: "b",
              payload: { riskId: risk.id, riskCode: risk.riskId, description: risk.description, prev },
              status: "auto_executed",
            },
          });
        }
      } catch (e: any) { actionRecord = { error: e.message }; }
    }

    if (intent.type === "CLOSE_ISSUE") {
      const ref = await extractEntityRef(intent.params.ref, "issue", anthropic);
      try {
        const issue = await (prisma as any).issue.findFirst({
          where: {
            projectId,
            title: { contains: ref.name || ref.id || "", mode: "insensitive" },
          },
        });
        if (issue) {
          const prev = { status: issue.status };
          await (prisma as any).issue.update({ where: { id: issue.id }, data: { status: "closed" } });
          actionRecord = await prisma.assistantAction.create({
            data: {
              conversationId, actionType: "CLOSE_ISSUE", tier: "b",
              payload: { issueId: issue.id, title: issue.title, prev },
              status: "auto_executed",
            },
          });
        }
      } catch (e: any) { actionRecord = { error: e.message }; }
    }

    if (intent.type === "CLOSE_MILESTONE") {
      const ref = await extractEntityRef(intent.params.ref, "milestone", anthropic);
      try {
        const milestone = await prisma.milestone.findFirst({
          where: {
            projectId,
            name: { contains: ref.name || ref.id || "", mode: "insensitive" },
          },
        });
        if (milestone) {
          const prev = { status: milestone.status };
          await prisma.milestone.update({ where: { id: milestone.id }, data: { status: "completed" } });
          actionRecord = await prisma.assistantAction.create({
            data: {
              conversationId, actionType: "CLOSE_MILESTONE", tier: "b",
              payload: { milestoneId: milestone.id, milestoneName: milestone.name, prev },
              status: "auto_executed",
            },
          });
        }
      } catch (e: any) { actionRecord = { error: e.message }; }
    }

    if (intent.type === "BULK_CLOSE_TASKS") {
      try {
        const allTasks = await prisma.scheduleTask.findMany({
          where: { projectId, status: { not: "complete" } },
          select: { id: true, name: true, phase: true, status: true, percentComplete: true },
          orderBy: { sortOrder: "asc" },
        });
        if (allTasks.length > 0) {
          // Ask Claude which tasks match the user's filter (phase names, "all", etc.)
          const filterMsg = intent.params.filter;
          const taskListJson = JSON.stringify(
            allTasks.map((t) => ({ id: t.id, name: t.name, phase: t.phase, status: t.status }))
          );
          const filterResp = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 400,
            messages: [{
              role: "user",
              content: `The PM wants to bulk-close tasks with this request: "${filterMsg}"\n\nCandidate tasks (JSON):\n${taskListJson}\n\nReturn a JSON array of task IDs that match the request. If the request says "all" with no phase filter, return all IDs. Return only a valid JSON array, no other text.`,
            }],
          });
          const filterText = filterResp.content[0].type === "text" ? filterResp.content[0].text : "[]";
          let selectedIds: string[] = [];
          try {
            const match = filterText.match(/\[[\s\S]*?\]/);
            selectedIds = JSON.parse(match ? match[0] : "[]");
          } catch { selectedIds = allTasks.map((t) => t.id); }

          const selectedTasks = allTasks.filter((t) => selectedIds.includes(t.id));
          if (selectedTasks.length > 0) {
            actionRecord = await prisma.assistantAction.create({
              data: {
                conversationId, actionType: "BULK_CLOSE_TASKS", tier: "c",
                payload: { projectId, tasks: selectedTasks.map((t) => ({ id: t.id, name: t.name, status: t.status })), count: selectedTasks.length },
                status: "proposed",
              },
            });
          }
        }
      } catch (e: any) { actionRecord = { error: e.message }; }
    }

    if (intent.type === "UPDATE_PROJECT_STATUS") {
      actionRecord = await prisma.assistantAction.create({
        data: {
          conversationId, actionType: "UPDATE_PROJECT_STATUS", tier: "c",
          payload: { projectId, healthStatus: intent.params.healthStatus },
          status: "proposed",
        },
      });
    }
  }

  // ── Stream AI response (agentic tool loop) ───────────────────────────────────
  const recentHistory = history.slice(-6).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullResponse = "";
        const messages: any[] = [...recentHistory, { role: "user", content: message }];
        const MAX_TOOL_ROUNDS = 6;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const anthropicStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            tools: projectId ? (DOCUMENT_TOOLS as any) : [],
            messages,
          });

          for await (const event of anthropicStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const chunk = event.delta.text;
              fullResponse += chunk;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
            }
          }

          const finalMsg = await anthropicStream.finalMessage();

          if (finalMsg.stop_reason !== "tool_use") break; // done — no more tools

          // Execute each tool call and collect results
          const toolUseBlocks = finalMsg.content.filter((b: any) => b.type === "tool_use");
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (b: any) => ({
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: JSON.stringify(
                projectId
                  ? await executeProjectTool(b.name, b.input, projectId)
                  : { error: "No project context" }
              ),
            }))
          );

          messages.push({ role: "assistant", content: finalMsg.content });
          messages.push({ role: "user", content: toolResults });
        }

        // Persist assistant reply
        await prisma.assistantMessage.create({
          data: { conversationId, role: "assistant", content: fullResponse, tabContext: tab },
        });
        await prisma.assistantConversation.update({
          where: { id: conversationId },
          data: { lastActiveAt: new Date() },
        });

        // Emit action card if one was created
        if (actionRecord && !actionRecord.error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ action: actionRecord })}\n\n`));
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "default";
  const actions = TAB_QUICK_ACTIONS[tab] ?? TAB_QUICK_ACTIONS.default;
  return NextResponse.json({ quickActions: actions });
}
