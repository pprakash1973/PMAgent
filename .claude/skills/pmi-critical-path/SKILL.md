---
name: "pmi-critical-path"
description: "Use this skill whenever the user wants to analyse a WBS or project schedule using the Critical Path Method (CPM). Trigger on /CriticalPath, /CPA, 'critical path', 'CPM analysis', 'analyse my schedule', 'find the critical path', 'calculate float', 'total float', 'free float', 'forward pass', 'backward pass', 'schedule analysis', 'which tasks are critical', 'what is my project end date', 'resource leveling', or any request to compute or review schedule logic, float, or critical activities from an existing WBS or schedule. Also trigger when the user uploads or pastes a schedule, task list, or WBS and wants to know where the project risks are, which tasks can slip, or how long the project will take. Produces an XLSX workbook with CPM results (ES, EF, LS, LF, TF, FF, critical path flag) and a Gantt view, plus a plain-language narrative summary. Based on PMI CPM fundamentals (Wilkens, 2006) and PMBOK® Schedule Management."
---

# PMI Critical Path Analysis Skill

This skill reads a WBS and/or project schedule and runs a full CPM (Critical Path Method) analysis based on PMI best practices. It outputs an XLSX workbook with all computed dates and float values, highlights the critical path, and produces a plain-language narrative.

**Source authority:** Wilkens, T.T. (2006). *Fundamentals of Scheduling & Resource Leveling*. PMI® Global Congress 2006, Seattle, WA. PMBOK® Guide — Schedule Management (Section 6).

---

## Step 1 — Collect the input

Accept the schedule in any of these forms (in order of preference):

1. **Uploaded XLSX / CSV** — read it with pandas; look for columns: Activity ID, Activity Name, Duration, Predecessors (comma-separated IDs), and optionally: Resource, Calendar, Constraint Type, Constraint Date.
2. **Pasted table** — parse from the conversation.
3. **WBS only** — if the user provides only a WBS without durations/logic, ask for durations and dependencies before proceeding. Do not fabricate them.

**Mandatory fields to resolve before calculating:**
- Activity ID (unique)
- Activity Name
- Duration (working days, integer ≥ 0; milestone = 0)
- Predecessors (blank = no predecessor; use FS by default unless specified)

**Optional fields:**
- Relationship type per predecessor (FS, SS, FF, SF) and lag (days, can be negative)
- Constraint type (NET = Not Earlier Than, NLT = Not Later Than) and constraint date
- Project start date (default: today if not provided — tell the user)
- Resource assignments (required only if resource leveling is requested)

If any mandatory field is missing, ask the user before running. Do not assume durations.

---

## Step 2 — Run the CPM engine (Python, deterministic)

Write and execute a Python script. All numeric values come from this script — never from the model's own reasoning.

```python
# Skeleton — expand fully when implementing
import pandas as pd
from datetime import date, timedelta

# Build activity dict from parsed input
# activities = {id: {name, duration, predecessors: [(pred_id, rel_type, lag)], constraint_type, constraint_date}}

def forward_pass(activities, project_start):
    """
    ES = max(project_start, max(EF_predecessor + 1 + lag for each predecessor), NET_constraint, data_date)
    EF = ES + duration - 1  (for duration > 0; milestone: EF = ES)
    Traverse in topological order.
    """
    ...

def backward_pass(activities, project_finish):
    """
    LF = min(project_finish, min(LS_successor - 1 - lag for each successor), NLT_constraint)
    LS = LF - duration + 1
    Traverse in reverse topological order.
    """
    ...

def compute_float(activities):
    """
    Total Float (TF) = LF - EF  (equivalently LS - ES)
    Free Float (FF) = min(ES_successor) - EF - 1  for each activity
      (for activities with no successors: FF = project_finish - EF)
    Critical path: all activities where TF == min(TF across network)
      (when no NLT constraints, min TF = 0; with NLT constraints min TF may be negative)
    """
    ...
```

Key rules to enforce in your implementation:
- **Topological sort** — process activities in dependency order; detect and report cycles as an error.
- **Calendar** — if no calendar is provided, assume 5-day working week; skip weekends when computing dates. If a project start date is given as a calendar date, convert all ordinal day numbers to real dates.
- **Milestones** — duration = 0; EF = ES.
- **Lag** — positive lag delays the successor; negative lag allows overlap (lead).
- **Negative float** — only possible when NLT constraints are present. Report it explicitly; do not suppress it.
- **Multiple critical paths** — all paths where TF = min TF are critical; flag them all.

Output a DataFrame with columns:

