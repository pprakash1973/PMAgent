# Requirements Baseline — PM Agent

**Version:** 1.0  
**Baseline date:** 2026-08-08  
**Baseline commit:** to be tagged `uat-cycle-2` after WP-1 clean tree is confirmed  
**Source PRD:** `docs/PRD-UAT-Remediation.md`  
**Status:** Draft — pending product-owner approval (see §0)  

---

## 0. Approval

| Role | Name | Date | Signature |
|---|---|---|---|
| Product Owner | ___________________ | ___________________ | ___________________ |
| Reviewer | ___________________ | ___________________ | ___________________ |

---

## 1. Purpose

This document is the ratified requirements baseline for UAT Cycle 2. Every requirement carries a stable ID, a testable acceptance criterion, and a named enforcement mechanism. It is the reference document for all UAT sign-off decisions.

---

## 2. Guardrail Requirements (REQ-GR)

These requirements derive directly from the 12 guardrails in `src/lib/guardrails.ts`.

| ID | Requirement | Acceptance Criterion | Enforcement | Notes |
|---|---|---|---|---|
| REQ-GR-01 | Inputs must be sufficient for generation before the model is called | `runGuardrails()` returns a non-empty `issues[]` and generation is aborted when required fields are missing | code | Pre-flight check in `src/lib/guardrails.ts`. Preserved by C-8. |
| REQ-GR-02 | Generated artifacts must match the requested artifact type | `artifacts[].artifactType` in AI response matches the requested type or generation fails | prompt + code | Schema validated by `ArtifactBaseSchema`. |
| REQ-GR-03 | Cost and schedule actuals used in status reports must come from the live data store, not model inference | `spi` and `cpi` in persisted records equal computed values from `scheduleTasks`/`costEntries`; model is never used as a fallback source | code | `assertStatusIntegrity()` enforces this. DEF-002 remediated in WP-3. |
| REQ-GR-04 | Risk ratings must use project-defined scales | Risk artifacts contain only rating values from the project's configured scale | prompt | Enforcement via system prompt only. |
| REQ-GR-05 | Artifact content must cite its inputs | Generated artifacts reference the context documents or data objects provided in the prompt | prompt | AC-8.5 ensures `retrieved_context` is populated in evidence. |
| REQ-GR-06 | Timeline estimates must not exceed the project end date without flagging | Milestone and schedule artifacts with dates beyond `project.endDate` include an explicit conflict entry | prompt + code | `conflicts[]` required in every agent schema (WP-3). |
| REQ-GR-07 | Budget figures must be in the project currency and within budget | Cost artifacts use `project.currency`; values above `project.budget` produce a conflict entry | prompt | Enforcement via system prompt. |
| REQ-GR-08 | Stakeholder names must come from the project record, not be invented | Stakeholders in artifacts match `project.stakeholders`; additions are flagged as assumptions | prompt | |
| REQ-GR-09 | Methodology-specific terminology must match the project methodology | WBS for Waterfall; backlog/sprint for Agile; artifacts use correct vocabulary | prompt | |
| REQ-GR-10 | Confidence must not be self-assessed by the model | No `confidence` field in any agent response schema or prompt; health score computed deterministically | code | `confidence` removed from all schemas (WP-5). DEF-004/005/006 remediated. |
| REQ-GR-11 | RAG status must respect SPI/CPI thresholds: SPI<0.85 or CPI<0.9 → amber or red; SPI<0.70 → red | `assertStatusIntegrity()` upgrades model RAG verdict when measured metrics violate thresholds; violations persisted | code | Critical. DEF-002 remediated in WP-3. `violations` column added to `StatusReport`. |
| REQ-GR-12 | Health score must be computed from measured inputs, not model inference | `computeHealthScore()` formula: Schedule 35 pts, Cost 30 pts, Overdue tasks 20 pts, Open risks 15 pts | code | DEF-006 remediated in WP-5. |

---

## 3. Functional Requirements (REQ-FN)

