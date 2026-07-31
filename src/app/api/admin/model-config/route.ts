export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { AGENTS, AVAILABLE_MODELS, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_PROVIDER, invalidateCache } from "@/lib/model-router";
import { z } from "zod";

const putSchema = z.object({
  agent:     z.string().min(1),
  model:     z.string().min(1),
  provider:  z.string().min(1),
  maxTokens: z.number().int().min(256).max(32000),
  notes:     z.string().optional(),
});

async function providerKeyStatus() {
  let dbRows: { key: string }[] = [];
  try {
    dbRows = await prisma.$queryRaw<{ key: string }[]>(
      Prisma.sql`SELECT key FROM "SystemSetting"
                 WHERE key IN ('api_key.anthropic', 'api_key.openai', 'api_key.deepseek')`
    );
  } catch { /* table may not exist yet */ }
  const dbSet = new Set(dbRows.map((r) => r.key));

  return {
    anthropic: dbSet.has("api_key.anthropic") || !!process.env.ANTHROPIC_API_KEY,
    openai:    dbSet.has("api_key.openai")    || !!process.env.OPENAI_API_KEY,
    deepseek:  dbSet.has("api_key.deepseek")  || !!process.env.DEEPSEEK_API_KEY,
  };
}

// GET — return all 8 agents, filling defaults for rows not yet in DB
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.modelConfig.findMany();
  const rowMap = new Map(rows.map((r) => [r.agent, r]));
  const validModelIds = new Set(AVAILABLE_MODELS.map((m) => m.id));

  const result = AGENTS.map((agent) => {
    const row = rowMap.get(agent.id);
    const modelId = row?.model && validModelIds.has(row.model) ? row.model : DEFAULT_MODEL;
    const modelMeta = AVAILABLE_MODELS.find((m) => m.id === modelId);
    const provider = (row as any)?.provider ?? modelMeta?.provider ?? DEFAULT_PROVIDER;
    return {
      agent:       agent.id,
      label:       agent.label,
      description: agent.description,
      model:       modelId,
      provider,
      maxTokens:   row?.maxTokens ?? DEFAULT_MAX_TOKENS,
      notes:       row?.notes ?? "",
      updatedAt:   row?.updatedAt ?? null,
      updatedBy:   row?.updatedBy ?? null,
      isDefault:   !row,
    };
  });

  return NextResponse.json({
    agents:          result,
    availableModels: AVAILABLE_MODELS,
    providerKeyStatus: await providerKeyStatus(),
  });
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
    const modelMeta = AVAILABLE_MODELS.find((m) => m.id === data.model);
    if (!modelMeta) {
      return NextResponse.json({ error: { code: "INVALID_MODEL" } }, { status: 400 });
    }
    // Provider must match the selected model
    if (modelMeta.provider !== data.provider) {
      return NextResponse.json({ error: { code: "PROVIDER_MODEL_MISMATCH", message: `Model ${data.model} belongs to provider "${modelMeta.provider}", not "${data.provider}".` } }, { status: 400 });
    }

    const row = await (prisma.modelConfig as any).upsert({
      where: { agent: data.agent },
      create: {
        agent:     data.agent,
        model:     data.model,
        provider:  data.provider,
        maxTokens: data.maxTokens,
        notes:     data.notes ?? null,
        updatedBy: admin.email,
      },
      update: {
        model:     data.model,
        provider:  data.provider,
        maxTokens: data.maxTokens,
        notes:     data.notes ?? null,
        updatedBy: admin.email,
      },
    });

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
