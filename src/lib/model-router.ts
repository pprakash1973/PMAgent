import { prisma } from "./db";

export interface AgentConfig {
  model: string;
  maxTokens: number;
}

// All logical AI agents in the platform
export const AGENTS = [
  { id: "artifact",          label: "Artifact Generation",      description: "Generates all 25 PMBOK artifact types (WBS, risk, charter, status, etc.)" },
  { id: "nl_project",        label: "NL Project Creation",      description: "Infers structured project fields from a natural-language brief" },
  { id: "status_questions",  label: "Status Questions",         description: "Generates contextual questions for weekly/monthly status reports" },
  { id: "status_summary",    label: "Status Summary",           description: "Drafts the narrative summary section of status reports" },
  { id: "schedule_recovery", label: "Schedule Recovery",        description: "Analyses delayed tasks and proposes a recovery plan" },
  { id: "requirements",      label: "Requirements Extraction",  description: "Parses uploaded requirement documents and extracts structured fields" },
  { id: "chat",              label: "Project Chat",             description: "Answers questions and executes commands within a single project context" },
  { id: "portfolio_chat",    label: "Portfolio Chat",           description: "Cross-project portfolio Q&A for PMs, DMs, and Delivery Heads" },
] as const;

export type AgentId = typeof AGENTS[number]["id"];

export const AVAILABLE_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5  — fastest, lowest cost" },
  { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6 — balanced (default)" },
  { id: "claude-sonnet-5",           label: "Claude Sonnet 5   — latest Sonnet" },
  { id: "claude-opus-4-8",           label: "Claude Opus 4.8   — highest quality" },
];

export const DEFAULT_MODEL     = "claude-sonnet-4-6";
export const DEFAULT_MAX_TOKENS = 8192;

// In-process TTL cache — avoids a DB hit on every generation call
const cache = new Map<string, AgentConfig & { exp: number }>();
const TTL_MS = 60_000; // 1 minute; invalidated immediately on admin save

export async function resolveModel(agent: AgentId): Promise<AgentConfig> {
  const now = Date.now();
  const hit = cache.get(agent);
  if (hit && hit.exp > now) return { model: hit.model, maxTokens: hit.maxTokens };

  const row = await prisma.modelConfig.findUnique({ where: { agent } });
  const result: AgentConfig = {
    model:     row?.model     ?? DEFAULT_MODEL,
    maxTokens: row?.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  cache.set(agent, { ...result, exp: now + TTL_MS });
  return result;
}

export function invalidateCache(agent?: string) {
  if (agent) cache.delete(agent);
  else cache.clear();
}