| ID | Requirement | Acceptance Criterion | Enforcement | Notes |
|---|---|---|---|---|
| REQ-FN-01 | Deterministic AI output — temperature=0 on all deterministic agents | `artifact`, `nl_project`, `requirements`, `status_summary`, `status_questions`, `schedule_recovery` call the model with `temperature: 0`; 5 identical inputs produce identical structured-field outputs | code | DEF-001 remediated in WP-2. |
| REQ-FN-02 | Evidence capture — every model call writes a complete evidence envelope when `UAT_CAPTURE=1` | Record contains all 14 required fields (run_id, timestamp, agent, model, model_version, provider, params, input_id, system_prompt, user_prompt, retrieved_context, raw_response, stop_reason, latency_ms) | code | DEF-008 remediated in WP-2. No-op when `UAT_CAPTURE` unset. |
| REQ-FN-03 | Capture never breaks a user request | Unwritable `UAT_CAPTURE_DIR` does not propagate an error; the LLM call result is still returned | code | C-4 constraint. `try/catch` in `captureEvidence()` swallows all errors. |
| REQ-FN-04 | JSON extraction uses last-match to handle prose preamble | `extractJson()` returns the last well-formed JSON object in the response string | code | DEF-007 partial remediation. |
| REQ-FN-05 | Every agent response includes `assumptions[]` and `conflicts[]` arrays | All 5 agent Zod schemas declare `assumptions: z.array(z.string())` and `conflicts: z.array(z.string())` as required fields | code | DEF-009 remediated in WP-3. |
| REQ-FN-06 | Requirements extraction processes up to 100,000 characters without silent truncation | `extractRequirements()` accepts up to 100k chars; `sourceCharsProcessed` and `sourceCharsTotal` returned so callers can surface a UI warning | code | DEF-003 remediated in WP-4. |
| REQ-FN-07 | Model-supplied CPI/SPI fallbacks removed from status route | `route.ts` never reads `aiResult.cpi` or `aiResult.spi`; only `computedSpi`/`computedCpi` from schedule data are used | code | DEF-004 remediated in WP-5. |
| REQ-FN-08 | Per-agent model tier restrictions enforced | Critical agents (`artifact`, `status_summary`, `requirements`, `schedule_recovery`) restricted to Balanced/Latest/Quality/Smart tiers; Fast-tier models blocked; admin UI shows "Uncertified" badge for out-of-tier selections | code | DEF-010 remediated in WP-6. |
| REQ-FN-09 | Temperature configurable per agent via admin UI | Admin model-config page exposes a temperature input (0–1, step 0.05) per agent; persisted to `ModelConfig.temperature`; used by `resolveModel()` | code | DEF-001 / AC-1.4. |
| REQ-FN-10 | Build is reproducible — clean tree, tagged, `.gitignore` complete | `git status --porcelain` empty; `uat-cycle-2` tag resolves; `.env*`, `.next/`, `*.tsbuildinfo`, `dev.db` in `.gitignore`; no `.env*` secrets tracked | process | DEF-011/012 remediated in WP-1. |

---

## 4. Open defect cross-reference

All 12 UAT Cycle 1 defects map to a requirement above. None is left with enforcement `none` without an associated remediation work package.

| Defect | Severity | Requirement | WP | Status |
|---|---|---|---|---|
| DEF-001 | Critical | REQ-FN-01 | WP-2 | Remediated |
| DEF-002 | Critical | REQ-GR-11 | WP-3 | Remediated |
| DEF-003 | Major | REQ-FN-06 | WP-4 | Remediated |
| DEF-004 | Major | REQ-FN-07 | WP-5 | Remediated |
| DEF-005 | Major | REQ-GR-10 | WP-5 | Remediated |
| DEF-006 | Major | REQ-GR-12 | WP-5 | Remediated |
| DEF-007 | Major | REQ-FN-04, REQ-FN-05 | WP-3 | Remediated |
| DEF-008 | Critical | REQ-FN-02, REQ-FN-03 | WP-2 | Remediated |
| DEF-009 | Major | REQ-FN-05 | WP-3 | Remediated |
| DEF-010 | Major | REQ-FN-08, REQ-FN-09 | WP-6 | Remediated |
| DEF-011 | Major | REQ-FN-10 | WP-1 | Remediated (this document) |
| DEF-012 | Major | REQ-FN-10 | WP-1 | Remediated (clean tree + tag) |
