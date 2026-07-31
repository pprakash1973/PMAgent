import OpenAI from "openai";
import type { LLMCallOptions, LLMResponse } from "./types";

// DeepSeek exposes an OpenAI-compatible API — same request/response shape,
// different base URL and key.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://api.deepseek.com/v1",
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }
  return _client;
}

export async function callDeepSeek(opts: LLMCallOptions): Promise<LLMResponse> {
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

export const streamDeepSeek = callDeepSeek;
