# DEF-008 Remediation Spec — Evidence Capture Layer

**For the build session, not the reviewer.** This is the single change that unblocks UAT Phases 2, 3.4, 3.5 and 3.6.

## Why here

`src/lib/providers/index.ts` → `callLLM()` and `streamLLM()` are the only paths to any model across Anthropic, OpenAI and DeepSeek. Wrapping these two functions captures every call in the platform. Do not instrument `src/lib/ai.ts` — there are nine call sites and they will drift.

One caveat: `src/lib/ai.ts:9` constructs a bare `new Anthropic(...)` client outside the provider layer. Check whether anything still calls it directly; if so, route it through `callLLM` or it will be invisible to capture.

## Change 1 — carry temperature and an agent label (fixes DEF-001 at the same time)

`src/lib/providers/types.ts`

```ts
export interface LLMCallOptions {
  model: string;
  maxTokens: number;
  system: string;
  messages: LLMMessage[];
  temperature?: number;   // NEW — default 0 for every extraction/status agent
  agent?: string;         // NEW — AgentId, for grouping evidence
  inputId?: string;       // NEW — stable id for the logical input; enables stability testing
}
```

Then pass it through in `providers/anthropic.ts`:

```ts
const message = await client.messages.create({
  model: opts.model,
  max_tokens: opts.maxTokens,
  temperature: opts.temperature ?? 0,     // Anthropic defaults to 1.0 if omitted
  system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
  messages: opts.messages,
});
```

Mirror this in the OpenAI and DeepSeek adapters. Set `temperature: 0` for `artifact`, `requirements`, `status_summary`, `status_questions` and `schedule_recovery`. Leave `chat` and `portfolio_chat` configurable.

> Without this, stability testing measures your sampling temperature, not your model's reliability.

## Change 2 — wrap the two router functions

`src/lib/providers/index.ts`

```ts
import { captureEvidence } from "@/lib/uat-capture";

export async function callLLM(
  opts: import("./types").LLMCallOptions,
  config: AgentConfig
): Promise<import("./types").LLMResponse> {
  const started = Date.now();
  let response: import("./types").LLMResponse | undefined;
  let error: unknown;
  try {
    switch (config.provider) {
      case "anthropic": response = await callAnthropic(opts); break;
      case "openai":    response = await callOpenAI(opts);    break;
      case "deepseek":  response = await callDeepSeek(opts);  break;
      default:
        throw new Error(`Unknown LLM provider: "${config.provider}". Check model-router config.`);
    }
    return response;
  } catch (e) {
    error = e;
    throw e;
  } finally {
    // Never let capture failure break a user request.
    void captureEvidence({ opts, config, response, error, latencyMs: Date.now() - started });
  }
}
```

Apply the same wrapper to `streamLLM`.

## Change 3 — the capture module

`src/lib/uat-capture.ts` (new)

