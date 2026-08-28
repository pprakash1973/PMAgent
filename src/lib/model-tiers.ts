import type { Provider } from "./providers/types";

// All logical AI agents in the platform
export const AGENTS = [
  { id: "artifact",          label: "Artifact Generation",      description: "Generates all 25 PMBOK artifact types (WBS, risk, charter, status, etc.)" },
  { id: "nl_project",        label: "NL Project Creation",      description: "Infers structured project fields from a natural-language brief" },
  { id: "status_questions",  label: "Status Questions",         description: "Generates contextual questions for weekly/monthly status reports" },
  { id: "status_summary",    label: "Status Summary",           description: "Drafts the narrative summary section of status reports" },
  { id: "schedule_recovery", label: "Schedule Recovery",        description: "Analyses delayed tasks and proposes a recovery plan" },
  { id: "requirements",      label: "Requirements Extraction",  description: "Parses uploaded requirement documents and extracts structured fields" },
  { id: "extraction",        label: "Scope Control Extraction", description: "Extracts discrete requirements from chunked documents in scope control (defaults to Haiku for speed)" },
  { id: "chat",              label: "Project Chat",             description: "Answers questions and executes commands within a single project context" },
  { id: "portfolio_chat",    label: "Portfolio Chat",           description: "Cross-project portfolio Q&A for PMs, DMs, and Delivery Heads" },
] as const;

export type AgentId = typeof AGENTS[number]["id"];

export const AVAILABLE_MODELS: {
  id: string;
  label: string;
  provider: Provider;
  tier: string;
}[] = [
  // ── Anthropic ────────────────────────────────────────────────────────────
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5",   provider: "anthropic", tier: "Fast" },
  { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6",  provider: "anthropic", tier: "Balanced" },
  { id: "claude-sonnet-5",           label: "Claude Sonnet 5",    provider: "anthropic", tier: "Latest" },
  { id: "claude-opus-4-8",           label: "Claude Opus 4.8",    provider: "anthropic", tier: "Quality" },
  // ── OpenAI ───────────────────────────────────────────────────────────────
  { id: "gpt-4o-mini",               label: "GPT-4o mini",        provider: "openai",    tier: "Fast" },
  { id: "gpt-4o",                    label: "GPT-4o",             provider: "openai",    tier: "Balanced" },
  { id: "o3-mini",                   label: "o3-mini",            provider: "openai",    tier: "Smart" },
  { id: "gpt-4.1",                   label: "GPT-4.1",            provider: "openai",    tier: "Quality" },
  // ── DeepSeek ─────────────────────────────────────────────────────────────
  { id: "deepseek-chat",             label: "DeepSeek Chat",      provider: "deepseek",  tier: "Balanced" },
  { id: "deepseek-reasoner",         label: "DeepSeek Reasoner",  provider: "deepseek",  tier: "Smart" },
];

export const DEFAULT_MODEL     = "claude-sonnet-4-6";
export const DEFAULT_PROVIDER: Provider = "anthropic";
export const DEFAULT_MAX_TOKENS = 8192;
export const DEFAULT_TEMPERATURE = 0;

/**
 * Per-agent allowed model tiers (WP-6, AC-10.3).
 * Critical agents restricted to Balanced/Latest/Quality/Smart.
 * Unrestricted agents (chat, portfolio_chat) accept any model.
 */
export const AGENT_ALLOWED_TIERS: Record<AgentId, string[] | null> = {
  artifact:          ["Balanced", "Latest", "Quality", "Smart"],
  nl_project:        ["Balanced", "Latest", "Quality", "Smart", "Fast"],
  status_questions:  ["Balanced", "Latest", "Quality", "Smart", "Fast"],
  status_summary:    ["Balanced", "Latest", "Quality", "Smart"],
  schedule_recovery: ["Balanced", "Latest", "Quality", "Smart"],
  requirements:      ["Balanced", "Latest", "Quality", "Smart"],
  extraction:        ["Fast", "Balanced", "Latest", "Quality", "Smart"],
  chat:              null,
  portfolio_chat:    null,
};

/** Per-agent default model used when no ModelConfig DB row exists for that agent.
 *  Only specify when the agent-level default should differ from DEFAULT_MODEL. */
export const AGENT_DEFAULT_MODELS: Partial<Record<AgentId, string>> = {
  extraction: "claude-haiku-4-5-20251001",
};

/** Returns the subset of AVAILABLE_MODELS permitted for a given agent. */
export function allowedModelsForAgent(agentId: AgentId): typeof AVAILABLE_MODELS {
  const tiers = AGENT_ALLOWED_TIERS[agentId];
  if (!tiers) return AVAILABLE_MODELS;
  return AVAILABLE_MODELS.filter((m) => tiers.includes(m.tier));
}

/** Returns true when a model has no compliance evidence for the given agent. */
export function isModelUncertified(agentId: AgentId, modelId: string): boolean {
  return !allowedModelsForAgent(agentId).some((m) => m.id === modelId);
}
