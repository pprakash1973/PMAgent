import type { AgentConfig } from "@/lib/model-router";
import { callAnthropic, streamAnthropic } from "./anthropic";
import { callOpenAI, streamOpenAI } from "./openai";
import { callDeepSeek, streamDeepSeek } from "./deepseek";
export type { LLMCallOptions, LLMMessage, LLMResponse, Provider } from "./types";

/**
 * Route a standard LLM call to the provider configured for this agent.
 * cache_control is applied automatically by the Anthropic adapter;
 * other providers silently omit it.
 */
export async function callLLM(
  opts: import("./types").LLMCallOptions,
  config: AgentConfig
): Promise<import("./types").LLMResponse> {
  switch (config.provider) {
    case "anthropic": return callAnthropic(opts);
    case "openai":    return callOpenAI(opts);
    case "deepseek":  return callDeepSeek(opts);
    default:
      throw new Error(`Unknown LLM provider: "${config.provider}". Check model-router config.`);
  }
}

/**
 * Streaming variant — used for large artifact generation.
 * Anthropic gets true streaming; OpenAI/DeepSeek fall back to a single request.
 */
export async function streamLLM(
  opts: import("./types").LLMCallOptions,
  config: AgentConfig
): Promise<import("./types").LLMResponse> {
  switch (config.provider) {
    case "anthropic": return streamAnthropic(opts);
    case "openai":    return streamOpenAI(opts);
    case "deepseek":  return streamDeepSeek(opts);
    default:
      throw new Error(`Unknown LLM provider: "${config.provider}". Check model-router config.`);
  }
}
