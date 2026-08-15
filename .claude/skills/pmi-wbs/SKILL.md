---
name: pmi-wbs
description: "Use this skill whenever the user wants to create a Work Breakdown Structure (WBS), decompose project deliverables into work packages, or generate a WBS dictionary. Trigger on /WBS, 'create a WBS', 'break down the project work', 'decompose deliverables', 'work breakdown', or any request to structure project scope into manageable pieces. Produces a hierarchical XLSX WBS with dictionary and scope baseline. Based on PMBOK® process 5.3 (Create WBS)."
---

# PMI WBS Skill — /WBS

Produces a single XLSX workbook with three sheets:
1. **WBS Hierarchy** — indented tree view with WBS codes
2. **WBS Dictionary** — detailed description per work package
3. **Scope Baseline Summary** — rollup for PM and sponsor review

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Project Phases | Major phases (e.g., Initiation, Planning, Design, Build, Test, Deploy, Close) |
| Major Deliverables | Key deliverables per phase |
| Work Packages | Lowest-level tasks (if known; otherwise generate from deliverables) |
| Responsible Teams | Functional team or person per deliverable |
| Constraints | Any scope exclusions to note in dictionary |

If only a project description is provided, generate a complete WBS using PMI decomposition best practices. Confirm with the user before writing.

---

## Step 2 — Build the WBS

### WBS Numbering Convention
Use hierarchical numeric coding:
```
1.0   Project Name
1.1   Phase 1
1.1.1 Deliverable 1.1
1.1.1.1 Work Package 1.1.1 ← lowest level, has effort/cost
1.1.2 Deliverable 1.2
1.2   Phase 2
...
```

Maximum 4 levels for most projects; 5 levels for complex programs.

### Decomposition Rules (per PMBOK 5.3)
- Decompose until each work package can be: estimated, scheduled, monitored, and assigned to one owner
- The 8/80 rule: work packages should take 8–80 hours (guide, not hard rule)
- Each child element total = parent (100% rule)
- Include project management as a WBS element (e.g., 1.1 Project Management)

---

## Step 3 — Create the XLSX Workbook

Use `openpyxl`. Three sheets:

### Sheet 1: WBS Hierarchy

| Column | Content |
|--------|---------|
| WBS Code | 1.0, 1.1, 1.1.1, etc. |
| WBS Level | 1, 2, 3, 4 |
| Element Name | Deliverable or work package name |
| Type | Summary / Work Package |
| Owner | Responsible team or individual |
| Est. Duration (days) | Estimate (work packages only) |
| Est. Effort (hours) | Estimate (work packages only) |
| Est. Cost ($) | Estimate (work packages only) |
| Notes | Any scope clarifications |

Formatting:
- Level 1 (project): Bold, navy fill (`1E2761`), white text, 13pt
- Level 2 (phases): Bold, steel-blue fill (`4472C4`), white text, 12pt
- Level 3 (deliverables): Bold, light-blue fill (`BDD7EE`), dark text, 11pt
- Level 4 (work packages): Normal weight, white fill, 11pt, left-indent 2 spaces per level
- Freeze Row 1; auto-filter
- Summary rows: Duration/Effort/Cost use `=SUM()` formulas over children

### Sheet 2: WBS Dictionary

One row per work package (Level 4 elements only):

| Column | Content |
|--------|---------|
| WBS Code | Reference code |
| Work Package Name | Name |
| Description | What work is included |
| In Scope | Explicit inclusions |
| Out of Scope | Explicit exclusions |
| Acceptance Criteria | How we know it's done |
| Owner | Assigned team/person |
| Dependencies | Predecessor WBS codes |
| Est. Duration | Days |
| Est. Effort | Hours |
| Est. Cost | $ |
| Assumptions | What must be true |
| Constraints | Limiting factors |

Formatting: Alternate row shading, wrap text on Description/Criteria columns, column widths appropriate to content.

### Sheet 3: Scope Baseline Summary

A summary dashboard with:
- Total work packages count
- Total estimated effort (hours) — `=SUM()` formula from Sheet 1
- Total estimated cost ($) — `=SUM()` formula from Sheet 1
- Work packages by phase (mini-table with phase name, count, hours, cost)
- A donut or bar chart showing effort distribution by phase (use openpyxl chart)

---

## Step 4 — Formula Recalculation

After creating the workbook:
```bash
python /path/to/xlsx/scripts/recalc.py WBS-[ProjectName]-[YYYY-MM-DD].xlsx
```
Fix any formula errors before delivering.

---

## Step 5 — Deliver

Save as: `WBS-[ProjectName]-[YYYY-MM-DD].xlsx`

Present to the user with a summary: total work packages, phases, total estimated effort/cost (if provided), and any assumptions made during decomposition.

---

## PMI Process Mapping
- **5.3** Create WBS → WBS Hierarchy + Dictionary
- **5.2** Define Scope → Scope Baseline Summary
- **Inputs used**: Project scope statement, requirements documentation
- **Tools applied**: Decomposition (top-down), WBS templates
- **Outputs**: WBS, WBS dictionary, Scope baseline
