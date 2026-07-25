export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/ai";

const TAB_QUICK_ACTIONS: Record<string, string[]> = {
  schedule:   ["What tasks are at risk this week?", "Summarize schedule health", "Which tasks are on the critical path?"],
  artifacts:  ["Explain this artifact", "What sections are missing?", "Summarize this artifact"],
  risks:      ["Summarize risk exposure", "Which risks are highest priority?", "What mitigations are in place?"],
  costs:      ["Where am I trending over budget?", "What's my current CPI?", "Summarize cost performance"],
  status:     ["Summarize project health", "What needs my attention this week?", "What's changed since last report?"],
  resources:  ["Who is over-allocated?", "Summarize team capacity", "Which resources are unassigned?"],
  default:    ["Summarize project status", "What needs my attention?", "What's the overall health?"],
};

function buildSystemPrompt(
  assistantName: string,
  tab: string,
  project: any,
  kpiSnapshot: any
) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are ${assistantName}, an AI assistant embedded in PM Agent — an enterprise project management platform.
Today is ${today}.

Your role is to help the Project Manager (PM) understand their project data, answer questions, and provide analysis.
You are operating in READ-ONLY / ANALYSIS mode (Tier A). You can summarize, explain, and recommend — but you do not modify any data.

## Active Context
- Tab: ${tab}
- Project: ${project?.name ?? "Unknown"} (${project?.code ?? ""})
- Phase: ${project?.currentPhase ?? "Unknown"}
- Health: ${project?.healthStatus ?? "Unknown"}
${kpiSnapshot ? `- EVM Snapshot: SPI=${kpiSnapshot.spi ?? "N/A"}, PV=${kpiSnapshot.pv ?? "N/A"}, EV=${kpiSnapshot.ev ?? "N/A"}` : ""}
${project?.budget ? `- Budget: ${project.currency ?? "USD"} ${project.budget.toLocaleString()}` : ""}
${project?.startDate ? `- Start: ${new Date(project.startDate).toISOString().slice(0, 10)}` : ""}
${project?.endDate ? `- End: ${new Date(project.endDate).toISOString().slice(0, 10)}` : ""}

## Guidelines
- Be concise and PM-focused — use project management terminology (SPI, EVM, RAG, milestone, risk, etc.)
- When data is available in context, cite specific numbers — don't speak in generalities
- When you spot a risk or concern, name it clearly
- If the PM asks you to do something you can't do in read-only mode, acknowledge it and describe what they'd need to do manually
- Format responses with bullet points or short paragraphs for scannability
- Keep responses under 200 words unless the PM asks for detail`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { copilotEnabled: true, assistantName: true },
  });

  if (!user?.copilotEnabled) {
    return NextResponse.json({ error: "AI Assistant is disabled for your account" }, { status: 403 });
  }

  const body = await req.json();
  const { message, projectId, tab = "default", history = [], kpiSnapshot } = body as {
    message: string;
    projectId?: string;
    tab?: string;
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

  // Persist conversation
  const userId = session.user.id!;

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

  // Build message history (last 6 turns)
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
          messages: [
            ...recentHistory,
            { role: "user", content: message },
          ],
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
