# PRD — UAT Cycle 1 Remediation

**Status:** Draft for build
**Audience:** Claude Code (implementing agent) and the reviewing engineer
**Source:** UAT Cycle 1 independent review, 2026-08-08 — 4 Critical, 8 Major defects, gate verdict FAIL
**Baseline reviewed:** commit `b4a2a4c` plus 278 uncommitted modifications
**Target:** UAT Cycle 2 reaches PASS or PASS WITH CONDITIONS

---

## 1. Purpose

PM Agent generates project artifacts, status reports and RAG health verdicts using LLM calls, and those outputs reach PM, Program and Executive dashboards. The system has a well-specified set of guardrails (GR-1 → GR-12, `src/lib/guardrails.ts`). Almost none of them are enforced in code — they exist only as system-prompt text, and the model's compliance is never verified before its output is persisted and displayed.

This PRD specifies the work required to close all 12 defects from UAT Cycle 1. It has two objectives:

1. **Make model output verifiable.** Today nothing records what was sent to a model or what came back, so no claim can be grounded and no hallucination can be proven or disproven after the fact.
2. **Make guardrails mechanical.** A guardrail written in a prompt is a request. A guardrail asserted in code is a control. The high-value work is converting GR-3, GR-10, GR-11 and GR-12 from the first into the second.

### 1.1 How to use this document

Each work package below is self-contained and states its own acceptance criteria. Work packages must be completed **in numerical order** — WP-2 unblocks the verification of everything after it.

Every acceptance criterion is written to be checkable. Do not mark a criterion met because the code looks correct; run the stated verification and paste the output into the PR description.

### 1.2 Supporting files

All verification tooling referenced below lives in `docs/uat/`:

| File | Purpose |
|---|---|
| `docs/uat/validate_uat.py` | Deterministic checker. Schema, grounding, reconciliation, cross-field threshold and stability checks. Exit code 1 on any Critical finding. |
| `docs/uat/uat_config.pm-agent.json` | Config tuned to the `status_summary` agent, with GR-11 encoded as a mechanical threshold rule. Add sibling configs per agent as WP-3 lands. |
| `docs/uat/CAPTURE_LAYER_SPEC.md` | Reference implementation for WP-2, including the exact wrapper for `callLLM`. |
| `docs/uat/UAT_Runbook.md` | Full cycle procedure, for the reviewer rather than the implementer. |

Run commands from the repository root unless stated otherwise. The checker needs Python 3.8+ and no third-party packages.

---

## 2. Global constraints

These are non-negotiable and apply to every work package.

| # | Constraint |
|---|---|
| C-1 | **Do not change any system prompt or guardrail wording** unless a work package explicitly instructs it. The prompts are the specification; this programme adds enforcement around them, it does not rewrite them. |
| C-2 | **Do not weaken a guardrail to make a test pass.** If a guardrail cannot be satisfied, stop and raise it rather than relaxing the threshold. |
| C-3 | **No behaviour change in production paths beyond what is specified.** Capture and validation must be additive. |
| C-4 | **Capture and validation must never break a user request.** All capture failures are swallowed and logged; validation failures surface as structured errors, never as a 500. |
| C-5 | **No new runtime dependencies.** `zod@^4.4.3` is already present and is the mandated validation library. `vitest` may be added as a devDependency (WP-2). |
| C-6 | **Every changed file must pass `npm run lint` and `npx tsc --noEmit`.** |
| C-7 | **Do not modify `prisma/migrations/*` history.** New migrations only. |
| C-8 | **Preserve the existing pre-flight `runGuardrails()` behaviour.** It works; this programme adds post-flight checks alongside it, it does not replace it. |

---

## 3. Global definition of done

A work package is complete when **all** of the following hold:

1. Every acceptance criterion in the package is met and its verification command output is recorded.
2. `npm run lint` passes with no new warnings.
3. `npx tsc --noEmit` passes.
4. Unit tests for the package pass (`npx vitest run`, available from WP-2 onward).
5. The change is committed with the defect ID in the subject line, e.g. `fix(DEF-002): enforce GR-11 RAG thresholds in code`.
6. No unrelated files are modified.

