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
  /** Sampling temperature. Defaults to 0 for all deterministic agents (AC-1.2). */
  temperature?: number;
  /** Logical agent name — used for evidence capture tagging (AC-8.4). */
  agent?: string;
  /** Caller-supplied correlation id for the input document / form submission (AC-8.4). */
  inputId?: string;
  /** Assembled evidence / retrieved context string — captured separately from the user message (AC-8.5). */
  retrievedContext?: string;
}

export interface LLMResponse {
  text: string;
  /** Normalized: "end_turn" | "max_tokens" regardless of provider */
  stopReason: "end_turn" | "max_tokens" | string;
}
