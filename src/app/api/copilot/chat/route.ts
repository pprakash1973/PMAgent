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

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(assistantName: string, tab: string, project: any, kpiSnapshot: any) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are ${assistantName}, an AI assistant embedded in PM Agent — an enterprise project management platform.
Today is ${today}.

Your role is to help the Project Manager (PM) understand their project data, answer questions, and perform actions.
You operate in READ/ANALYZE mode (Tier A) for analysis plus ACTION mode (Tier B/C) for writes.

## Active Context
- Tab: ${tab}
- Project: ${project?.name ?? "Unknown"} (${project?.code ?? ""})
- Phase: ${project?.currentPhase ?? "Unknown"}
- Health: ${project?.healthStatus ?? "Unknown"}
${kpiSnapshot ? `- EVM: SPI=${kpiSnapshot.spi ?? "N/A"}, CPI=${kpiSnapshot.cpi ?? "N/A"}` : ""}
${project?.budget ? `- Budget: ${project.currency ?? "USD"} ${project.budget.toLocaleString()}` : ""}

## What I can do
- Tier A (Instant): Summarize, analyze, forecast, explain any artifact
- Tier B (Auto-write + Undo): Log a risk, log an issue
- Tier C (Confirm required): Regenerate the Initiation Deck, Regenerate the EWSR/Weekly Status Report, regenerate any artifact

## Guidelines
- Be concise and PM-focused. Use PM terminology (SPI, EVM, RAG, milestone, risk).
- When an action card is being shown separately, keep your text brief and confirmatory.
- Cite specific numbers when data is available.
- Keep responses under 150 words unless detail is requested.`;
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
        const tasks = await prisma.scheduleTask.findMany({
          where: { projectId, status: { not: "done" } },
          select: { id: true, name: true, status: true, percentComplete: true },
          orderBy: { name: "asc" },
        });
        if (tasks.length > 0) {
          actionRecord = await prisma.assistantAction.create({
            data: {
              conversationId, actionType: "BULK_CLOSE_TASKS", tier: "c",
              payload: { projectId, tasks: tasks.map((t) => ({ id: t.id, name: t.name, status: t.status })), count: tasks.length },
              status: "proposed",
            },
          });
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

  // ── Stream AI response ────────────────────────────────────────────────────────
  const recentHistory = history.slice(-6).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullResponse = "";

        const anthropicStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [...recentHistory, { role: "user", content: message }],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullResponse += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          }
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