---

## 4. Work packages

### WP-1 — Establish a reproducible build (DEF-012, DEF-011)

**Severity:** Major · **Depends on:** nothing · **Effort:** ~half day

#### DEF-012 — No identifiable build under test

**Current behaviour.** 278 files are modified relative to `HEAD` (`b4a2a4c`) and a stash is outstanding (`stash@{0}` on `feature/ai-assistant`). The artefact under review corresponds to no commit, so a finding cannot be pinned to a version and a retest cannot reproduce the same build.

**Required behaviour.** Every UAT cycle runs against a tagged, clean tree.

**Acceptance criteria**

- **AC-12.1** `git status --porcelain` returns empty output on the branch under test.
- **AC-12.2** The build under test is tagged `uat-cycle-2`; `git describe --tags --exact-match` resolves.
- **AC-12.3** `.gitignore` covers every generated artefact currently showing as modified — verify `tsconfig.tsbuildinfo`, `.next/`, `dev.db`, `prisma/dev.db` and all `.env*` variants are ignored.
- **AC-12.4** No `.env*` file containing a real secret is tracked. Run `git ls-files | grep -E '^\.env'` and confirm only `.env.example` is listed.

> AC-12.4 is a security check, not hygiene. Confirm it before tagging.

#### DEF-011 — No PRD exists

**Current behaviour.** The repository contains no requirements document. UAT Cycle 1 used GR-1 → GR-12 plus `README.md` as a substitute baseline. Requirements that exist only inside a completed build cannot be independently verified — a reviewer can only check the system against itself.

**Required behaviour.** A ratified requirements baseline exists in the repository and is the reference for UAT Cycle 2.

**Acceptance criteria**

- **AC-11.1** `docs/REQUIREMENTS-BASELINE.md` exists, created from **Appendix A** of this document.
- **AC-11.2** Every requirement carries a stable ID (`REQ-GR-01` … `REQ-GR-12`, `REQ-FN-01` …), a testable acceptance criterion, and a named enforcement mechanism (`code` | `prompt` | `both` | `none`).
- **AC-11.3** No requirement is left with enforcement `none` without an accompanying open defect ID.
- **AC-11.4** The product owner has recorded approval in the document header.

**Out of scope.** Writing new product requirements. This captures what the system already claims to do.

---

### WP-2 — Determinism and evidence capture (DEF-001, DEF-008)

**Severity:** Critical · **Depends on:** WP-1 · **Effort:** ~half day

> This is the highest-leverage package in the programme. Until it lands, no other fix can be verified empirically and UAT Phases 2, 3.4, 3.5 and 3.6 cannot run at all.

#### DEF-001 — Temperature never set; output is non-deterministic

**Current behaviour.** `LLMCallOptions` (`src/lib/providers/types.ts:9-14`) declares no `temperature`. None of the three adapters pass one:

- `src/lib/providers/anthropic.ts:12` — `client.messages.create({ model, max_tokens, system, messages })`
- `src/lib/providers/openai.ts:12` — `client.chat.completions.create({...})`
- `src/lib/providers/deepseek.ts:12` — `client.chat.completions.create({...})`

The Anthropic API defaults to `temperature: 1.0` when omitted. Every artifact, status report, RAG verdict and health score is therefore non-deterministic. Identical inputs produce different executive reports, audit reproducibility is impossible, and stability testing would measure the sampling temperature rather than model reliability.

**Required behaviour.** Temperature is explicit on every call, defaults to `0`, and is recorded in the evidence envelope.

**Acceptance criteria**

