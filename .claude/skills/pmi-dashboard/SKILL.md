---
name: pmi-dashboard
description: "Use this skill whenever the user wants to create an executive project dashboard, portfolio dashboard, steering committee presentation, CXO project overview, or KPI summary for senior leadership. Trigger on /Dashboard, 'executive dashboard', 'steering committee deck', 'portfolio overview', 'project KPIs for CXO', 'board update on the project', 'performance dashboard', or any request to present project metrics to senior leadership in a visual, high-impact format. Produces a McKinsey-style CXO PPTX executive dashboard with EVM charts, RAG scorecard, and portfolio view. Based on PMBOK® processes 7.3 (Control Costs), 6.6 (Control Schedule), and 4.4 (Monitor and Control)."
---

# PMI Dashboard Skill — /Dashboard

Produces a single `.pptx` executive dashboard deck — McKinsey style, CXO-ready, 5–7 slides. Built for steering committees, board updates, and portfolio reviews.

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project / Portfolio Name | Name |
| As-of Date | Data date for the dashboard |
| Projects (if portfolio) | List of projects with status |
| EVM Data | PV, EV, AC, BAC per project or period |
| Schedule Data | % complete, planned vs. actual milestones |
| Budget Data | Budget, spend to date, forecast at completion |
| Key KPIs | Any specific metrics to highlight (customer satisfaction, defects, velocity, etc.) |
| Top Risks | Top 3–5 active risks with level |
| Top Issues | Active issues requiring executive attention |
| Decisions Needed | Approvals or guidance required |
| Strategic Objectives | Which corporate objectives this project/portfolio supports |

If EVM data is not available, create a simplified dashboard using % complete, spend vs. budget, and milestone status.

---

## Step 2 — Create the Dashboard Deck (PPTX)

Use `pptxgenjs`. This is a high-impact visual deck — prioritize charts, large numbers, and minimal prose.

### Slide Structure

| # | Slide | Content |
|---|-------|---------|
| 1 | Cover | Project/Portfolio name, "Executive Dashboard", as-of date, sponsor — dark full-bleed navy background |
| 2 | Portfolio Health Scorecard | Grid of projects (or single project KPIs). Each project: Name + RAG badges (Schedule / Cost / Scope / Quality). Overall portfolio RAG summary top-right. Think 2×3 or 3×3 card grid |
| 3 | Financial Performance | Large KPI callouts: Budget ($), Actual ($), CPI, Forecast at Completion ($), Variance ($). Bar chart comparing Planned Value vs. Earned Value vs. Actual Cost |
| 4 | Schedule Performance | Timeline with milestones plotted. % Complete gauge or progress bar. SPI indicator. Next 3 milestones with dates |
| 5 | Key Risks & Issues | Top risks (3–5): colored risk level badges + one-line description. Top issues (3): Owner + Due Date. Issues requiring board escalation highlighted in red |
| 6 | Strategic Alignment | How the project/portfolio maps to corporate objectives. Simple alignment matrix or icon-grid with objective → project mapping |
| 7 | Decisions & Next Steps | Numbered decision items with deadline, owner, and consequence if delayed. "Next 30 Days" key actions in two-column grid |

### Chart Specifications

**Slide 3 — EVM Chart:**
- X-axis: Time periods (months)
- Three lines: Planned Value (navy), Earned Value (green), Actual Cost (red)
- If data points are few, use bar chart instead
- Large KPI callouts above chart: CPI value (green if >1, red if <1), SPI value

**Slide 4 — Schedule:**
- Horizontal milestone timeline (5–7 milestones)
- Color code: ✓ green (complete), ⚠ amber (at risk), ✗ red (delayed), ○ planned
- Circular gauge for overall % complete using shapes

**Slide 2 — Scorecard Cards:**
- Each project card: project name + 4 small RAG circles (S/C/Sc/Q)
- Card background: subtle shadow, rounded rectangle
- Color the card border based on overall RAG

### Design Standards
- **Palette**: Midnight Executive (`1E2761` navy, `CADCFC` ice-blue, `FFFFFF` white)
- RAG colors: Green `#00B050`, Amber `#FFC000`, Red `#FF0000`
- KPI callout numbers: 48–60pt bold, label below in 12pt muted
- Cover and final slide: dark navy full-bleed
- Content slides: white background, strong data hierarchy
- No decorative bars, no accent lines, no cream backgrounds
- Every slide: project name, date, "CONFIDENTIAL" in footer
- Charts must have clear axis labels and legends

### Creation Approach
```javascript
const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
// Build each slide per structure above
// For charts, use pptx.charts (PptxGenJS built-in chart types)
pptx.writeFile({ fileName: "Dashboard-[ProjectName]-[YYYY-MM-DD].pptx" });
```

After generating, run visual QA:
```bash
python /path/to/pptx/scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```
Pay special attention to: KPI number overflow, chart legend clipping, RAG badge sizing. Fix before delivering.

---

## Step 3 — Deliver

Save as: `Dashboard-[ProjectName]-[YYYY-MM-DD].pptx`

Present to the user with: overall portfolio RAG, CPI and SPI values (if available), top risk, and any decisions flagged for escalation.

---

## PMI Process Mapping
- **4.4** Monitor and Control Project Work → Overall dashboard
- **7.3** Control Costs → Financial slide (EVM: PV/EV/AC/CPI)
- **6.6** Control Schedule → Schedule slide (SPI, milestones)
- **11.6** Monitor & Control Risks → Risks slide
- **10.5** Report Performance → All slides
- **Tools applied**: Earned Value Management, variance analysis, forecasting, performance reporting
