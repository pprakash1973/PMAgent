export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";
import { ARTIFACT_CATALOG } from "@/lib/utils";

const TAB_QUICK_ACTIONS: Record<string, string[]> = {
  schedule:   ["What tasks are at risk this week?", "Summarize schedule health", "Which tasks are on the critical path?"],
  artifacts:  ["Explain this artifact", "Regenerate the Initiation Deck", "Regenerate the Weekly Status Report"],
  risks:      ["Summarize risk exposure", "Log a new risk", "Which risks are highest priority?"],
  costs:      ["Where am I trending over budget?", "What's my current CPI?", "Summarize cost performance"],
  status:     ["Regenerate the Weekly Status Report", "What needs my attention this week?", "Summarize project health"],
  resources:  ["Who is over-allocated?", "Summarize team capacity", "Which resources are unassigned?"],
  default:    ["Summarize project status", "What needs my attention?", "Regenerate the Initiation Deck"],
};

// ── Intent detection ──────────────────────────────────────────────────────────

type Intent =
  | { type: "LOG_RISK"; tier: "b"; params: { description: string; category?: string; probability?: string; impact?: string; owner?: string } }
  | { type: "LOG_ISSUE"; tier: "b"; params: { title: string; description?: string; priority?: string; owner?: string } }
  | { type: "REGEN_ARTIFACT"; tier: "c"; params: { artifactType: string; label: string } }
  | { type: "EXPLAIN_ARTIFACT"; tier: "a"; params: { artifactType?: string } }
  | null;

function detectIntent(message: string): Intent {
  const msg = message.toLowerCase();

  // Artifact regeneration — Tier C (catalog-driven, covers all artifact types)
  if (/regen|regenerate|generate|update|rewrite|create|refresh|make|produce|build/.test(msg)) {
    // Extra aliases that don't appear verbatim in the label
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
    // Check aliases first
    for (const [alias, artifactType] of Object.entries(ALIASES)) {
      if (msg.includes(alias)) {
        const entry = ARTIFACT_CATALOG.find((a) => a.type === artifactType);
        if (entry) return { type: "REGEN_ARTIFACT", tier: "c", params: { artifactType: entry.type, label: entry.label } };
      }
    }
    // Then check catalog labels (e.g. "issue register", "stakeholder register", "closure report")
    for (const entry of ARTIFACT_CATALOG) {
      const normalized = entry.label.toLowerCase().replace(/_/g, " ");
      if (msg.includes(normalized) || msg.includes(entry.type.replace(/_/g, " "))) {
        return { type: "REGEN_ARTIFACT", tier: "c", params: { artifactType: entry.type, label: entry.label } };
      }
    }
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
      // Tier C — just create the action card, don't execute yet
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
