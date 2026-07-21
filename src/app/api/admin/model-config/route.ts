export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { AGENTS, AVAILABLE_MODELS, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, invalidateCache } from "@/lib/model-router";
import { z } from "zod";

const putSchema = z.object({
  agent:     z.string().min(1),
  model:     z.string().min(1),
  maxTokens: z.number().int().min(256).max(32000),
  notes:     z.string().optional(),
});

// GET — return all 8 agents, filling defaults for rows not yet in DB
export async function GET() {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.modelConfig.findMany();
  const rowMap = new Map(rows.map((r) => [r.agent, r]));

  const validModelIds = new Set(AVAILABLE_MODELS.map((m) => m.id));

  const result = AGENTS.map((agent) => {
    const row = rowMap.get(agent.id);
    return {
      agent:       agent.id,
      label:       agent.label,
      description: agent.description,
      model:       row?.model && validModelIds.has(row.model) ? row.model : DEFAULT_MODEL,
      maxTokens:   row?.maxTokens ?? DEFAULT_MAX_TOKENS,
      notes:       row?.notes ?? "",
      updatedAt:   row?.updatedAt ?? null,
      updatedBy:   row?.updatedBy ?? null,
      isDefault:   !row,
    };
  });

  return NextResponse.json({ agents: result, availableModels: AVAILABLE_MODELS });
}

// PUT — upsert a single agent config, then bust the in-process cache
export async function PUT(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const admin = user as any;

  try {
    const body = await req.json();
    const data = putSchema.parse(body);

    if (!AGENTS.find((a) => a.id === data.agent)) {
      return NextResponse.json({ error: { code: "INVALID_AGENT" } }, { status: 400 });
    }
    if (!AVAILABLE_MODELS.find((m) => m.id === data.model)) {
      return NextResponse.json({ error: { code: "INVALID_MODEL" } }, { status: 400 });
    }

    const row = await prisma.modelConfig.upsert({
      where: { agent: data.agent },
      create: {
        agent:     data.agent,
        model:     data.model,
        maxTokens: data.maxTokens,
        notes:     data.notes ?? null,
        updatedBy: admin.email,
      },
      update: {
        model:     data.model,
        maxTokens: data.maxTokens,
        notes:     data.notes ?? null,
        updatedBy: admin.email,
      },
    });

    // Immediate cache bust so the next generation call picks up the new model
    invalidateCache(data.agent);

    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message } }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
  }
}
