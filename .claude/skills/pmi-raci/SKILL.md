---
name: pmi-raci
description: "Use this skill whenever the user wants to create a RACI matrix, responsibility assignment matrix, team roles and responsibilities chart, or staffing plan. Trigger on /RACI, 'create a RACI', 'responsibility matrix', 'who does what', 'roles and responsibilities', 'team structure', 'staffing plan', 'resource plan', or any request to clarify project accountability. Produces an XLSX RACI matrix with team org view and a communication plan. Based on PMBOK® processes 9.1 (Develop Human Resource Plan) and 10.2 (Plan Communications)."
---

# PMI RACI Skill — /RACI

Produces a single XLSX workbook with three sheets:
1. **RACI Matrix** — responsibility assignment per deliverable and role
2. **Team Directory** — full team roster with roles and contacts
3. **Communication Plan** — who gets what information, when, and how

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Deliverables / Activities | What work needs to be assigned (use WBS if available) |
| Team Roles | Role names (e.g., Project Sponsor, PM, Business Analyst, Architect, Developer, QA Lead, Change Manager) |
| Team Members | Names mapped to roles (optional — can use role names only) |
| Organizational Context | Is this a functional, matrix, or projectized org? |
| Communication Needs | What reports/updates are needed, how often |

If only a project type is given, generate a typical RACI for that kind of project (e.g., IT implementation, digital transformation, infrastructure rollout).

---

## Step 2 — RACI Rules

Per PMI HR planning best practices:

- **R (Responsible)**: Does the work. Can have multiple R per row.
- **A (Accountable)**: Owns the outcome. Must be **exactly ONE** per row — never zero, never two. Escalation goes here.
- **C (Consulted)**: Provides input before decisions. Two-way communication.
- **I (Informed)**: Notified of outcomes. One-way communication.

Validation rules to enforce:
- Every deliverable row must have exactly one A
- No row should be all-blank
- Alert if any role has no assignments (possibly unnecessary role)
- Alert if one role is Accountable for everything (overloaded)

Group deliverables by phase for readability.

---

## Step 3 — Create the XLSX Workbook

### Sheet 1: RACI Matrix

Layout: Deliverables as rows, Roles as columns.

**Header row:**
- Column A: Phase
- Column B: Deliverable / Activity
- Columns C onwards: One column per role

**Data rows:**
- Each cell contains: R, A, C, I, or blank
- Use data validation (dropdown) on each cell: `R, A, C, I, —`

**Color coding:**
- A (Accountable): navy fill (`1E2761`), white bold text
- R (Responsible): steel-blue fill (`4472C4`), white text
- C (Consulted): light-blue fill (`BDD7EE`), dark text
- I (Informed): light-grey fill (`F2F2F2`), dark text
- Blank / —: white

**Formatting:**
- Row 1 (column headers): Bold, navy fill, white text, center-aligned, 45° rotation for role names if many columns
- Column A (phases): Bold, steel-blue fill, merged cells per phase group
- Column B (deliverables): Left-aligned, 30-char width
- Role columns: 10–14 char width, center-aligned
- Freeze columns A–B; auto-filter on Column A

**Footer row per phase:** Count of R and A assignments per role using `=COUNTIF()` formulas.

**Summary row at bottom:**
- Total Responsible per role: `=COUNTIF(col, "R")`
- Total Accountable per role: `=COUNTIF(col, "A")`
- Highlight if any role has 0 A or 0 R (workload balance check)

### Sheet 2: Team Directory

| Column | Content |
|--------|---------|
| Role | Official role name |
| Name | Team member name |
| Organization / Department | Functional department |
| Email | Contact email |
| Phone | Contact number |
| Location | Office or timezone |
| Availability (%) | % of time allocated to project |
| Start Date | When joining project |
| End Date | When leaving project |
| Reporting To | Manager or PM |
| Notes | Skills, constraints |

Formatting: Bold header, navy fill, alternate row shading, auto-filter.

### Sheet 3: Communication Plan

Based on PMBOK 10.2:

| Column | Content |
|--------|---------|
| Communication Item | What is communicated (e.g., Weekly Status Report, Steering Committee Update, Risk Review) |
| Purpose | Why this communication exists |
| Audience | Role names from RACI |
| Format | Email / Meeting / Dashboard / Report / Presentation |
| Frequency | Daily / Weekly / Bi-weekly / Monthly / As needed |
| Responsible | Who prepares/sends |
| Delivery Method | Email / Teams / SharePoint / In-person |
| Template / Link | Reference to template if any |
| Notes | Special instructions |

Pre-populate with standard PM communications:
- Project Kickoff Meeting
- Weekly Status Report
- Monthly Steering Committee Update
- Risk Review Meeting
- Change Control Board Meeting
- Project Close Report

---

## Step 4 — Deliver

Save as: `RACI-[ProjectName]-[YYYY-MM-DD].xlsx`

Present to the user with: team size, total deliverables/activities, any RACI validation warnings (missing A, role overloads), and communication items count.

---

## PMI Process Mapping
- **9.1** Develop Human Resource Plan → RACI Matrix + Team Directory
- **9.2** Acquire Project Team → Team Directory (availability, start/end)
- **10.2** Plan Communications → Communication Plan
- **Tools applied**: Organizational charts, RACI matrix, communication requirements analysis
