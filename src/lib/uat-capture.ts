import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface CaptureArgs {
  agent: string;
  model: string;
  provider: string;
  params: { temperature: number; max_tokens: number };
  inputId?: string;
  systemPrompt: string;
  userPrompt: string;
  retrievedContext?: string;
  rawResponse?: string;
  stopReason?: string;
  output?: unknown;
  latencyMs: number;
  error?: string;
}

/**
 * Writes one evidence record per LLM call when UAT_CAPTURE=1.
 * A no-op (zero latency) when the env var is absent.
 * Failures are swallowed — capture must never break a user request (AC-8.6).
 */
export function captureEvidence(args: CaptureArgs): void {
  if (process.env.UAT_CAPTURE !== "1") return;

  try {
    const dir = process.env.UAT_CAPTURE_DIR ?? "/tmp/uat/evidence";
    fs.mkdirSync(dir, { recursive: true });

    const runId = crypto.randomUUID();
    const record = {
      run_id: runId,
      timestamp: new Date().toISOString(),
      agent: args.agent,
      model: args.model,
      model_version: args.model,
      provider: args.provider,
      params: args.params,
      input_id: args.inputId ?? null,
      system_prompt: args.systemPrompt,
      user_prompt: args.userPrompt,
      retrieved_context: args.retrievedContext ?? null,
      raw_response: args.rawResponse ?? null,
      stop_reason: args.stopReason ?? null,
      output: args.output ?? null,
      latency_ms: args.latencyMs,
      error: args.error ?? null,
    };

    const filename = `${Date.now()}_${args.agent}_${runId.slice(0, 8)}.json`;
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(record, null, 2), "utf8");
  } catch {
    // Swallow — capture failure must never propagate to the caller (AC-8.6)
  }
}
