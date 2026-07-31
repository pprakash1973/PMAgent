import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallOptions, LLMResponse } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callAnthropic(opts: LLMCallOptions): Promise<LLMResponse> {
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
