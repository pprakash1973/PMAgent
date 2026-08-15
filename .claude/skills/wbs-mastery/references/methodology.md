# WBS Methodology Reference
Source: *Secrets to Mastering the WBS in Real-World Projects*, Liliana Buchtik (PMI, 2nd ed.), aligned with PMBOK® Guide and PMI Practice Standard for WBS.

## Why the WBS matters
Scope changes are among the top reasons projects fail (the "planned a house, delivered a castle" problem). The WBS is the cornerstone of scope management: define WHAT before WHEN. Cost, resource, and time estimates are unreliable when scope is unclear. Never build a schedule first and back into scope.

## Core vocabulary
- **Component**: any entry/box in the WBS at any level.
- **Element**: component + its attributes (owner, cost, etc.). Each element has exactly one parent.
- **Work package**: component at the lowest level of its branch. This is where you estimate, assign, and control. A parent with children is NOT a work package.
- **Discrete component**: tangible, measurable end product/service/result (a document, a design file, an application, a wheel).
- **Level of Effort (LoE) component**: support-type work with no definitive end product (project management, liaison, cost accounting). A WBS normally mixes both; Project Management is the canonical LoE component at Level 2. LoE components become discrete once you decompose them into their artifacts (plan, schedule, risk register, minutes…).

## The Bg® 20 Steps to Create a Valuable WBS
1. **Obtain inputs** — scope statement, scope management plan, requirements documentation, organizational process assets (templates, lessons learned) and environmental factors.
2. **Define the team** — stakeholders, team members, experts. The WBS is created by those performing the work, with stakeholder and expert input — not by the PM alone.
3. **Analyze the scope of work** — iterative identification of all work needed.
4. **Decide on templates** — reuse organizational or prior-project WBS templates as a starting point where they exist.
5. **Determine the approach/organization** — see Structuring Approaches below.
6. **Determine representation type** — tree, outline, or tabular. Tabular (spreadsheet) scales best and doubles as the dictionary base; tree is best for stakeholder communication of the top 2–3 levels.
7. **Determine software** — whatever tool; note some tools force WBS IDs to start at 1, not 0.
8. **Apply the decomposition technique** — break major deliverables into components, top-down, level by level, until manageable. ≥3 levels for meaningful projects.
9. **Apply the 100% rule** — parent = exactly sum of children; all the work and only the work; no redundancy or overlap. Check at EVERY level, not just the top.
10. **Check the level of decomposition** — every branch decomposed to the level needed to manage it; branches may differ in depth.
11. **Assign WBS IDs** — hierarchical numbering; do it LAST to avoid renumbering rework; program projects get prefixes (MKT.1.2).
12. **Insert level legend** — if levels are color-coded, add a legend.
13. **Check component naming** — nouns + adjectives, not verbs. Consistent convention. Same name under different parents is permitted but better avoided.
14. **Add attributes** — always add Owner (the owner co-decomposes their package); optionally cost/effort.
15. **Obtain stakeholder input** — iterate and revise until key stakeholders agree.
16. **Create the WBS dictionary** — in parallel with step 15. Minimum fields: WBS ID, component name, work description. The description is the key field — it is the statement of work that removes ambiguity. Suppress sensitive columns per audience.
17. **Obtain WBS approval** — after approval, all changes go through formal change control.
18. **Communicate the scope** — WBS + dictionary to all appropriate stakeholders.
19. **Link the WBS with schedule and costs** — work packages feed activity definition and cost accounts.
20. **Generate the scope baseline** — Scope Statement + WBS + WBS Dictionary. All future change requests are evaluated against it.

## Stopping the decomposition
Stop when all four are YES: assignable to one person? cost & duration estimable? activities/milestones derivable? monitorable & controllable? Rules of thumb exist (Kerzner: a typical work package ≈ 200–300 hours / ~2 weeks; the "8/80 hours" figure is a common misconception) but judgment beats rules. Depth guidance:
- ≥3 levels for projects of important dimension/complexity (US DoD recommends 3 in contractor WBSs); ≥2 minimum (Practice Standard) for small projects or outsourced components.
- Outsourced components stay high-level — the provider builds their own WBS under contract.
- Large/complex/unfamiliar projects need more depth; over-decomposition makes control unreasonably costly. Real-world WBSs commonly run 100+ components (e.g., a telecom project WBS with 139 components); complex branches may reach 6–8 levels.
- If information isn't available yet for a future piece, keep it high-level now and progressively elaborate (rolling wave).

## Structuring approaches (Level-2 organization)
The lowest levels are always deliverables regardless of the grouping above them.
1. **By major deliverables** (most common, default) — e.g., 1.1 Project Management, 1.2 Training, 1.3 Documentation, 1.4 Infrastructure, 1.5 Website.
2. **By project phases** — phases at Level 2 (Requirements, Design, Development, Test, Production…), deliverables below.
3. **By subprojects** — e.g., 1.1 Evaluation, 1.2 Pilot, 1.3 Release I, 1.4 Final Release; contracted subprojects get their own vendor WBS.
4. **By geographic location** — for global/virtual teams; group by country/region to ease coordination.
5. **By division/department** — only when deliverables map cleanly and solely to one unit; otherwise avoid.
6. **Hybrid** — combinations are valid.

## The "car test" for scope clarity
A WBS with only generic components (Wheels, Doors, Engine) cannot answer: how many doors? luxury or compact? modern or classic? sedan or roadster? If two stakeholders can picture two different products from your WBS, the scope is not defined. The WBS + dictionary must set boundaries like a map sets borders — what's inside, what's outside. This is the difference between a $17,000 Fiat and a $60,000 BMW living in different stakeholders' heads.

## WBS vs. schedule
The WBS contains no dependencies, dates, durations, or sequencing. Work packages are decomposed into activities/tasks later, in the schedule. Defining a project from a schedule instead of from the WBS is the most common malpractice this method exists to prevent.

## Agile / iterative work
The WBS is a predictive-planning tool. If part of the project uses agile: decompose only the next iteration's deliverables fully; keep future iterations' technology deliverables at a very high level, refining as iterations approach (rolling wave). Represent a feature backlog as a scope-management artifact where applicable.
