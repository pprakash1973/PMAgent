import OpenAI from "openai";
import type { LLMCallOptions, LLMResponse } from "./types";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function callOpenAI(opts: LLMCallOptions): Promise<LLMResponse> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const choice = response.choices[0];
  const text = choice?.message?.content ?? "";
  const stopReason = choice?.finish_reason === "length" ? "max_tokens" : "end_turn";

  return { text, stopReason };
}

// OpenAI supports streaming but for simplicity we fall back to non-streaming.
// Artifact generation still works — just no incremental flush.
export const streamOpenAI = callOpenAI;
