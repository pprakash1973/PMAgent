---
name: pmi-budget
description: "Use this skill whenever the user wants to estimate project costs, build a budget, create a cost baseline, or model project financials. Trigger on /Budget, 'estimate costs', 'build a project budget', 'cost plan', 'cost baseline', 'financial model for the project', 'how much will the project cost', or any request to plan project finances. Produces a professional XLSX budget workbook with cost estimates, budget baseline, EVM setup, and funding requirements. Based on PMBOK® processes 7.1 (Estimate Costs) and 7.2 (Determine Budget)."
---

# PMI Budget Skill — /Budget

Produces a single XLSX workbook with four sheets:
1. **Cost Estimates** — bottom-up cost estimate by WBS/activity
2. **Budget Baseline** — cost performance baseline with S-curve setup
3. **Funding Requirements** — phased funding schedule
4. **EVM Tracker** — Earned Value Management setup for cost control

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| WBS / Activities | Work packages to cost (or use from /WBS output) |
| Resource Types | Labor categories (e.g., PM, BA, Developer, Architect, QA) |
| Labor Rates | $ per hour or per day per resource type |
| Resource Allocation | Hours or % per activity per resource |
| Non-Labor Costs | Software, hardware, travel, training, external services |
| Contingency Reserve | % or $ buffer for known-unknown risks |
| Management Reserve | % buffer for unknown-unknown risks |
| Currency | USD or specify |
| Project Duration | Months (for phased budget) |

If rates are unknown, use industry benchmark ranges and note assumptions clearly.

---

## Step 2 — Estimating Approach (PMBOK 7.1)

Use **bottom-up estimating** as the primary method:
- Cost each work package individually
- Roll up to deliverables, phases, and project total
- Apply reserve analysis:
  - **Contingency Reserve** = % of activity estimates (covers identified risks)
  - **Management Reserve** = % of total project cost (covers unknown risks)
  - **Budget at Completion (BAC)** = Cost Baseline + Management Reserve

Color coding (industry standard, per xlsx skill):
- Blue text: hardcoded inputs (rates, hours, assumptions)
- Black text: formula-calculated values
- Yellow background: key assumptions to review

---

## Step 3 — Create the XLSX Workbook

### Sheet 1: Cost Estimates

| Column | Content |
|--------|---------|
| WBS Code | Reference |
| Work Package / Activity | Name |
| Phase | Project phase |
| Resource Type | Labor category or material |
| Qty / Hours | Amount of resource |
| Unit Rate ($) | Cost per unit — hardcoded input (blue text) |
| Direct Cost ($) | `=Qty * Rate` formula |
| Overhead % | Overhead rate — hardcoded input |
| Overhead ($) | `=Direct * Overhead%` |
| Total Cost ($) | `=Direct + Overhead` |
| Contingency % | Per activity — hardcoded input |
| Contingency ($) | `=Total * Contingency%` |
| Estimate Total ($) | `=Total + Contingency` |
| Estimating Method | Bottom-up / Analogous / Parametric |
| Confidence Level | High / Medium / Low |
| Notes | Assumptions and sources |

Subtotal rows per phase using `=SUM()`. Grand total row in bold with navy fill.

### Sheet 2: Budget Baseline (Cost Performance Baseline)

Monthly cost plan with S-curve:

| Column | Content |
|--------|---------|
| Phase | Project phase |
| Cost Category | Labor / Materials / Services / Travel / Contingency |
| Month 1–N | Planned spend per month (user inputs or distribute evenly) |
| Total ($) | `=SUM(monthly)` |
| Cumulative ($) | Running total `=prev_cumulative + current_month` |
| % of Budget | `=Total/BAC` |

Bottom of sheet:
- **Cost Baseline** = sum of all activity estimates + contingency
- **Management Reserve** = hardcoded % × Cost Baseline
- **Budget at Completion (BAC)** = Cost Baseline + Management Reserve

Add an openpyxl line chart showing cumulative spend S-curve (Planned Value over time).

### Sheet 3: Funding Requirements

| Column | Content |
|--------|---------|
| Period | Month or Quarter |
| Planned Expenditure ($) | From Sheet 2 monthly plan |
| Cumulative Expenditure ($) | Running total |
| Funding Required ($) | Add management reserve in final period |
| Cumulative Funding ($) | Running total |
| Funding Gap ($) | `=Cumulative Funding - Cumulative Expenditure` |
| Approval Status | Approved / Pending / TBD |

### Sheet 4: EVM Tracker (Earned Value Management)

Setup template for cost control (populated as project executes):

| Column | Content |
|--------|---------|
| Period | Month |
| Planned Value (PV) | From budget baseline |
| Earned Value (EV) | % complete × BAC (filled in during execution) |
| Actual Cost (AC) | Actual spend to date |
| Schedule Variance (SV) | `=EV-PV` |
| Cost Variance (CV) | `=EV-AC` |
| SPI | `=EV/PV` (Schedule Performance Index) |
| CPI | `=EV/AC` (Cost Performance Index) |
| EAC | `=BAC/CPI` (Estimate at Completion) |
| ETC | `=EAC-AC` (Estimate to Complete) |
| VAC | `=BAC-EAC` (Variance at Completion) |
| TCPI | `=(BAC-EV)/(BAC-AC)` (To-Complete Performance Index) |

Add conditional formatting:
- CPI < 0.9: red fill (over budget)
- CPI 0.9–1.1: yellow fill (watch)
- CPI > 1.1: green fill (under budget)

Include an EVM chart: PV / EV / AC lines over time.

---

## Step 4 — Formatting Standards

Per xlsx skill financial model standards:
- Blue text for all hardcoded inputs (rates, %, reserves)
- Black text for all formulas
- Currency format: `$#,##0;($#,##0);-` on all dollar cells
- Percentages: `0.0%` format
- Negative numbers in parentheses
- Headers specify units: `Cost ($)`, `Rate ($/hr)`
- All assumptions documented in cell comments or a dedicated Assumptions section

---

## Step 5 — Recalculate

```bash
python /path/to/xlsx/scripts/recalc.py Budget-[ProjectName]-[YYYY-MM-DD].xlsx
```
Fix any formula errors (especially #DIV/0! in EVM ratios when AC=0).

---

## Step 6 — Deliver

Save as: `Budget-[ProjectName]-[YYYY-MM-DD].xlsx`

Present to the user with: total BAC, cost baseline, management reserve, top cost drivers, and any assumptions made about rates or allocations.

---

## PMI Process Mapping
- **7.1** Estimate Costs → Sheet 1: Cost Estimates
- **7.2** Determine Budget → Sheet 2: Budget Baseline, Sheet 3: Funding Requirements
- **7.3** Control Costs → Sheet 4: EVM Tracker
- **Tools applied**: Bottom-up estimating, reserve analysis, EVM