- **AC-1.1** `LLMCallOptions` declares `temperature?: number`, `agent?: string` and `inputId?: string`.
- **AC-1.2** All three adapters pass `temperature: opts.temperature ?? 0` to their provider SDK.
- **AC-1.3** These agents resolve to `temperature: 0`: `artifact`, `nl_project`, `requirements`, `status_summary`, `status_questions`, `schedule_recovery`. `chat` and `portfolio_chat` may differ but must be explicit.
- **AC-1.4** Temperature is configurable per agent via the existing `ModelConfig` admin path, defaulting to `0`. Add the column in a new migration (C-7).
- **AC-1.5** **Determinism check.** Submit an identical status-report input 5 times at `temperature: 0`. `ragStatus`, `healthScore`, `spi` and `cpi` are byte-identical across all 5 runs.

  ```bash
  # after WP-2 capture is live
  python docs/uat/validate_uat.py --evidence /tmp/uat/evidence \
                         --config docs/uat/uat_config.pm-agent.json --out ./res
  # stability.csv must show stability_rate 1.0 for the compared fields
  ```

> AC-1.5 may still fail on free-text fields (`summary`, `metricsNarrative`) even at temperature 0 — greedy decoding is near-deterministic, not guaranteed. Only the four structured fields listed are in scope.

#### DEF-008 — No prompt or response evidence is captured

**Current behaviour.** Nothing persists the system prompt, user prompt, retrieved chunks, model version or raw response for any call. `prisma/schema.prisma` has `groundingScore` (line 475) and `evidenceReadinessScore` (line 287) but no call-level record. An artifact cannot be traced to the context that produced it.

**Required behaviour.** Every model call writes one complete evidence record.

**Implementation site.** `src/lib/providers/index.ts` → `callLLM()` (line 12) and `streamLLM()` (line 30). These are the only paths to any model across all three providers. **Do not instrument `src/lib/ai.ts`** — it has nine call sites and they will drift.

**Acceptance criteria**

- **AC-8.1** New module `src/lib/uat-capture.ts` exports `captureEvidence(args)`.
- **AC-8.2** `callLLM` and `streamLLM` invoke it in a `finally` block so failed calls are captured too.
- **AC-8.3** Capture is gated behind `process.env.UAT_CAPTURE === "1"` and is a no-op otherwise. Confirm zero measurable latency change when unset.
- **AC-8.4** Each record contains, at minimum: `run_id`, `timestamp`, `agent`, `model`, `model_version`, `provider`, `params` (including `temperature` and `max_tokens`), `input_id`, `system_prompt`, `user_prompt`, `retrieved_context`, `raw_response`, `stop_reason`, `output` (parsed), `latency_ms`, `error`.
- **AC-8.5** **`retrieved_context` is populated.** `formatEvidenceForPrompt()` (`src/lib/evidence-assembler.ts:125`) output reaches the record wherever evidence assembly is used. This is the criterion most likely to be quietly skipped.
- **AC-8.6** Capture failure never propagates. Force a write error (unwritable `UAT_CAPTURE_DIR`) and confirm the user request still succeeds.
- **AC-8.7** Running `validate_uat.py` against a freshly captured directory produces **no** `NO_GROUNDING_TEXT` finding.

  ```bash
  export UAT_CAPTURE=1 UAT_CAPTURE_DIR=/tmp/uat/evidence
  npm run dev
  # generate one status report through the UI
  python docs/uat/validate_uat.py --evidence /tmp/uat/evidence \
                         --config docs/uat/uat_config.pm-agent.json --out ./res
  # a NO_GROUNDING_TEXT finding means AC-8.5 is incomplete
  ```

- **AC-8.8** `vitest` added as a devDependency with a `test` script; at least one unit test covers `captureEvidence` shape and its no-op path.

> **Deployment note.** Vercel's filesystem is ephemeral and writable only under `/tmp`. File-based capture is acceptable for dev-server UAT — pull the directory before the container recycles. If capture is wanted beyond the dev server, add an `AiCall` Prisma model; the record shape above maps to columns directly.

**Out of scope.** Capturing in production. Retention policy. UI for browsing evidence.

---

### WP-3 — Enforce the guardrails in code (DEF-002, DEF-009, DEF-007)

**Severity:** Critical / Major · **Depends on:** WP-2 · **Effort:** ~2 days

#### DEF-002 — GR-11 not enforced; model RAG status persisted unchecked

