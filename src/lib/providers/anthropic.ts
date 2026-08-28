import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallOptions, LLMResponse } from "./types";
import { getApiKey } from "./get-api-key";

// 180s gives the AI enough time to generate the largest artifacts (WBS, complex
// risk registers) while staying safely under the Azure 230s route hard limit.
const REQUEST_TIMEOUT_MS = 180_000;

async function getClient(): Promise<Anthropic> {
  const apiKey = await getApiKey("anthropic");
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
}

export async function callAnthropic(opts: LLMCallOptions): Promise<LLMResponse> {
  const client = await getClient();
  const message = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: opts.messages,
  });

  const content = message.content[0];
  if (!content || content.type !== "text") throw new Error("Unexpected Anthropic response type");

  return {
    text: content.text,
    stopReason: message.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
  };
}

export async function streamAnthropic(opts: LLMCallOptions): Promise<LLMResponse> {
  const client = await getClient();
  // The client is constructed with REQUEST_TIMEOUT_MS so the SDK cancels the
  // underlying TCP connection when the timeout fires and throws APITimeoutError.
  // This is more reliable than Promise.race because the error propagates while
  // the DB connection is still alive, allowing the after() catch clause to write
  // the error to the artifact record before the Prisma pool recycles.
  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: opts.messages,
  });
  const message = await stream.finalMessage();

  const content = message.content[0];
  if (!content || content.type !== "text") throw new Error("Unexpected Anthropic stream response type");

  return {
    text: content.text,
    stopReason: message.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
  };
}