```ts
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { AgentConfig } from "@/lib/model-router";
import type { LLMCallOptions, LLMResponse } from "@/lib/providers/types";

const ENABLED = process.env.UAT_CAPTURE === "1";
const DIR = process.env.UAT_CAPTURE_DIR ?? "/tmp/uat/evidence";

export interface CaptureArgs {
  opts: LLMCallOptions;
  config: AgentConfig;
  response?: LLMResponse;
  error?: unknown;
  latencyMs: number;
  retrievedContext?: string[];   // see Change 4
  parsedOutput?: unknown;        // see Change 5
}

export async function captureEvidence(a: CaptureArgs): Promise<void> {
  if (!ENABLED) return;
  try {
    const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
    const record = {
      run_id: runId,
      timestamp: new Date().toISOString(),
      agent: a.opts.agent ?? "unknown",
      model: a.config.model,
      model_version: a.config.model,
      provider: a.config.provider,
      params: {
        temperature: a.opts.temperature ?? 0,
        max_tokens: a.opts.maxTokens,
      },
      input_id: a.opts.inputId ?? "unknown",
      system_prompt: a.opts.system,
      user_prompt: a.opts.messages.map(m => `${m.role}: ${m.content}`).join("\n\n"),
      retrieved_context: a.retrievedContext ?? [],
      raw_response: a.response?.text ?? null,
      stop_reason: a.response?.stopReason ?? null,
      output: a.parsedOutput ?? null,
      latency_ms: a.latencyMs,
      error: a.error ? String(a.error) : null,
    };
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${runId}.json`),
                       JSON.stringify(record, null, 2), "utf-8");
  } catch {
    // Capture is diagnostic. It must never surface to the user.
  }
}
```

**On Vercel**, the filesystem is ephemeral and read-only outside `/tmp`. For dev-server UAT that is fine — pull the directory before the container recycles. For anything longer-lived, add an `AiCall` Prisma model and write rows instead; the record shape above maps to columns directly.

## Change 4 — pass the retrieved context

The critical field, and the one that gets skipped. `assembleEvidence()` in `src/lib/evidence-assembler.ts` already builds an `EvidenceContext` of `DocumentChunk` rows. Whatever `formatEvidenceForPrompt()` returns must reach the capture record, because that string is the *only* thing a claim can legitimately be grounded against.

Simplest route: add `retrievedContext?: string[]` to `LLMCallOptions` and populate it wherever `formatEvidenceForPrompt` is called, then copy it into the record in `captureEvidence`.

> Without `retrieved_context` you cannot tell a hallucination from a faithful summary of a bad source chunk. `validate_uat.py` raises a Critical `NO_GROUNDING_TEXT` finding for any run missing it — deliberately.

## Change 5 — capture the parsed output, not just raw text

`parseAIJson()` in `src/lib/ai.ts:23` already sits between the raw response and the caller. Have it return the parsed object *and* hand it to the capture record, so `validate_uat.py` can run schema and reconciliation checks without re-parsing.

## Change 6 — fix DEF-002 while you are in there

This is independent of capture and has the largest business impact. In `generateStatusSummary`, after `parseAIJson`:

```ts
function assertStatusIntegrity(
  r: { ragStatus: string; spi: number | null; cpi: number | null },
  liveEVM?: { spi: number | null }
): { ragStatus: string; violations: string[] } {
  const violations: string[] = [];
  const spi = liveEVM?.spi ?? r.spi;
  let ragStatus = (r.ragStatus ?? "").toLowerCase();

  // GR-11: thresholds decide RAG, not the model's disposition.
  if (ragStatus === "green" && spi != null && spi < 0.85) {
    violations.push(`GR-11: green returned with SPI ${spi.toFixed(2)} (< 0.85)`);
    ragStatus = spi < 0.7 ? "red" : "amber";
  }
  if (ragStatus === "green" && r.cpi != null && r.cpi < 0.9) {
    violations.push(`GR-11: green returned with CPI ${r.cpi.toFixed(2)} (< 0.9)`);
    ragStatus = "amber";
  }
  return { ragStatus, violations };
}
```

Persist `violations` on the `StatusReport` row. **The override rate is a direct, continuously-measured hallucination metric** — it tells you how often the model ignores an explicit, unambiguous instruction, and it costs nothing to collect once this is in.

## Verify the capture works before trusting it

```bash
export UAT_CAPTURE=1 UAT_CAPTURE_DIR=/tmp/uat/evidence
npm run dev
# generate one status report through the UI, then:
ls /tmp/uat/evidence/ && cat /tmp/uat/evidence/*.json | head -50

python validate_uat.py --evidence /tmp/uat/evidence \
                       --config uat_config.pm-agent.json --out ./uat_results
```

A `NO_GROUNDING_TEXT` finding on the first run means Change 4 is incomplete. Fix that before proceeding — everything downstream depends on it.

## Effort

| Change | Size |
|---|---|
| 1 — temperature + labels | ~20 lines across 4 files |
| 2 — router wrapper | ~25 lines |
| 3 — capture module | ~45 lines, new file |
| 4 — retrieved context | ~15 lines |
| 5 — parsed output | ~10 lines |
| 6 — GR-11 enforcement | ~30 lines |

Half a day, and UAT Cycle 2 becomes possible.
