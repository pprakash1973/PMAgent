# UAT Runbook — Independent Hallucination Review of an LLM-Backed Application

**Scope:** an application built by Claude Code from a PRD, hosted on a dev server, calling Sonnet and Opus to produce structured JSON output.
**Objective:** establish, with evidence, that every output claim is grounded in the input actually supplied to the model, and that the build matches the PRD.
**Duration:** 2–3 days for a first cycle; ~half a day per regression cycle once the harness exists.

### Pack contents

| File | Use |
|---|---|
| `UAT_Hallucination_Review_Pack.xlsx` | Traceability, claim log, defect log, adversarial cases, stability, auto-calculated sign-off scorecard |
| `validate_uat.py` | Deterministic checker — schema, grounding, reconciliation, cross-field, stability |
| `UAT_Runbook.md` | This document |

### Roles

| Role | Who | Constraint |
|---|---|---|
| Build session | The Claude Code session that wrote the app | Adds the evidence capture layer. Takes no part in the review. |
| Independent reviewer | A **fresh** Claude Code session on a read-only clone | May not edit application code. |
| Second reviewer | A third session | Audits the reviewer, not the system. |
| Product owner | Human | Resolves UNTESTABLE requirements. Owns the gate. |

The separation is the whole method. A session that can fix a defect will fix it and mark PASS.

---

## Phase 0 — Prepare (30 min)

**0.1 Freeze the build.** Tag the commit under test. Every finding cites this tag.

```bash
git tag uat-cycle-1 && git rev-parse --short uat-cycle-1
```

**0.2 Create a read-only clone for the reviewer.** Physical separation beats an instruction not to edit.

```bash
git clone --branch uat-cycle-1 <repo-url> ../app-uat-review
cd ../app-uat-review && chmod -R a-w src/     # reviewer literally cannot write to the source
```

**0.3 Pin the models.** Record exact model strings (`claude-opus-5`, `claude-sonnet-5`), temperature, top_p, max_tokens and every prompt version. Set **temperature 0** for the review cycle — you cannot separate a hallucination from a sampling artefact at temperature 1.

**0.4 Agree the gate before you see any results.** Written into `07_Scorecard` already:

> **FAIL** if any open Critical defect, **or** hallucination rate > 2.0%, **or** requirement coverage < 100%, **or** any adversarial FAIL.
> **PASS WITH CONDITIONS** if no Critical but one or more Major open.
> **PASS** otherwise.

Get the product owner to acknowledge this in writing now. Gates agreed after results are gates that get negotiated.

---

## Phase 1 — Evidence capture (build session, 1–2 hours)

You cannot review a live demo. You review captured input/output pairs. Run this in the **build** session:

> Add a UAT capture layer to the dev environment only. For every model call, write one JSON file to `/uat/evidence/` containing: `run_id`, `timestamp`, `model`, `model_version`, `params` (temperature, top_p, max_tokens), `input_id`, `system_prompt`, `user_prompt`, `retrieved_context` (every chunk passed to the model), `source_documents` (full extracted text), `raw_response`, any post-processing applied, and the parsed `output`. Do not change any application logic or prompts. Gate it behind an env var `UAT_CAPTURE=1` so it never runs in production.

**The `retrieved_context` field is the one people omit, and omitting it invalidates the cycle.** Without it you cannot distinguish a hallucination from a correct summary of a bad source document. `validate_uat.py` raises a Critical `NO_GROUNDING_TEXT` finding for any run missing it — deliberately.

Then populate the directory:

```bash
export UAT_CAPTURE=1
# standard cases
for f in fixtures/standard/*; do curl -s -X POST http://dev-server:8080/analyse -F "file=@$f"; done
# stability: same input, 5 runs per model
for i in 1 2 3 4 5; do
  curl -s -X POST http://dev-server:8080/analyse -F "file=@fixtures/standard/contract_a.pdf" -F "model=opus"
  curl -s -X POST http://dev-server:8080/analyse -F "file=@fixtures/standard/contract_a.pdf" -F "model=sonnet"
done
ls /uat/evidence | wc -l
```

Copy `/uat/evidence` out of the server to the reviewer's machine. Treat it as immutable from here.

---

## Phase 2 — Deterministic checks (reviewer, 1 hour)

Run this **before** any human or model reading. It removes 60–70% of the findings from the judgement pile, and the ones it finds are the ones nobody argues about.

```bash
cd ../app-uat-review
python validate_uat.py --init                      # writes uat_config.json
```

Now tailor `uat_config.json` to your application — this is the only real setup work:

| Config block | What to put there |
|---|---|
| `output_schema` | Every authorised output field, its type, whether required, whether nullable. **Fields not listed are reported as `UNAUTHORIZED_FIELD`** — that is how invented scope surfaces. |
| `grounding.verbatim_string_fields` | Fields whose value must appear verbatim in the source (names, jurisdictions, party identifiers, cited clause references). Highest-yield automated check in the pack. |
| `reconciliation` | Every total that must equal the sum of its components. |
| `cross_field_rules` | Null-consistency: if a field is null or flagged insufficient, the narrative must not assert it. |
| `numeric_ranges`, `date_fields` | Sanity bounds. |
| `stability.compare_fields` | Fields that must be byte-identical across repeated runs of the same input. |

Smoke-test the harness against synthetic evidence with planted defects before trusting it on real data:

