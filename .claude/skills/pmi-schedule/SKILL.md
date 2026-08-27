---
name: pmi-schedule
description: "Use this skill whenever the user wants to create a project schedule, Gantt chart, timeline, or activity plan. Trigger on /Schedule, 'create a project schedule', 'build a Gantt chart', 'sequence activities', 'develop timeline', 'plan sprints', or any request to plan when project work will happen. Produces a professional XLSX schedule with Gantt chart, critical path indicators, and milestone tracker. Based on PMBOK® processes 6.1–6.5 (Define Activities through Develop Schedule)."
---

# PMI Schedule Skill — /Schedule

Produces a single XLSX workbook with three sheets:
1. **Project Schedule** — activity list with Gantt chart
2. **Milestone Tracker** — key milestones with status
3. **Schedule Baseline** — approved baseline for variance tracking

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Project Start Date | Calendar start date |
| Project End Date | Target completion date |
| Phases / WBS | Major phases or deliverables |
| Activities | Task list (if provided; otherwise generate from phases) |
| Dependencies | Predecessors per activity (FS/SS/FF/SF) |
| Durations | Estimated duration per activity (days) |
| Resources | Assigned team/person per activity |
| Milestones | Key milestone dates |
| Constraints | Hard deadlines, blackout dates, holidays |

If only a project description or WBS is provided, generate a realistic activity list using PMI best practices. Use 3-point estimating (Optimistic / Most Likely / Pessimistic) if uncertainty is high. Confirm before writing.

---

## Step 2 — Build the Schedule

### Activity Coding
Use WBS-linked codes: `A-1.1.1`, `A-1.1.2`, etc. or sequential `T-001`, `T-002`.

### Dependency Types (PMBOK 6.2)
- **FS** (Finish-to-Start): default — B can't start until A finishes
- **SS** (Start-to-Start): B starts when A starts
- **FF** (Finish-to-Finish): B finishes when A finishes
- **Lags/Leads**: expressed as +/- days (e.g., FS+2)

### Duration Estimating (PMBOK 6.4)
When duration is uncertain, use PERT formula:
- Expected Duration = (O + 4M + P) / 6
- Include estimate in schedule notes

### Critical Path
Identify the critical path (longest path = project duration). Mark critical activities in red.

---

## Step 3 — Create the XLSX Workbook

### Sheet 1: Project Schedule (with Gantt)

Use `openpyxl` for data + Gantt bar formatting.

**Left section — Activity Table:**

| Column | Content |
|--------|---------|
| ID | Activity ID |
| WBS | WBS reference code |
| Activity Name | Task description |
| Phase | Phase name |
| Owner | Assigned resource |
| Duration (days) | Estimated |
| Start Date | Calculated from predecessors |
| End Date | Start + Duration - 1 |
| Predecessors | Comma-separated IDs |
| % Complete | 0–100 |
| Status | Not Started / In Progress / Complete / Delayed |
| Notes | Any comments |

**Right section — Gantt Chart:**
- Column headers = week numbers or month labels (auto-generate based on project dates)
- Each activity row: fill cells in the Gantt columns that fall within Start→End date range
- Color coding:
  - Critical path activities: `FF0000` (red fill)
  - Non-critical activities: `4472C4` (blue fill)
  - Milestones: `FFD700` (gold diamond marker — single-cell fill with ◆ text)
  - Complete activities: `70AD47` (green fill)
  - Summary/phase rows: `1E2761` (navy fill)

**Formatting:**
- Freeze columns A–L (the activity table), scroll right for Gantt
- Row 1: Bold header, navy fill, white text
- Phase rows: Bold, steel-blue fill
- Column widths: ID=8, WBS=12, Activity=30, Phase=15, Owner=15, Duration=12, Dates=12 each

**Gantt generation approach:**
```python
from openpyxl import Workbook
from openpyxl.styles import PatternFill
from datetime import date, timedelta

# For each activity, calculate which Gantt columns to fill
# based on Start Date and End Date vs. the column date headers
# Fill the appropriate cells with the color-coded fill
```

### Sheet 2: Milestone Tracker

| Column | Content |
|--------|---------|
| # | Milestone number |
| Milestone Name | Description |
| Planned Date | Original baseline date |
| Actual/Forecast Date | Current forecast |
| Variance (days) | `=Actual-Planned` formula |
| Status | On Track / At Risk / Delayed / Complete |
| Owner | Accountable person |
| Notes | Context |

Conditional formatting on Variance column:
- ≤0 days: green fill
- 1–5 days: yellow fill
- >5 days: red fill

### Sheet 3: Schedule Baseline

Copy of the Schedule sheet's Start/End dates at the time of baseline approval.
Add a header row: "BASELINE LOCKED — [Date]" in bold red.
This sheet is protected to prevent editing (set `sheet.protection.sheet = True`).

---

## Step 4 — Formula Recalculation

```bash
python /path/to/xlsx/scripts/recalc.py Schedule-[ProjectName]-[YYYY-MM-DD].xlsx
```

---

## Step 5 — Deliver

Save as: `Schedule-[ProjectName]-[YYYY-MM-DD].xlsx`

Present to the user with: total activities, project duration, critical path length (days), number of milestones, and any scheduling risks identified (e.g., resource overloads, tight dependencies).

---

## PMI Process Mapping
- **6.1** Define Activities → Activity list
- **6.2** Sequence Activities → Dependency mapping
- **6.3** Estimate Activity Resources → Owner column
- **6.4** Estimate Activity Durations → Duration column
- **6.5** Develop Schedule → Full schedule + Gantt
- **6.6** Control Schedule → Baseline sheet + Variance column
- **Tools applied**: PDM (Precedence Diagramming Method), Critical Path Method, PERT