**Severity: Critical. Highest business impact in this programme.**

**Current behaviour.** `runGuardrails()` (`src/lib/guardrails.ts:82`) is pre-flight only — it checks input sufficiency before generation. After generation, `aiResult.ragStatus` is written directly to:

- `src/app/api/projects/[id]/status/route.ts:114` — preview response
- `:125` — `StatusReport.ragStatus`
- `:132` — `HealthScore.ragStatus`
- `:143` — `project.healthStatus`, which drives the PM, Program and Executive dashboards

GR-11 states: *"If SPI < 0.85 or CPI < 0.9, status MUST be amber or red."* Nothing verifies this. A model returning `green` for a project at SPI 0.62 is believed and propagated to executives.

`computedSpi` is assigned at line 76 and used for the `spi` column at line 133; `computedCpi` at line 84. **The data required to enforce GR-11 is already in scope in the same function and is never compared against `ragStatus`.**

**Required behaviour.** RAG status is derived from measured thresholds. The model's verdict is an input to that decision, never the final word.

**Acceptance criteria**

- **AC-2.1** New exported function `assertStatusIntegrity(aiResult, evm)` in `src/lib/status-integrity.ts` returns `{ ragStatus, violations: string[] }`.
- **AC-2.2** Rules enforced, using computed values in preference to model-reported ones:
  - `ragStatus === "green"` and `spi < 0.85` → override to `amber`, or `red` if `spi < 0.70`
  - `ragStatus === "green"` and `cpi < 0.90` → override to `amber`
  - Each override appends a human-readable string to `violations`
- **AC-2.3** Called immediately after `parseAIJson` in `generateStatusSummary` (`src/lib/ai.ts:239`), or in the status route before any persistence. The corrected value is used at **all four** sites (114, 125, 132, 143).
- **AC-2.4** `violations` is persisted on the `StatusReport` row (new nullable JSON column, new migration).
- **AC-2.5** **The override rate is queryable.** Overrides are a directly measured hallucination metric — the rate at which the model ignores an explicit, unambiguous, in-context instruction. Expose it as a count in the admin area or a documented SQL query.
- **AC-2.6** Unit tests cover: green at SPI 0.62 → amber; green at SPI 0.55 → red; green at CPI 0.85 → amber; green at SPI 0.95 and CPI 0.95 → unchanged; null SPI and CPI → unchanged, no violation.
- **AC-2.7** Adversarial case ADV-004 passes: a status submission with SPI 0.62 and uniformly upbeat PM answers yields amber or red.

**Related fix — computed CPI never reaches the prompt.** The route builds `liveEVM` including `ac` and `cpi` (`src/app/api/projects/[id]/status/route.ts:86`), but `generateStatusSummary`'s parameter type (`src/lib/ai.ts:199-203`) declares only `{ pv, ev, sv, spi, overdueTasks }`, and the `evmSection` template renders PV, EV, SV, SPI and overdue count — **not CPI**. The computed CPI is passed in and silently dropped, leaving the model to infer a value it was handed.

- **AC-2.8** The `liveEVM` parameter type includes `ac` and `cpi`, and `evmSection` renders CPI and AC with the same "use these numbers directly, do not invent alternatives" instruction already applied to SPI.

#### DEF-009 — GR-8, GR-10 and GR-12 demand fields no schema declares

**Current behaviour.** `GUARDRAIL_SYSTEM_ADDENDUM` (`src/lib/guardrails.ts:199`) requires:

- GR-10.3 — all `[ASSUMPTION]` and `<TBD>` items summarised in an `assumptions` array
- GR-12 — conflicting inputs surfaced in a `conflicts` array
- GR-8 — every estimate states its basis (`analogous | parametric | three-point | bottom-up`)

None of the per-agent response schemas declare these fields. `generateStatusSummary` lists nine fields (`src/lib/ai.ts:216-231`); none is `assumptions` or `conflicts`. No code checks for them. The guardrails are unenforceable as written and their absence is invisible.

