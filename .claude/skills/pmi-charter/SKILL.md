---
name: pmi-charter
description: "Use this skill whenever the user wants to create a Project Charter, project initiation document, or stakeholder register. Trigger on /Charter, 'start a new project', 'initiate a project', 'create a charter', 'define project scope and objectives for CXO approval', or any request to document project authorization. Produces a McKinsey-style CXO PPTX charter deck and a structured XLSX stakeholder register. Based on PMBOK® processes 4.1 (Develop Project Charter) and 10.1 (Identify Stakeholders)."
---

# PMI Charter Skill — /Charter

Produces two artifacts:
1. **Project Charter Deck** (`.pptx`) — McKinsey-style, CXO-ready, 8–10 slides
2. **Stakeholder Register** (`.xlsx`) — structured per PMBOK 10.1

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full official name |
| Client / Sponsor | Organization and executive sponsor name + title |
| Business Case | Why this project exists — the strategic problem or opportunity |
| Project Objectives | 3–5 SMART objectives |
| Scope (In / Out) | Key deliverables in scope; explicit exclusions |
| Constraints | Budget ceiling, deadline, regulatory, resource limits |
| Assumptions | What must be true for the project to succeed |
| High-Level Risks | 3–5 top risks at initiation |
| Stakeholders | Names, roles, departments, influence/interest level |
| Milestones | Major phases and target dates |
| Project Manager | Name and contact |

If the user provides a project description (even brief), infer missing fields and confirm before proceeding.

---

## Step 2 — Create the Charter Deck (PPTX)

Use `pptxgenjs` (Node.js). Install with `npm install -g pptxgenjs` if needed.

### Slide Structure

| # | Slide Title | Content |
|---|-------------|---------|
| 1 | Cover | Project name, client logo placeholder, sponsor, PM, date — dark full-bleed background |
| 2 | Executive Summary | 3-column: Business Problem / Solution Approach / Expected Outcome. Large stat callouts for budget, timeline, team size |
| 3 | Strategic Alignment | How project maps to corporate objectives. Icon grid or 2×2 matrix |
| 4 | Project Scope | In-scope vs. out-of-scope. Two-column layout with clear boundary line |
| 5 | Objectives & Success Criteria | 3–5 objectives in numbered cards with measurable KPIs |
| 6 | Key Milestones & Timeline | Horizontal timeline with 5–7 milestones. Phase bands in accent color |
| 7 | Stakeholder Overview | Influence/Interest matrix (2×2 grid) with stakeholder names plotted |
| 8 | Top Risks at Initiation | 3–5 risk cards: Risk / Probability / Impact / Initial Response |
| 9 | Budget & Resources | High-level budget breakdown bar/waterfall. Contingency reserve called out |
| 10 | Authorization | Signature blocks for Sponsor, PM, and key stakeholders. Footer with document control |

### Design Standards (McKinsey / CXO)
- **Palette**: Midnight Executive (`1E2761` navy primary, `CADCFC` ice-blue accent, `FFFFFF` white)
- **Typography**: Georgia 40pt titles, Calibri 14pt body
- **Dark slide**: Cover and final slide use full navy background with white text
- **No bullets on cover/exec summary** — use cards, callouts, large numbers
- **Every slide needs one visual** — icon, shape, chart, or matrix; no text-only slides
- **Slide footer**: Project name | Confidential | Date | Page number
- Follow all design rules from the pptx skill (no accent lines under titles, no cream backgrounds, no decorative bars)

### Creation Approach
```javascript
// Use pptxgenjs
const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
// Build each slide per template above
pptx.writeFile({ fileName: "Project-Charter-[ProjectName].pptx" });
```

After generating, run visual QA:
```bash
python /path/to/pptx/scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```
Inspect for overflow, overlap, and missing content. Fix before delivering.

---

## Step 3 — Create the Stakeholder Register (XLSX)

Use `openpyxl`. Create a single workbook with two sheets.

### Sheet 1: Stakeholder Register

| Column | Content |
|--------|---------|
| ID | S-001, S-002, … |
| Name | Full name |
| Title / Role | Job title |
| Organization | Department or company |
| Contact | Email |
| Influence Level | High / Medium / Low |
| Interest Level | High / Medium / Low |
| Engagement Level | Unaware / Resistant / Neutral / Supportive / Leading |
| Key Concerns | Free text |
| Communication Approach | How and how often to engage |
| Notes | Additional context |

Formatting:
- Row 1: Bold header, navy fill (`1E2761`), white text, 12pt
- Alternate row shading (light blue `EBF3FB` vs white)
- Freeze row 1; auto-filter on all columns
- Column widths: ID=8, Name=20, Title=22, Org=20, Contact=25, all others=18

### Sheet 2: Influence-Interest Matrix

Create a visual 2×2 matrix table:
- Axes: Interest (Low→High, columns) × Influence (Low→High, rows)
- Four quadrants: Monitor / Keep Informed / Keep Satisfied / Manage Closely
- Place stakeholder names in the appropriate quadrant cell
- Color-code each quadrant distinctly

After creating, run formula recalc if any formulas present:
```bash
python /path/to/xlsx/scripts/recalc.py Stakeholder-Register-[ProjectName].xlsx
```

---

## Step 4 — Deliver

Save both files to the outputs folder using the naming convention:
- `Project-Charter-[ProjectName]-[YYYY-MM-DD].pptx`
- `Stakeholder-Register-[ProjectName]-[YYYY-MM-DD].xlsx`

Present both files to the user and summarize: project name, sponsor, objectives count, stakeholder count, key milestones.

---

## PMI Process Mapping
- **4.1** Develop Project Charter → Charter deck
- **10.1** Identify Stakeholders → Stakeholder register
- **Inputs used**: Project statement of work, business case, enterprise environmental factors
- **Tools applied**: Expert judgment, stakeholder analysis
