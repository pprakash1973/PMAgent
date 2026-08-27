---
name: pmi-risk
description: "Use this skill whenever the user wants to create a risk register, identify and analyze project risks, plan risk responses, or conduct a risk assessment. Trigger on /Risk, 'create a risk register', 'identify project risks', 'risk assessment', 'risk matrix', 'RAID log', 'probability and impact', or any request to manage project uncertainty. Produces a comprehensive XLSX risk register with probability-impact matrix, risk heat map, and response plan. Based on PMBOK® processes 11.1–11.5."
---

# PMI Risk Skill — /Risk

Produces a single XLSX workbook with four sheets:
1. **Risk Register** — full risk log with qualitative and quantitative analysis
2. **P×I Matrix** — probability × impact heat map
3. **Response Plan** — mitigation/contingency actions per risk
4. **Risk Dashboard** — executive summary chart

---

## Step 1 — Gather Inputs

Ask the user for (or infer from context):

| Field | Description |
|-------|-------------|
| Project Name | Full project name |
| Project Phase | Current phase (affects risk focus) |
| Risk Categories | Use RBS (Risk Breakdown Structure): Technical, Schedule, Cost, Resource, External, Organizational |
| Known Risks | Any risks the team has already identified |
| Project Constraints | Budget, timeline, regulatory — informs risk identification |
| Risk Appetite | Low / Medium / High (sponsor's tolerance for risk) |
| Risk Thresholds | What Probability × Impact score triggers escalation |

Generate a comprehensive initial risk list from the project description using PMI risk identification techniques (SWOT analysis, checklist, assumptions analysis). Aim for 10–20 meaningful risks. Confirm before writing.

---

## Step 2 — Risk Scoring

### Probability Scale
| Score | Label | Definition |
|-------|-------|------------|
| 1 | Very Low | <10% chance |
| 2 | Low | 10–30% |
| 3 | Medium | 31–50% |
| 4 | High | 51–70% |
| 5 | Very High | >70% |

### Impact Scale (per PMBOK)
| Score | Cost Impact | Schedule Impact | Scope Impact |
|-------|-------------|-----------------|--------------|
| 1 | <1% budget | <1 week | Minor slippage |
| 2 | 1–5% | 1–2 weeks | Some areas affected |
| 3 | 5–10% | 2–4 weeks | Major areas affected |
| 4 | 10–20% | 1–2 months | Project quality reduced |
| 5 | >20% | >2 months | Project cannot meet objectives |

### Risk Score = Probability × Impact (1–25)
- **Critical** (≥15): Red — immediate escalation and response required
- **High** (10–14): Orange — active monitoring and response plan
- **Medium** (5–9): Yellow — periodic monitoring
- **Low** (1–4): Green — watch list

---

## Step 3 — Create the XLSX Workbook

### Sheet 1: Risk Register

| Column | Content |
|--------|---------|
| Risk ID | R-001, R-002, … |
| Risk Category | Technical / Schedule / Cost / Resource / External / Organizational |
| Risk Title | Short name (≤10 words) |
| Risk Description | Full description: "If [cause], then [risk event], resulting in [effect]" |
| Risk Type | Threat / Opportunity |
| Probability (P) | 1–5 |
| Impact (I) | 1–5 |
| Risk Score | `=P*I` formula |
| Risk Level | Critical / High / Medium / Low (formula via VLOOKUP on score) |
| Risk Owner | Assigned person |
| Response Strategy | Avoid / Transfer / Mitigate / Accept (for threats) / Exploit / Share / Enhance / Accept (for opportunities) |
| Response Status | Planned / In Progress / Complete |
| Residual Probability | After response |
| Residual Impact | After response |
| Residual Score | `=Residual P × Residual I` |
| Date Identified | Date |
| Review Date | Next review date |
| Status | Open / Closed / Realized |
| Notes | Additional context |

Formatting:
- Risk Level column: conditional formatting — Critical=red fill, High=orange, Medium=yellow, Low=green
- Row 1: Bold header, navy fill (`1E2761`), white text
- Alternate row shading
- Freeze Row 1; auto-filter all columns

### Sheet 2: P×I Heat Map

Create a 5×5 matrix table (P on rows 5→1 top-to-bottom, I on columns 1→5):
- Fill each cell with the appropriate risk level color
- Place risk IDs in the appropriate cell based on their P and I scores
- Label axes clearly: "Probability" (vertical), "Impact" (horizontal)

```python
# 5x5 grid — each cell colored by score = row_p * col_i
colors = {
    range(1,5): "92D050",   # Low — green
    range(5,10): "FFFF00",  # Medium — yellow
    range(10,15): "FF9900", # High — orange
    range(15,26): "FF0000", # Critical — red
}
# Place risk IDs as text in the matching cell
```

### Sheet 3: Response Plan

One row per risk (Critical and High risks get detailed entries):

| Column | Content |
|--------|---------|
| Risk ID | Reference |
| Risk Title | Short name |
| Risk Level | Color-coded |
| Response Strategy | Primary strategy |
| Mitigation Actions | Step-by-step actions to reduce P or I |
| Contingency Plan | What to do if risk is realized |
| Trigger | Early warning indicator |
| Owner | Accountable person |
| Due Date | When response must be in place |
| Cost Reserve ($) | Contingency budget allocated |
| Status | Planned / Active / Closed |

### Sheet 4: Risk Dashboard

Use openpyxl charts:
1. **Stacked bar**: Risks by category (x-axis) split by risk level (color-coded bars)
2. **Donut chart**: Risk distribution by level (Critical / High / Medium / Low)
3. **KPI cells**: Total risks, Critical count, High count, Open responses

---

## Step 4 — Recalculate

```bash
python /path/to/xlsx/scripts/recalc.py Risk-Register-[ProjectName]-[YYYY-MM-DD].xlsx
```

---

## Step 5 — Deliver

Save as: `Risk-Register-[ProjectName]-[YYYY-MM-DD].xlsx`

Present to the user with: total risks identified, breakdown by level (Critical/High/Medium/Low), top 3 risks by score, and recommended immediate actions.

---

## PMI Process Mapping
- **11.1** Plan Risk Management → Scoring scales, categories, thresholds
- **11.2** Identify Risks → Risk Register rows (SWOT, checklist, assumptions)
- **11.3** Perform Qualitative Risk Analysis → P×I scores, heat map
- **11.4** Perform Quantitative Risk Analysis → Risk scores, residual analysis
- **11.5** Plan Risk Responses → Response Plan sheet
- **11.6** Monitor & Control Risks → Status column, review dates