**Acceptance criteria**

- **AC-9.1** Every JSON-producing agent's declared response schema includes `assumptions: string[]` and `conflicts: string[]`.
- **AC-9.2** Both arrays are **required**. An empty array is a claim ("I found no conflicts"); a missing field is a gap. They must be distinguishable.
- **AC-9.3** Cost and duration estimate objects carry a `basis` field constrained to the four GR-8 values.
- **AC-9.4** Absence of `assumptions` or `conflicts` after parsing fails validation (see DEF-007).
- **AC-9.5** Adversarial case ADV-006 passes: a requirements document stating two different go-live dates yields both dates in `conflicts`, and neither is silently chosen.

#### DEF-007 — Unsafe JSON extraction and no post-parse schema validation

**Current behaviour.** `extractJson` (`src/lib/ai.ts:11-20`) tries a fenced ```` ```json ```` block, then falls back to first-balanced-brace matching. Prose containing braces before the payload yields the wrong object. `parseAIJson` (`src/lib/ai.ts:23-28`) then returns `Record<string, unknown>` cast directly to a typed interface, so a missing or wrong-typed field surfaces as `undefined` at render time rather than as an error.

The existing `stopReason === "max_tokens"` truncation guard is **correct and must be preserved.**

**Acceptance criteria**

- **AC-7.1** A zod schema exists per JSON-producing agent in `src/lib/schemas/`.
- **AC-7.2** `parseAIJson` accepts a zod schema and returns a typed, validated result. No `as unknown as` casts remain on AI responses.
- **AC-7.3** Validation failure throws a structured error naming the offending field and the raw response is written to the evidence record.
- **AC-7.4** `extractJson` prefers the **last** balanced JSON object when no fenced block is present, since preamble prose precedes the payload far more often than trailing prose follows it.
- **AC-7.5** The `max_tokens` truncation guard is unchanged.
- **AC-7.6** Unit tests cover: fenced block; bare JSON; prose-with-braces preamble; truncated response; schema-invalid response.
- **AC-7.7** Adversarial case ADV-013 passes.

---

### WP-4 — Input integrity (DEF-003)

**Severity:** Critical · **Depends on:** WP-2 · **Effort:** ~1 day

#### DEF-003 — Requirements input silently truncated at 12,000 characters

**Current behaviour.** `extractRequirements` (`src/lib/ai.ts:289`) passes `text.slice(0, 12000)`. A 40-page requirements document is cut to roughly its first 8 pages. The returned `goals`, `scopeItems`, `outOfScope`, `stakeholders`, `constraints` and `risks` present as a complete extraction with no truncation flag. Downstream Charter, WBS and traceability artifacts inherit the omission, and the loss is invisible at every step.

This is the H5 (silent omission) failure mode and it is the most damaging class in the system, because the output looks complete.

**Required behaviour.** The full document is processed, or the caller is told plainly that it was not.

**Acceptance criteria**

- **AC-3.1** The hardcoded 12,000-char slice is removed.
- **AC-3.2** Documents exceeding the per-call limit are chunked and processed map-reduce style, merging extracted arrays with de-duplication. The `DocumentChunk` model already exists and should be used.
- **AC-3.3** If chunking is not implemented in this package, oversized input **fails loudly** with an actionable error. Silent truncation is not an acceptable interim state.
- **AC-3.4** The response includes `sourceCharsProcessed` and `sourceCharsTotal`.
- **AC-3.5** `sourceCharsProcessed < sourceCharsTotal` surfaces a visible warning in the UI, not only in the payload.
- **AC-3.6** Adversarial case ADV-007 passes: a ~90,000-character requirements document is either fully processed or explicitly rejected.
- **AC-3.7** Audit every other `.slice(` on model input for the same pattern. `src/lib/ai.ts:260` caps the task breakdown at `tasks.slice(0, 10)` in `generateScheduleRecovery` — assess whether that cap is disclosed to the model and to the user, and disclose it if not.

---

### WP-5 — Metric integrity (DEF-004, DEF-005, DEF-006)

**Severity:** Major · **Depends on:** WP-3 · **Effort:** ~1.5 days

#### DEF-004 — CPI fallback allows a fabricated cost index

**Current behaviour.** `src/app/api/projects/[id]/status/route.ts:117` and `:134` use `computedCpi ?? aiResult.cpi ?? …`, so a CPI computed from cost entries correctly takes precedence. The defect is the fallback: when no cost entries exist, `computedCpi` is null and the **model's inferred `cpi` is persisted to `HealthScore` and rendered identically to a measured one.** A reader cannot distinguish them.

The prompt (`src/lib/ai.ts:226`) invites this: *"cpi (number | null): cost performance index if derivable from answers, else null."* CPI = EV / AC and is not derivable from narrative answers. This contradicts GR-3 and GR-8 in the same system prompt.

The adjacent `spi` line (`src/lib/ai.ts:227`) carries the same fallback — *"use the live SPI value if provided, else derive from PM answers"* — and is covered by AC-4.4.

**Acceptance criteria**

- **AC-4.1** `cpi` is removed from the `generateStatusSummary` response schema. The model no longer supplies it.
- **AC-4.2** `HealthScore.cpi` is populated **only** from `computedCpi`. When no cost entries exist it is `null`.
- **AC-4.3** The UI renders null CPI as "Not measurable — no cost entries recorded", never as a blank or a zero.
- **AC-4.4** Apply the same treatment to `spi`: the `aiResult.spi` fallback at `:116` and `:133` is removed once WP-3 AC-2.8 confirms computed SPI reaches the prompt.
- **AC-4.5** Adversarial case ADV-008 passes: a status report with no cost figures yields `cpi: null` and no inferred value anywhere in the payload or narrative.

> **Principle.** A measured value and an inferred value must never occupy the same field. If both are wanted, they need separate fields with distinct labels.

#### DEF-005 — Self-reported confidence surfaced as a quality signal

**Current behaviour.** `extractRequirements` (`src/lib/ai.ts:268`) returns a model-assessed `confidence` 0–1, declared at `src/lib/ai.ts:282`. LLM self-assessed confidence is not a measurement and is generally poorly calibrated, but it is presented to PMs as if it indicates extraction quality.

**Acceptance criteria**

- **AC-5.1** `confidence` is either removed, or replaced with a **measured** signal: the proportion of extracted items for which a verbatim source span can be located in the uploaded document. `DocumentChunk` already supports this.
- **AC-5.2** If a measured signal is implemented, it is named distinctly (e.g. `groundedItemRatio`) and its definition is documented in `docs/REQUIREMENTS-BASELINE.md`.
- **AC-5.3** No model-self-assessed score is displayed as a quality indicator anywhere in the UI.

#### DEF-006 — healthScore has no documented methodology

**Current behaviour.** A 0–100 composite generated by the model (`src/lib/ai.ts:221`), persisted to `HealthScore.compositeScore`, and shown on executive dashboards. No requirement defines its inputs or weighting, so it cannot be validated, reproduced, or defended to a client who asks how it was derived.

**Acceptance criteria**

- **AC-6.1** Either (a) `healthScore` is computed in code from measured inputs — SPI, CPI, overdue task count, open risk exposure, milestone slippage — with the formula documented in `docs/REQUIREMENTS-BASELINE.md`; or (b) it is labelled indicative in the UI and excluded from any ranking, sorting or filtering.
- **AC-6.2** Option (a) is strongly preferred. A number that ranks projects for executives should be reproducible.
- **AC-6.3** If (a), identical inputs produce an identical score, and unit tests pin at least three worked examples.
- **AC-6.4** `02_ReverseTrace` items ITM-002, ITM-005 and ITM-006 are closed, or given an authorising requirement in the baseline.

**Also in scope.** `estimatedRecovery` (`src/lib/ai.ts:253`) returns a recovery duration with no estimating basis, contradicting GR-8. Either attach a `basis` field per AC-9.3 or label it indicative.

---

### WP-6 — Model governance (DEF-010)

**Severity:** Major · **Depends on:** WP-2, WP-3 · **Effort:** ~1 day

#### DEF-010 — Same guardrails sent to all providers regardless of capability

**Current behaviour.** GR-1 → GR-12 are appended to the system prompt for Anthropic, OpenAI and DeepSeek alike (`src/lib/providers/index.ts:12-22`). `AVAILABLE_MODELS` (`src/lib/model-router.ts:29-43`) offers ten models spanning four capability tiers, and `admin/model-config` allows any model to be assigned to any agent — Haiku 4.5 and Opus 4.8 are equally selectable for `status_summary`. Compliance with a 12-clause instruction set varies materially by model and tier. No per-model compliance evidence exists.

**Acceptance criteria**

- **AC-10.1** A repeatable compliance harness runs a fixed adversarial set (ADV-004, ADV-006, ADV-008, ADV-009, ADV-014) against each model in `AVAILABLE_MODELS` for each agent it may serve.
- **AC-10.2** Results are recorded per model and agent: guardrail violation rate, GR-11 override rate, schema validation failure rate.
- **AC-10.3** `admin/model-config` restricts the selectable model list per agent to those meeting a documented threshold.
- **AC-10.4** Selecting a model with no compliance evidence shows an explicit warning.
- **AC-10.5** Adversarial case ADV-012 passes: the same status input yields the same RAG verdict across every permitted model.

> This is what makes cheaper tiers safe to use. Without it, model selection is a cost decision with an unmeasured accuracy consequence.

---

## 5. Verification protocol

Run after every work package, and in full before requesting UAT Cycle 2.

```bash
# 1. static
npm run lint
npx tsc --noEmit

# 2. unit
npx vitest run

# 3. capture a fresh evidence set
export UAT_CAPTURE=1 UAT_CAPTURE_DIR=/tmp/uat/evidence
rm -rf /tmp/uat/evidence && npm run dev
#    exercise: 5x identical status report, 1x oversized requirements doc,
#              1x contradictory requirements doc, 1x no-cost-entries project

# 4. deterministic checks
python docs/uat/validate_uat.py --evidence /tmp/uat/evidence \
                       --config docs/uat/uat_config.pm-agent.json --out ./uat_results
echo "exit=$?"   # 0 required
```

**Exit criteria for UAT Cycle 2 readiness**

| Check | Required |
|---|---|
| `validate_uat.py` Critical findings | 0 |
| `NO_GROUNDING_TEXT` findings | 0 |
| `THRESHOLD_VIOLATION` findings | 0 |
| Stability rate, structured fields | 1.00 |
| Adversarial cases passing | 15 / 15 |
| Requirement coverage | 100%, none BLOCKED |
| Open Critical defects | 0 |

---

## 6. Sequencing and effort

| WP | Defects | Severity | Depends on | Effort |
|---|---|---|---|---|
| WP-1 | DEF-011, DEF-012 | Major | — | 0.5 d |
| WP-2 | DEF-001, DEF-008 | Critical | WP-1 | 0.5 d |
| WP-3 | DEF-002, DEF-007, DEF-009 | Critical / Major | WP-2 | 2 d |
| WP-4 | DEF-003 | Critical | WP-2 | 1 d |
| WP-5 | DEF-004, DEF-005, DEF-006 | Major | WP-3 | 1.5 d |
| WP-6 | DEF-010 | Major | WP-2, WP-3 | 1 d |

**Total ≈ 6.5 days.** WP-2 is the constraint — nothing downstream is verifiable until it lands. WP-3 carries the most business risk reduction.

---

## Appendix A — Requirements baseline (source for `docs/REQUIREMENTS-BASELINE.md`)

Derived from `src/lib/guardrails.ts` and `README.md`. Enforcement column reflects the **target** state after this programme.

| ID | Requirement | Acceptance criterion | Enforcement (target) |
|---|---|---|---|
| REQ-GR-01 | Generation is blocked when project input is insufficient | `GuardrailError` before any LLM call | code (exists) |
| REQ-GR-02 | Mandatory project fields present per artifact type | Missing field blocks generation | code (exists) |
| REQ-GR-03 | No fabricated names, dates, costs, metrics or percentages; missing data marked `[ASSUMPTION]` or `<TBD>` | Every figure traceable to input context; `assumptions[]` populated | both (WP-3) |
| REQ-GR-04 | Prerequisite artifact sequence enforced; status artifacts require a baseline | Out-of-sequence generation blocked | code (exists) |
| REQ-GR-05 | Traceability matrix requires a requirements document | Blocked without `RequirementsDocument` | code (exists) |
| REQ-GR-07 | Every artifact maps to its governing PMBOK process | PMBOK citation present in output | both (WP-3) |
| REQ-GR-08 | Every estimate states its basis; single-point estimates carry a range | `basis` field constrained to four values | both (WP-3, WP-5) |
| REQ-GR-09 | Baseline figures never silently modified; deltas flagged `[CHANGE]` | `[CHANGE]` marker present on baseline deltas | both (WP-3) |
| REQ-GR-10 | Mandatory sections populated; totals reconcile; exactly one RACI Accountable; assumptions summarised | Schema validation + reconciliation assertions pass | code (WP-3) |
| REQ-GR-11 | RAG derives from thresholds, not preference. SPI < 0.85 or CPI < 0.9 ⇒ amber or red | `assertStatusIntegrity` overrides and logs violations | code (WP-3) |
| REQ-GR-12 | Conflicting inputs surfaced in `conflicts[]`, never silently resolved | `conflicts[]` required and validated | code (WP-3) |
| REQ-FN-01 | AI generates the PMBOK artifact catalogue | Each type produces schema-valid output | code (WP-3) |
| REQ-FN-02 | Natural-language project creation infers structured fields | Inferred fields traceable to the brief | prompt + review |
| REQ-FN-03 | Weekly status produces summary, RAG and recommendations grounded in PM Q&A and live EVM | Computed EVM reaches the prompt and is not overridden | code (WP-3) |
| REQ-FN-04 | Requirements extraction processes the whole document | `sourceCharsProcessed == sourceCharsTotal`, or explicit rejection | code (WP-4) |
| REQ-FN-05 | Artifact versioning: every edit creates an immutable version | `ArtifactVersion` row per edit | code (exists) |
| REQ-NF-01 | AI output is reproducible for audit | Identical input ⇒ identical structured output | code (WP-2) |
| REQ-NF-02 | AI output is traceable to the prompt and context that produced it | Complete evidence record per call | code (WP-2) |
| REQ-NF-03 | Model selection per agent is backed by compliance evidence | Compliance thresholds enforced in admin | code (WP-6) |

> **Approval:** _Product Owner ______________________  Date _____________

---

## Appendix B — Files in scope

| File | Work packages |
|---|---|
| `src/lib/providers/types.ts` | WP-2 |
| `src/lib/providers/anthropic.ts` · `openai.ts` · `deepseek.ts` | WP-2 |
| `src/lib/providers/index.ts` | WP-2, WP-6 |
| `src/lib/uat-capture.ts` *(new)* | WP-2 |
| `src/lib/status-integrity.ts` *(new)* | WP-3 |
| `src/lib/schemas/*.ts` *(new)* | WP-3 |
| `src/lib/ai.ts` | WP-3, WP-4, WP-5 |
| `src/lib/model-router.ts` | WP-2, WP-6 |
| `src/lib/evidence-assembler.ts` | WP-2 |
| `src/app/api/projects/[id]/status/route.ts` | WP-3, WP-5 |
| `src/app/admin/model-config/page.tsx` | WP-2, WP-6 |
| `prisma/schema.prisma` + new migrations | WP-2, WP-3 |
| `docs/REQUIREMENTS-BASELINE.md` *(new)* | WP-1 |

**Explicitly not in scope:** `src/lib/guardrails.ts` prompt text (C-1), existing `runGuardrails()` pre-flight logic (C-8), migration history (C-7).
