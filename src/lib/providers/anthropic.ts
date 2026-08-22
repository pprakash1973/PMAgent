import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallOptions, LLMResponse } from "./types";
import { getApiKey } from "./get-api-key";

// Module-level singleton keyed by API key — avoids re-constructing the SDK client on every call
const clientCache = new Map<string, Anthropic>();

async function getClient(): Promise<Anthropic> {
  const apiKey = await getApiKey("anthropic");
  const key = apiKey ?? "";
  let client = clientCache.get(key);
  if (!client) {
    client = new Anthropic({ apiKey });
    clientCache.set(key, client);
  }
  return client;
}

// Claude 5 family and extended-thinking models have deprecated the temperature parameter
function supportsTemperature(model: string): boolean {
  return !/-5(?:[-_]|$)/.test(model) && !model.includes("fable");
}

export async function callAnthropic(opts: LLMCallOptions): Promise<LLMResponse> {
  const client = await getClient();
  const message = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(supportsTemperature(opts.model) && { temperature: opts.temperature ?? 0 }),
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
  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(supportsTemperature(opts.model) && { temperature: opts.temperature ?? 0 }),
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: opts.messages,
  });

  // Forward tokens to the caller while accumulating the full text
  let fullText = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      opts.onToken?.(event.delta.text);
    }
  }

  const message = await stream.finalMessage();
  return {
    text: fullText || (message.content[0]?.type === "text" ? message.content[0].text : ""),
    stopReason: message.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
  };
}
