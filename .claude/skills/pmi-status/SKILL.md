---
name: pmi-status
description: "Use this skill whenever the user wants to create a project status report, progress update, weekly or monthly project report, or executive briefing on project health. Trigger on /StatusReport, 'create a status report', 'weekly project update', 'project health report', 'RAG status', 'progress report for sponsor', 'project update deck', or any request to communicate project performance to stakeholders. Produces a McKinsey-style CXO PPTX status report. Based on PMBOK® processes 4.4 (Monitor and Control Project Work) and 10.5 (Report Performance)."
---

# PMI Status Report Skill — /StatusReport

Produces a single `.pptx` status report deck — McKinsey style, CXO-ready, 6–8 slides.

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Report Period | Date range (e.g., "Week of June 2–6, 2026") |
| Overall RAG Status | Red / Amber / Green |
| Schedule RAG | Red / Amber / Green + 1-line reason |
| Cost RAG | Red / Amber / Green + 1-line reason |
| Scope RAG | Red / Amber / Green + 1-line reason |
| Quality RAG | Red / Amber / Green + 1-line reason |
| Accomplishments | What was completed this period (3–5 bullets) |
| Planned Next Period | What is planned next (3–5 bullets) |
| Key Milestones | Milestone name, planned date, actual/forecast date, status |
| Issues | Active issues with owner and resolution plan |
| Risks | Top 3 active risks |
| Budget Status | Planned spend vs. actual spend to date |
| Schedule % Complete | Overall schedule progress |
| Decisions Needed | Any approvals or decisions required from sponsor |
| Prepared By | PM name |

If a previous status report is provided, compare to highlight changes.

---

## Step 2 — Create the Status Report Deck (PPTX)

Use `pptxgenjs`. Design: clean, data-dense, executive-appropriate.

### Slide Structure

| # | Slide | Content |
|---|-------|---------|
| 1 | Cover | Project name, report period, prepared by, overall RAG indicator (large colored circle) |
| 2 | Executive Summary | 2-column: "This Period at a Glance" left (RAG scorecard 4 dimensions) + "Key Highlights" right (3–4 bullets). One large overall status badge (G/A/R) top-right |
| 3 | Milestone Tracker | Table of milestones: Name / Planned Date / Forecast Date / Variance / Status icon (✓ / ⚠ / ✗). Color-coded rows |
| 4 | Schedule & Budget Performance | Two KPI callouts: Schedule % complete (large number) + Budget CPI or % spent. Bar chart or progress bars for phase completion |
| 5 | Accomplishments & Next Steps | Two-column: "Completed This Period" (green checkmarks) vs "Planned Next Period" (blue arrows) |
| 6 | Issues & Risks | Issues table (Issue / Owner / Due / Status) + Top 3 risks (Risk / Level / Response). Color-coded by severity |
| 7 | Decisions Required | Bold decision items with requestor, deadline, and consequences if delayed. If none, slide shows "No decisions required this period" |
| 8 | Appendix (optional) | Detailed metrics, EVM chart, or supporting data if provided |

### RAG Status Design
- **Green**: `#00B050` filled badge
- **Amber**: `#FFC000` filled badge  
- **Red**: `#FF0000` filled badge
- Each status dimension (Schedule, Cost, Scope, Quality) shown as a colored circle + label + one-line reason

### Design Standards
- **Palette**: Charcoal Minimal (`36454F` charcoal, `F2F2F2` off-white, `212121` black) — professional, neutral
- OR use client brand colors if provided
- Cover: dark full-bleed background, white text, large RAG indicator
- Data slides: white background, clear data hierarchy
- No decorative bars, no accent lines under titles
- Tables: navy header row, alternating white/light-grey rows
- Every slide: project name and date in footer, page number

### Creation Approach
```javascript
const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
// Build each slide per structure above
pptx.writeFile({ fileName: "Status-Report-[ProjectName]-[Period].pptx" });
```

After generating, run visual QA:
```bash
python /path/to/pptx/scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```
Check for text overflow on milestone/issue tables and RAG badge alignment. Fix before delivering.

---

## Step 3 — Deliver

Save as: `Status-Report-[ProjectName]-[YYYY-MM-DD].pptx`

Present to the user and briefly confirm: overall status, reporting period, and number of issues/decisions captured.

---

## PMI Process Mapping
- **4.4** Monitor and Control Project Work → Overall status, milestone tracking
- **10.5** Report Performance → Status deck format, variance analysis
- **7.3** Control Costs → Budget status slide
- **6.6** Control Schedule → Schedule % complete, milestone variance
- **11.6** Monitor & Control Risks → Risks slide
- **Tools applied**: Variance analysis, forecasting methods, reporting systems
