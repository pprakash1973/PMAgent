import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallOptions, LLMResponse } from "./types";
import { getApiKey } from "./get-api-key";

async function getClient(): Promise<Anthropic> {
  const apiKey = await getApiKey("anthropic");
  return new Anthropic({ apiKey });
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
  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: opts.messages,
  });

  // Guard against streams that start but never send end-of-stream. Without a
  // timeout, stream.finalMessage() hangs indefinitely and the after() task is
  // killed silently with no error stored in the DB.
  const STREAM_TIMEOUT_MS = 120_000;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      // Reject the race FIRST so the error message is ours, then try to abort.
      reject(new Error(`Anthropic stream timed out after ${STREAM_TIMEOUT_MS / 1000}s`));
      try { stream.abort(); } catch { /* ignore SDK abort errors */ }
    }, STREAM_TIMEOUT_MS);
  });

  let message: Awaited<ReturnType<typeof stream.finalMessage>>;
  try {
    message = await Promise.race([stream.finalMessage(), timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }

  const content = message.content[0];
  if (!content || content.type !== "text") throw new Error("Unexpected Anthropic stream response type");

  return {
    text: content.text,
    stopReason: message.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
  };
}
