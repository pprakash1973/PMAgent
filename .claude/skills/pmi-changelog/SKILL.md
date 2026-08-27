---
name: pmi-changelog
description: "Use this skill whenever the user wants to create a change log, change request form, change control register, or manage project change control. Trigger on /ChangeLog, 'create a change log', 'change request', 'change control register', 'scope change tracking', 'change management log', 'CCB log', 'integrated change control', or any request to document and track project changes. Produces an XLSX change control workbook with change requests, impact analysis, and CCB decision log. Based on PMBOK® process 4.5 (Perform Integrated Change Control)."
---

# PMI ChangeLog Skill — /ChangeLog

Produces a single XLSX workbook with three sheets:
1. **Change Log** — master register of all change requests
2. **Change Request Form** — template for new change requests
3. **Impact Analysis Template** — structured impact assessment per change

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Existing Changes | Any change requests already in progress |
| Change Categories | Scope / Schedule / Cost / Quality / Resource / Technical / Regulatory |
| CCB Members | Change Control Board members (names and roles) |
| Approval Thresholds | E.g., PM approves <$5K, Sponsor approves $5K–$50K, Board approves >$50K |

---

## Step 2 — Create the XLSX Workbook

### Sheet 1: Change Log (Master Register)

| Column | Content |
|--------|---------|
| CR # | CR-001, CR-002, … |
| Date Raised | Date submitted |
| Raised By | Name and role |
| Change Title | Short descriptive title |
| Category | Scope / Schedule / Cost / Quality / Resource / Technical / Regulatory |
| Priority | Critical / High / Medium / Low |
| Description | What change is being requested and why |
| Justification | Business case or driver |
| Impact — Scope | Description of scope impact |
| Impact — Schedule (days) | + or - days |
| Impact — Cost ($) | + or - dollars |
| Impact — Quality | Description of quality impact |
| Impact — Risk | New or changed risks introduced |
| Analysis Date | When impact assessment was completed |
| Analyzed By | Name |
| Recommended Action | Approve / Reject / Defer / More Info Needed |
| CCB Decision | Approved / Rejected / Deferred / Pending |
| Decision Date | Date CCB decided |
| Decision By | Approver name and role |
| Implementation Status | Not Started / In Progress / Complete / Cancelled |
| Implemented Date | When change was implemented |
| Baseline Updated | Yes / No (was the plan updated?) |
| Notes | Additional context |

Formatting:
- Row 1: Bold header, navy fill (`1E2761`), white text, 12pt, row height 30
- CCB Decision column: conditional formatting — Approved=green fill, Rejected=red fill, Deferred=amber fill, Pending=grey fill
- Priority column: conditional formatting — Critical=red, High=orange, Medium=yellow, Low=green
- Freeze Row 1; auto-filter all columns
- Alternate row shading
- Wrap text on Description, Justification, Impact columns

**Footer summary row:**
- Total changes: `=COUNTA(CR_column)-1`
- Approved: `=COUNTIF(decision_col,"Approved")`
- Rejected: `=COUNTIF(decision_col,"Rejected")`
- Pending: `=COUNTIF(decision_col,"Pending")`
- Total schedule impact: `=SUM(schedule_impact_col)`
- Total cost impact: `=SUM(cost_impact_col)`

### Sheet 2: Change Request Form Template

A formatted single-page form layout (not a data table — use merged cells to create a form):

```
PROJECT CHANGE REQUEST
──────────────────────────────────────────
CR #: [auto]           Date: [date]
Project Name:          Project Phase:
──────────────────────────────────────────
SECTION 1: CHANGE DESCRIPTION
Change Title:
Category: □ Scope  □ Schedule  □ Cost  □ Quality  □ Resource  □ Other
Priority:  □ Critical  □ High  □ Medium  □ Low
Description of Change (what is being changed):
[text area]
Justification / Business Case:
[text area]
──────────────────────────────────────────
SECTION 2: IMPACT ANALYSIS
Schedule Impact:        □ Increase  □ Decrease  □ No change   _____ days
Cost Impact:            □ Increase  □ Decrease  □ No change   $ _______
Scope Impact:
Quality Impact:
Risk Impact:
──────────────────────────────────────────
SECTION 3: RECOMMENDATION
PM Recommendation:      □ Approve  □ Reject  □ Defer
Analysis Notes:
──────────────────────────────────────────
SECTION 4: CCB DECISION
Decision:              □ Approved  □ Rejected  □ Deferred
Decision Date:
Approved By:
Conditions / Notes:
──────────────────────────────────────────
SECTION 5: IMPLEMENTATION
Action Plan:
Owner:                 Target Date:
Status:               Completion Date:
Baseline Updated:      □ Yes  □ No
```

Use merged cells, borders, and light shading to create a clean form. Print-ready at A4 or Letter.

### Sheet 3: Impact Analysis Template

A structured template for detailed impact analysis (for significant changes):

| Section | Content |
|---------|---------|
| Change Overview | CR#, title, requester |
| Scope Impact | WBS elements affected, deliverables changed, boundaries affected |
| Schedule Impact | Activities delayed/added, critical path impact, new end date |
| Cost Impact | Additional labor hours, material costs, cost breakdown by WBS |
| Resource Impact | Team members affected, capacity changes |
| Quality Impact | Quality metrics affected, testing required |
| Risk Impact | New risks introduced (use risk scoring from pmi-risk) |
| Stakeholder Impact | Who is affected by this change |
| Alternatives Considered | Other options evaluated and why rejected |
| Recommendation | PM's recommendation with rationale |
| Implementation Plan | Steps, timeline, owner |

---

## Step 3 — Deliver

Save as: `Change-Log-[ProjectName]-[YYYY-MM-DD].xlsx`

Present to the user with: number of changes logged, pending CCB decisions, total schedule and cost impact of approved changes.

---

## PMI Process Mapping
- **4.5** Perform Integrated Change Control → Full workbook
- **Inputs**: Change requests, project management plan, work performance information
- **Tools**: Change control meetings, expert judgment
- **Outputs**: Change request status updates, project management plan updates
