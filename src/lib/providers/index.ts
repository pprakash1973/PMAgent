import crypto from "crypto";
import type { AgentConfig } from "@/lib/model-router";
import { captureEvidence } from "@/lib/uat-capture";
import { extractJson } from "@/lib/extract-json";
import { callAnthropic, streamAnthropic } from "./anthropic";
import { callOpenAI, streamOpenAI } from "./openai";
import { callDeepSeek, streamDeepSeek } from "./deepseek";
export type { LLMCallOptions, LLMMessage, LLMResponse, Provider } from "./types";

/**
 * Internal helper — wraps any provider dispatch with a timer and evidence capture.
 * Capture failures are swallowed so they can never break a user request (C-4 / AC-8.6).
 */
async function dispatch(
  fn: () => Promise<import("./types").LLMResponse>,
  opts: import("./types").LLMCallOptions,
  config: AgentConfig
): Promise<import("./types").LLMResponse> {
  const start = Date.now();
  let response: import("./types").LLMResponse | undefined;
  let captureError: string | undefined;

  try {
    response = await fn();
    return response;
  } catch (err) {
    captureError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // Derive a deterministic input_id from prompt content so repeated runs
    // of the same logical input produce the same id (stability checks need it).
    const userContent = opts.messages.map((m) => m.content).join("|");
    const derivedInputId = opts.inputId
      ?? crypto.createHash("sha256").update(userContent).digest("hex").slice(0, 16);

    // Best-effort parse of structured output for evidence traceability.
    let parsedOutput: unknown = null;
    if (response?.text) {
      try { parsedOutput = extractJson(response.text); } catch { /* leave null */ }
    }

    captureEvidence({
      agent:            opts.agent ?? "unknown",
      model:            opts.model,
      provider:         config.provider,
      params:           { temperature: opts.temperature ?? 0, max_tokens: opts.maxTokens },
      inputId:          derivedInputId,
      systemPrompt:     opts.system,
      userPrompt:       opts.messages.map((m) => `[${m.role}]: ${m.content}`).join("\n---\n"),
      retrievedContext: opts.retrievedContext,
      rawResponse:      response?.text,
      stopReason:       response?.stopReason,
      output:           parsedOutput,
      latencyMs:        Date.now() - start,
      error:            captureError,
    });
  }
}

/**
 * Route a standard LLM call to the provider configured for this agent.
 * cache_control is applied automatically by the Anthropic adapter;
 * other providers silently omit it.
 */
export async function callLLM(
  opts: import("./types").LLMCallOptions,
  config: AgentConfig
): Promise<import("./types").LLMResponse> {
  return dispatch(() => {
    switch (config.provider) {
      case "anthropic": return callAnthropic(opts);
      case "openai":    return callOpenAI(opts);
      case "deepseek":  return callDeepSeek(opts);
      default:
        throw new Error(`Unknown LLM provider: "${config.provider}". Check model-router config.`);
    }
  }, opts, config);
}

/**
 * Streaming variant — used for large artifact generation.
 * Anthropic gets true streaming; OpenAI/DeepSeek fall back to a single request.
 */
export async function streamLLM(
  opts: import("./types").LLMCallOptions,
  config: AgentConfig
): Promise<import("./types").LLMResponse> {
  return dispatch(() => {
    switch (config.provider) {
      case "anthropic": return streamAnthropic(opts);
      case "openai":    return streamOpenAI(opts);
      case "deepseek":  return streamDeepSeek(opts);
      default:
        throw new Error(`Unknown LLM provider: "${config.provider}". Check model-router config.`);
    }
  }, opts, config);
}
