import { prisma } from "./db";
import type { Provider } from "./providers/types";
import {
  AGENTS, AVAILABLE_MODELS, AGENT_ALLOWED_TIERS, AGENT_DEFAULT_MODELS,
  DEFAULT_MODEL, DEFAULT_PROVIDER, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE,
  allowedModelsForAgent, isModelUncertified,
  type AgentId,
} from "./model-tiers";

// Re-export pure client-safe symbols for callers that imported from this module
export {
  AGENTS, AVAILABLE_MODELS, AGENT_ALLOWED_TIERS, AGENT_DEFAULT_MODELS,
  DEFAULT_MODEL, DEFAULT_PROVIDER, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE,
  allowedModelsForAgent, isModelUncertified,
  type AgentId,
};

export interface AgentConfig {
  model: string;
  maxTokens: number;
  provider: Provider;
  temperature: number;
}

// In-process TTL cache — avoids a DB hit on every generation call
const cache = new Map<string, AgentConfig & { exp: number }>();
const TTL_MS = 60_000;

export async function resolveModel(agent: AgentId): Promise<AgentConfig> {
  const now = Date.now();
  const hit = cache.get(agent);
  if (hit && hit.exp > now) return { model: hit.model, maxTokens: hit.maxTokens, provider: hit.provider, temperature: hit.temperature };

  type ExtendedRow = { model: string; maxTokens: number; provider?: string; temperature?: number } | null;
  const row = await prisma.modelConfig.findUnique({ where: { agent } }) as ExtendedRow;

  const storedProvider = row?.provider as Provider | undefined;
  const derivedProvider: Provider = storedProvider
    ?? AVAILABLE_MODELS.find((m) => m.id === row?.model)?.provider
    ?? DEFAULT_PROVIDER;

  const agentDefault = AGENT_DEFAULT_MODELS[agent] ?? DEFAULT_MODEL;
  const result: AgentConfig = {
    model:       row?.model       ?? agentDefault,
    maxTokens:   row?.maxTokens   ?? DEFAULT_MAX_TOKENS,
    provider:    derivedProvider,
    temperature: row?.temperature ?? DEFAULT_TEMPERATURE,
  };
  cache.set(agent, { ...result, exp: now + TTL_MS });
  return result;
}

export function invalidateCache(agent?: string) {
  if (agent) cache.delete(agent);
  else cache.clear();
}
