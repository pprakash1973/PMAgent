import OpenAI from "openai";
import type { LLMCallOptions, LLMResponse } from "./types";
import { getApiKey } from "./get-api-key";

async function getClient(): Promise<OpenAI> {
  const apiKey = await getApiKey("deepseek");
  return new OpenAI({ baseURL: "https://api.deepseek.com/v1", apiKey });
}

export async function callDeepSeek(opts: LLMCallOptions): Promise<LLMResponse> {
  const client = await getClient();
  const response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0,
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