| Column | Description |
|---|---|
| Activity ID | As provided |
| Activity Name | As provided |
| Duration | Working days |
| Early Start (ES) | Ordinal or calendar date |
| Early Finish (EF) | Ordinal or calendar date |
| Late Start (LS) | |
| Late Finish (LF) | |
| Total Float (TF) | Days |
| Free Float (FF) | Days |
| Critical | TRUE / FALSE |
| Predecessors | As provided |
| Constraint | Type + date if applicable |

---

## Step 3 — Resource leveling (only if requested or resource data is present)

If the user provides resource assignments and asks for leveling:

1. Establish max resource availability per time period from user input.
2. Sort activities by TF ascending (lowest float = highest priority).
3. Assign Resource Start (RS) and Resource Finish (RF) — cannot precede ES/EF.
4. Toggle goal: **limit resources** (project may extend) vs. **constrain finish** (show overrun).
5. Add RS, RF columns to the output DataFrame.
6. Flag activities whose RS > LS (resource delay eats into float).

If resource data is absent, skip this step and note it in the narrative.

---

## Step 4 — Build the XLSX output

Use the **xlsx skill** pattern (openpyxl or xlsxwriter via Python). Produce a workbook with these sheets:

### Sheet 1 — CPM Results
Full DataFrame from Step 2 (and Step 3 if leveling was run).
- Freeze top row; auto-filter on all columns.
- Highlight critical rows in **red fill** (#FF0000 or similar) with white bold text.
- Highlight negative float rows in **amber fill** (#FFC000).
- Right-align numeric columns; date columns formatted as DD-MMM-YYYY.

### Sheet 2 — Gantt View
Simple bar chart Gantt using conditional formatting or data bars:
- Rows = activities (same order as Sheet 1, grouped by WBS level if WBS codes are present).
- Columns = time periods (days or weeks depending on project duration).
- Critical path bars in red; non-critical in blue; milestones as diamonds (▼ character or marker).
- Show today's date as a vertical reference line if a project start date was provided.

### Sheet 3 — Float Analysis
Sorted by TF ascending:
- Top 10 near-critical activities (lowest positive TF) — these are the "watch list".
- All negative float activities with their NLT constraint source.
- Free float summary: activities with FF = 0 (any delay impacts a successor immediately).

### Sheet 4 — Summary
| Metric | Value |
|---|---|
| Project start date | |
| Project finish date (forward pass) | |
| Critical path duration (days) | |
| Number of critical activities | |
| Number of near-critical activities (TF ≤ 5 days) | |
| Number of activities with negative float | |
| Data date used | |
| Calculation run at | |

---

## Step 5 — Narrative summary

After the XLSX is built, write a plain-language summary in the chat. Draw **only from the computed values** in the DataFrame — do not generate or estimate any numbers.

Structure the narrative as:

**Critical path:** State which activities form the critical path and what the project end date is.

**Float distribution:** Note how many activities have zero, low (≤5 days), and comfortable float. Call out any negative float and which constraint is causing it.

**Free float watch list:** Identify the top 3–5 activities with zero free float — a delay on these immediately pushes a successor, regardless of total float.

**Resource leveling (if run):** Note which activities had their start delayed by resource constraints and whether the project finish moved.

**Recommended PM actions:** Name specific activities that need attention (e.g., "Activity X has 0 TF and 0 FF — it is both critical and has no buffer before impacting Activity Y").

Keep the narrative factual and concise. Do not invent risks or durations not in the data.

---

## Step 6 — Deliver

Save the XLSX to the outputs folder with name: `CPM_Analysis_YYYYMMDD.xlsx`

Present it with `present_files`.

Then deliver the narrative summary in the chat.

---

## Edge cases and error handling

| Situation | Action |
|---|---|
| Cycle detected in network | Report which activities form the cycle; halt calculation |
| Activity references a predecessor not in the list | Warn the user; treat as open-ended (no predecessor) |
| Duration is missing or non-numeric | Ask the user before proceeding |
| Project start date not provided | Use today; tell the user |
| Only a WBS (no durations/logic) is provided | Ask for durations and predecessor logic before running |
| All activities have TF = 0 | The entire network is critical — state this clearly |
| Single activity (no dependencies) | TF = 0, FF = 0, it is critical by default |

---

## PMI reference formulas (quick reference)

```
ES  = max(Project_Start, EF_predecessor + 1 + lag, NET_constraint, Data_Date)
EF  = ES + Duration - 1          # (Duration > 0)
EF  = ES                          # (Milestone, Duration = 0)

LF  = min(Project_Finish, LS_successor - 1 - lag, NLT_constraint)
LS  = LF - Duration + 1

TF  = LF - EF   =   LS - ES
FF  = min(ES_successor) - EF - 1   [for activities with successors]
FF  = Project_Finish - EF          [for activities with no successors]

Critical path: all activities where TF = min(TF in network)
```

