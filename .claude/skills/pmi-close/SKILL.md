---
name: pmi-close
description: "Use this skill whenever the user wants to create a project close report, lessons learned document, project retrospective, final project report, or post-implementation review. Trigger on /LessonsLearned, /Close, 'project close report', 'lessons learned', 'post-implementation review', 'PIR', 'retrospective', 'final project report', 'project closure', 'close the project', or any request to formally conclude a project and capture learnings. Produces a McKinsey-style CXO PPTX project close deck and an XLSX lessons learned register. Based on PMBOK® process 4.6 (Close Project or Phase)."
---

# PMI Close Skill — /LessonsLearned

Produces two artifacts:
1. **Project Close Deck** (`.pptx`) — McKinsey-style, CXO-ready, 8–10 slides
2. **Lessons Learned Register** (`.xlsx`) — structured capture for organizational knowledge

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Project Sponsor | Executive sponsor name and title |
| Project Manager | PM name |
| Start / End Dates | Actual project dates |
| Project Objectives | Original objectives (from charter if available) |
| Objectives Achieved | Which objectives were met / partially met / not met |
| Final Budget | Budget at completion (BAC) vs. actual final cost |
| Final Schedule | Planned end date vs. actual end date |
| Key Deliverables | List of deliverables and acceptance status |
| Stakeholder Satisfaction | Survey results or qualitative feedback |
| Key Accomplishments | Top 3–5 successes / highlights |
| Challenges | Key issues encountered and how resolved |
| Lessons Learned | What the team would do differently (successes and improvements) |
| Outstanding Items | Any open items, risks, or handover actions |
| Benefits Realization | Expected business value / ROI if available |

---

## Step 2 — Create the Close Deck (PPTX)

Use `pptxgenjs`.

### Slide Structure

| # | Slide | Content |
|---|-------|---------|
| 1 | Cover | Project name, "Project Close Report", date, sponsor, PM — celebratory dark background (navy or deep teal) |
| 2 | Project at a Glance | 3-column summary: Planned vs. Actual (Duration, Cost, Scope). Large stat callouts. Overall outcome badge: Successful / Partially Successful / Challenged |
| 3 | Objectives Achievement | Table: Objective / Status (✓ Met / ⚠ Partial / ✗ Not Met) / Notes. Color-coded rows. % of objectives met as large KPI callout |
| 4 | Deliverables Summary | Table: Deliverable / Accepted (Yes/No) / Acceptance Date / Notes. Include total accepted vs. total planned |
| 5 | Schedule & Cost Performance | Two-column: Schedule KPIs (Planned vs. Actual dates, SPI) + Cost KPIs (Budget vs. Actual, CPI, Final Variance). Bar chart comparing plan vs. actual |
| 6 | Key Accomplishments | 3–5 accomplishment cards with icon + bold headline + 1-2 sentence description. Green accents. Celebratory tone |
| 7 | Challenges & How We Overcame Them | 3-column cards: Challenge / Impact / How Resolved. Amber/orange accent. Balanced and factual |
| 8 | Top Lessons Learned | 4–6 insight callouts split: "What Worked Well" (green) vs. "What To Do Differently" (blue). No blame — forward-looking framing |
| 9 | Benefits Realization | Expected vs. realized business value. If not yet measurable, show the measurement plan and timeline |
| 10 | Handover & Next Steps | Outstanding items with owner and due date. Transition plan. Formal closure statement with sponsor signature block |

### Design Standards
- **Palette**: Deep teal/navy for gravitas: `065A82` (deep blue), `1C7293` (teal), `02C39A` (mint accent)
- Cover: full dark background, white text — conveys completion with authority
- Accomplishments slide: slightly warmer — green accents signal success
- No decorative bars, no accent lines under titles
- Footer: project name, date, "CONFIDENTIAL"
- Follow all pptx skill design rules

### Creation Approach
```javascript
const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.writeFile({ fileName: "Close-Report-[ProjectName]-[YYYY-MM-DD].pptx" });
```

After generating, run visual QA:
```bash
python /path/to/pptx/scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

---

## Step 3 — Create the Lessons Learned Register (XLSX)

### Sheet 1: Lessons Learned Register

| Column | Content |
|--------|---------|
| LL # | LL-001, LL-002, … |
| Date Captured | Date |
| Captured By | Name and role |
| Project Phase | When this lesson was relevant |
| Knowledge Area | Integration / Scope / Time / Cost / Quality / HR / Communication / Risk / Procurement |
| Category | Process / Technology / People / Tools / Governance |
| Type | Success (do more) / Improvement (do differently) |
| Lesson Title | Short title (≤10 words) |
| Situation | What was the context |
| Action Taken | What was done |
| Result | What happened |
| Lesson | What the team learned |
| Recommendation | Specific recommendation for future projects |
| Applicability | Applicable to: All Projects / Similar Projects / This Project Type Only |
| Impact Level | High / Medium / Low |
| Status | Captured / Reviewed / Approved / Published |
| OPA Update | Has this updated organizational process assets? Yes / No |

Formatting:
- Row 1: Bold header, navy fill, white text
- Type column: conditional formatting — Success=green fill, Improvement=blue fill
- Impact Level: High=orange fill, Medium=yellow, Low=green
- Alternate row shading; auto-filter; freeze Row 1

### Sheet 2: Lessons Summary Dashboard

- Total lessons captured: `=COUNTA()`
- Successes vs. Improvements: `=COUNTIF()` per Type
- Breakdown by Knowledge Area: mini pivot table with counts
- Breakdown by Phase: counts per phase
- Top 5 High-Impact Lessons: filtered list using `LARGE()` on impact scores

---

## Step 4 — Deliver

Save files as:
- `Close-Report-[ProjectName]-[YYYY-MM-DD].pptx`
- `Lessons-Learned-[ProjectName]-[YYYY-MM-DD].xlsx`

Present both to the user with: final outcome summary, % objectives achieved, cost and schedule variance, and count of lessons learned by type.

---

## PMI Process Mapping
- **4.6** Close Project or Phase → Full close deck + formal closure
- **10.5** Report Performance → Objectives and deliverables status
- **7.3** Control Costs → Schedule & cost performance slide
- **Inputs**: Project management plan, accepted deliverables, organizational process assets
- **Tools**: Expert judgment, performance measurement
- **Outputs**: Final product/service transition, organizational process assets updates (lessons learned)
