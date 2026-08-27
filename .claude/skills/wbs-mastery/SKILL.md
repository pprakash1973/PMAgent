---
name: wbs-mastery
description: "Use this skill whenever the user wants to create, review, or improve a Work Breakdown Structure using real-world best practices from Liliana Buchtik's 'Secrets to Mastering the WBS' (PMI). Trigger on /WBS-Pro, 'create a WBS', 'work breakdown structure', 'decompose the scope', 'break down deliverables', 'is my WBS correct', 'review my WBS', 'WBS dictionary', 'scope baseline', or any request to define what a project will deliver. Also trigger when a user describes scope-creep problems, unclear scope, or 'customer expected a castle, we planned a house' situations — the WBS is the remedy. Produces a deliverable-oriented XLSX WBS (tree + tabular views), WBS dictionary, and a quality-checklist audit. Enforces the 100% rule at every level, noun-based naming, and discrete vs level-of-effort component typing."
---

# WBS Mastery Skill — /WBS-Pro

Creates (or audits) a **deliverable-oriented** Work Breakdown Structure following the practices in *Secrets to Mastering the WBS in Real-World Projects* (Liliana Buchtik, PMI, 2nd ed.), aligned with the PMI Practice Standard for WBS.

**Two modes:**
- **CREATE** — build a new WBS from a project description → XLSX workbook
- **AUDIT** — review a user-supplied WBS against the quality checklist → scored findings + corrected WBS

Reference files (read when needed):
- `references/methodology.md` — the Bg® 20 steps, decomposition rules, structuring approaches, agile handling
- `references/pm-decomposition-template.md` — the full Project Management element decomposition (Appendix I) to reuse in every WBS
- `references/quality-checklist.md` — the 16-point core-quality checklist used for the audit sheet

---

## Non-Negotiable Rules (apply in both modes)