```bash
python validate_uat.py --make-samples ./sample_evidence
python validate_uat.py --evidence ./sample_evidence --config uat_config.json --out ./sample_results
# expect: 9 findings, 5 Critical, gate FAIL
```

Then run it for real:

```bash
python validate_uat.py --evidence /uat/evidence --config uat_config.json --out ./uat_results
echo "exit=$?"    # 0 = no Critical, 1 = Critical present
```

**Outputs → workbook:**

- `uat_results/findings.csv` → paste into `04_DefectLog` (and `03_ClaimLog` for the grounding findings)
- `uat_results/stability.csv` → paste into `06_ModelStability` columns A–E
- `uat_results/summary.json` → cross-check against `07_Scorecard`

A clean script run is **necessary, not sufficient.** It says nothing about narrative claims. Continue.

---

## Phase 3 — Independent reviewer session (2–4 hours)

Open a **new** Claude Code session in `../app-uat-review`. Never continue the build conversation. Run the prompts from `09_ReviewerPrompts` in order.

**3.1 Frame the session.** Prompt 1. Do not proceed until it confirms all four rules, especially: *its own world knowledge is not evidence*. That single instruction eliminates most H1/H2 misses — without it the model validates "State of New York is a valid jurisdiction" and passes a fabrication.

**3.2 Requirements extraction** → `01_Traceability` (prompt 3). Ambiguous PRD lines are marked `UNTESTABLE`, never guessed. Send the UNTESTABLE list to the product owner the same day; it is usually the long pole.

**3.3 Reverse trace** → `02_ReverseTrace` (prompt 4). Every field in the response schema must cite an authorising REQ-ID. This is where invented scope shows up — features nobody asked for, which nobody has tested, and which users will treat as authoritative.

**3.4 Claim-level grounding** → `03_ClaimLog` (prompt 5). The core of the cycle. One atomic claim per row, each with a quoted source or `NO SOURCE FOUND`.

Sample rather than boil the ocean: **every** claim from 5 representative runs, plus every claim in high-risk free-text fields across all runs. Free-text summary fields generate the overwhelming majority of findings — weight the sample there.

Watch for the reviewer drifting into charity as the log gets long. Re-issue the framing prompt every ~50 claims.

**3.5 Adversarial testing** → `05_AdversarialCases` (prompt 7). Fifteen cases are pre-written in the workbook. Build the fixtures once and they become your regression suite.

The case that matters most is **ADV-014, insufficient information**: give it a document that genuinely cannot answer the question. A confident answer is a **FAIL**. Most teams never test this and it is the failure mode that reaches production.

**3.6 Stability** → `06_ModelStability` (prompt 8). Import from `stability.csv`. Columns F–H calculate. Anything below 98% needs explanation before sign-off.

**3.7 Model comparison** (prompt 9). The commercial question: which fields can safely run on Sonnet, and which must stay on Opus. Answer it per-field, not per-application.

---

## Phase 4 — Report and gate (1 hour)

**4.1** Complete `04_DefectLog` from all sources. Severity here drives the gate.

**4.2** Open `07_Scorecard`. Every figure calculates from sheets 01/03/04/05/06 — do not type into columns C or D. Read the verdict in row 43.

**4.3** Generate the narrative report (prompt 10). Require the verdict in the first line, before any mitigating commentary. Reports that build to a verdict get read as a negotiation.

**4.4 Audit the reviewer** (prompt 11). A third session spot-checks 20 claims marked SUPPORTED and confirms the quoted source genuinely supports the claim *as written*. For client-facing or regulated output this step is not optional — reviewers pass things.

**4.5 Sign off** on `07_Scorecard` section G. Four signatures: independent reviewer, second reviewer, product owner, delivery manager.

---

## Phase 5 — Remediation and retest

Defects go to the **build** session, never the reviewer session. After fixes:

1. Re-tag (`uat-cycle-2`), re-clone, re-capture evidence.
2. Re-run `validate_uat.py` — regression is automatic.
3. Re-review **only** the claims touching changed fields, plus a 10% random re-sample of previously-passed claims to catch regressions.
4. Update `04_DefectLog` status; the scorecard recalculates.

---

## Making it stick

- **Wire `validate_uat.py` into CI** on the dev branch. Exit code 1 on Critical findings blocks the merge. Hallucination regression then costs minutes, not another UAT cycle.
- **Adversarial fixtures become the regression suite.** Every production incident adds a fixture.
- **Re-run the full cycle on every model version change.** A model upgrade is a code change to the riskiest component in the system, and it ships without your review.
- **Track hallucination rate as a trend**, not a snapshot. The direction between cycles tells you more than the absolute number.

## Common failure modes in the review itself

| Failure | Symptom | Fix |
|---|---|---|
| Reviewer fixes instead of reporting | Defect count suspiciously low; source files modified | Read-only clone; check `git status` on the review clone |
| Reviewer uses world knowledge as evidence | Claims marked SUPPORTED with no quote in the source column | Framing prompt; second-reviewer audit |
| No retrieved context captured | Everything unverifiable, or everything passes | `NO_GROUNDING_TEXT` Critical finding blocks the cycle |
| Only the happy path tested | Zero adversarial FAILs on the first cycle | Treat a 15/15 adversarial pass as a suspicious result, not a good one |
| Gate renegotiated after results | "Critical" defects reclassified as Major | Written pre-agreement in Phase 0.4 |
| Temperature > 0 during review | Findings unreproducible | Pin temperature 0; run stability separately |
