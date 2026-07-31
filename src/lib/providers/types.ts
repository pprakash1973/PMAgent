export type Provider = "anthropic" | "openai" | "deepseek";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  model: string;
  maxTokens: number;
  system: string;
  messages: LLMMessage[];
}

export interface LLMResponse {
  text: string;
  /** Normalized: "end_turn" | "max_tokens" regardless of provider */
  stopReason: "end_turn" | "max_tokens" | string;
}