1. **Deliverable-oriented, never task-oriented.** Components are outcomes (nouns + adjectives): "Requirements Document", "Cover Design File" — never verbs/activities ("Write requirements", "Design cover"). If the user supplies verbs, convert them to the deliverable the verb produces.
2. **100% rule at EVERY level.** Each parent = exactly the sum of its children — no missing work, no extra work, no overlap/redundancy between components. Verify level by level, not just at the top.
3. **Include Project Management** as a Level-2 component in every WBS (it's a level-of-effort element). Decompose it using `references/pm-decomposition-template.md`, scaled to project size.
4. **Component typing.** Mark every component **Discrete** (tangible, measurable end product/service/result) or **LoE** (level of effort — support work with no definitive end product). Test: "Can I measure, verify, or deliver this?" Yes → Discrete.
5. **Work packages = lowest level of each branch.** A parent with children is never a work package. Branches may stop at different depths — that is correct, not an error.
6. **Stop decomposing when all four are YES** for a component:
   - Can it be assigned to one owner?
   - Can the team estimate its cost and duration?
   - Can activities and milestones be derived from it?
   - Can it be monitored and controlled?
   Guidance: ≥3 levels for projects of meaningful size/complexity (≥2 minimum for small or outsourced pieces); outsourced components stay high-level (the vendor decomposes their own WBS); don't over-decompose — excessive detail makes control cost more than it's worth.
7. **WBS IDs**: hierarchical numbering (1, 1.1, 1.1.1 …). Assign IDs **last**, after the structure is agreed, to avoid renumbering rework. Start at 1 (some tools reject 0). For programs, prefix per project (e.g., `MKT.1.2`, `FIN.1.3`).
8. **The WBS is not a schedule.** No dependencies, no dates, no sequencing logic in the WBS itself. Scope first; schedule later, derived from work packages.

---

## Mode: CREATE

### Step 1 — Gather Inputs (Bg® Steps 1–7)

Ask for or infer: project name and objective; scope statement / requirements (or a description); known major deliverables; what's explicitly OUT of scope; team/owners if known; whether any component is outsourced; whether this is part of a program (→ ID prefixes); preferred structuring approach.

**Choose the structuring approach** (see `references/methodology.md` for details): by **major deliverables** (default, most common), by **project phases**, by **subprojects**, by **geography**, by **department** (only when deliverables map cleanly to one unit), or a **hybrid**. State your choice and why in one sentence; confirm with the user before building if inputs were thin.

For agile/iterative components: decompose only the next iteration's deliverables in detail; keep future iterations at high level.

### Step 2 — Decompose (Bg® Steps 8–14)

1. Level 1 = project name (single component, ID 1).
2. Level 2 = major deliverables per chosen approach + `1.x Project Management` (LoE).
3. Decompose branch by branch until the four stop-questions all pass.
4. Run the **100% check at every level** — write the check explicitly (e.g., "Spanish Manuscript = TOC + Introduction + Chapters + Conclusion + Appendices + References ✓").
5. Check naming: nouns/adjectives only; consistent convention; duplicate names allowed only under different parents (prefer avoiding).
6. Assign attributes: Owner (always), plus optional Est. Cost / Effort as available. Component + attributes = WBS Element.
7. Assign WBS IDs last.

### Step 3 — Build the XLSX Workbook

Read `/mnt/skills/public/xlsx/SKILL.md` first, then build with openpyxl. If the user follows UST brand standards (check for the ust-brand-guidelines skill), apply UST colors; otherwise use the palette below.

File name: `WBS-[ProjectName]-[YYYY-MM-DD].xlsx`

**Sheet 1 — WBS Tree (tabular representation of the tree):**

| Column | Content |
|--------|---------|
| WBS ID | 1, 1.1, 1.1.1 … |
| Level | 1–n |
| Component Name | Indented 2 spaces per level, noun-based |
| Type | Discrete / LoE |
| Work Package? | Yes if lowest level of branch |
| Owner | Person/team accountable |
| Est. Effort (h) | Work packages only; parents = `=SUM()` of children |
| Est. Cost | Work packages only; parents = `=SUM()` of children |
| 100% Check | For each parent: "= child + child + …" verification note |

Formatting: Level 1 bold navy fill white text; Level 2 bold medium-blue fill white text; Level 3 light-blue fill; work packages white with dotted-border style cue; LoE rows italic. Freeze header row; auto-filter. Include a level legend block (Bg® Step 12).

**Sheet 2 — WBS Dictionary** (one row per work package; minimum fields per Buchtik = WBS ID, Component Name, Description):

| WBS ID | Component Name | Work Description (statement of work — the key field) | In Scope | Out of Scope | Acceptance Criteria | Owner | Est. Effort | Est. Cost | Assumptions |

**Sheet 3 — Quality Audit:** the 16-point checklist from `references/quality-checklist.md` with Pass/Fail per item and remediation notes. All items must be Pass before delivery.

**Sheet 4 — Scope Baseline Summary:** counts (components, work packages, levels, deepest branch), effort/cost rollups via formulas, work-package distribution by Level-2 branch, and a note: "Scope baseline = Scope Statement + WBS + WBS Dictionary. Changes after approval go through formal change control."

Run the xlsx recalc script per the xlsx skill before delivering.

### Step 4 — Deliver (Bg® Steps 15–20)

Present the file and remind the user of the remaining human steps: review with the team and stakeholders (the WBS should be created by those performing the work), obtain approval, communicate the scope, then link the WBS to schedule and cost. Offer to iterate — the WBS evolves with progressive elaboration until baselined.

---

## Mode: AUDIT

When the user provides an existing WBS (file, table, or text):

1. Read `references/quality-checklist.md` and score every item Pass/Fail with evidence.
2. Flag the classic defects specifically:
   - Task/verb-oriented components → show the noun conversion
   - 100% rule violations (missing scope, overlap, parent ≠ sum of children) per level
   - Missing Project Management branch
   - Schedule content leaking in (dependencies, dates)
   - Parents wrongly treated as work packages
   - Vague components that fail the "can two stakeholders picture different cars?" test — a WBS that can't answer basic scope questions (how many doors? luxury or compact?) hasn't defined scope
3. Produce a corrected WBS via CREATE Mode Step 3, plus a findings summary (severity-ranked).
