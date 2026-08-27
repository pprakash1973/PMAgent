---
name: evm-analysis
description: PMI Earned Value Management methodology — formulas, interpretations, forecasting, and EVM report generation guidance.
---

# PMI Earned Value Management (EVM) — Artifact Generation Skill

## Overview

Earned Value Analysis (EVA) compares the **value of work done** against the **value of work that should have been done** at the analysis date. It enables computation of performance indices for cost and schedule, and forecasts project completion.

---

## Core EVM Data Points

Compute these three values at every analysis date:

| Metric | Abbreviation | Question Answered |
|--------|-------------|-------------------|
| **Planned Value (PV)** | PV / BCWS | How much work did we plan to complete by today? |
| **Earned Value (EV)** | EV / BCWP | How much planned work have we actually completed? |
| **Actual Cost (AC)** | AC / ACWP | How much have we actually spent? |

**PV formula:** `PV = BAC × (Scheduled % Complete)`
**EV formula:** `EV = BAC × (Actual % Complete)`
**AC** = actual expenditure recorded to date.

---

## Variance Calculations

### Schedule Variance (SV)
`SV = EV − PV`
- SV < 0 → Behind schedule
- SV = 0 → On schedule
- SV > 0 → Ahead of schedule

### Cost Variance (CV)
`CV = EV − AC`
- CV < 0 → Over budget
- CV = 0 → On budget
- CV > 0 → Under budget

---

## Performance Indices

### Cost Performance Index (CPI)
`CPI = EV / AC`
- CPI < 1 → Over budget (paying more than planned per unit of value)
- CPI = 1 → On budget
- CPI > 1 → Under budget

### Schedule Performance Index (SPI)
`SPI = EV / PV`
- SPI < 1 → Behind schedule
- SPI = 1 → On schedule
- SPI > 1 → Ahead of schedule

### Variance Percentages
`CV% = (EV − AC) / EV × 100`
`SV% = (EV − PV) / PV × 100`

---

## Forecasting

### Estimate at Completion (EAC)
Three methods — choose based on confidence in original estimates:

| Method | Formula | When to Use |
|--------|---------|-------------|
| EAC (CPI-based) | `BAC / CPI` | CPI expected to remain constant |
| EAC (new estimate) | `AC + ETC` | Original estimate no longer valid |
| EAC (SPI+CPI) | `AC + ((BAC − EV) / (CPI × SPI))` | Both cost and schedule pressure apply |

### Schedule at Completion (SAC)
`SAC = Planned Duration / SPI`

### Variance at Completion (VAC)
`VAC_cost = BAC − EAC` (negative = over budget at completion)
`VAC_schedule = Planned Duration − SAC` (negative = late at completion)

### To-Complete Performance Index (TCPI)
`TCPI = (BAC − EV) / (BAC − AC)` — required CPI for remaining work to finish within budget.
- TCPI > 1 → Need to be MORE efficient than to date
- TCPI < 1 → Can afford to be less efficient

---

## EVM Report Generation Rules

When generating an EVM analysis artifact, the agent MUST:

1. **Always display the analysis date** — all metrics are point-in-time.
2. **Show all three base values** (PV, EV, AC) before derived metrics.
3. **State the interpretation** for every index (e.g., "CPI 0.87 = the project is spending $1.15 for every $1.00 of planned value delivered").
4. **Include at least one EAC method** with explicit formula and calculation shown.
5. **Color-code or clearly label RAG status**: Green (within ±5%), Amber (5–10% variance), Red (>10% variance).
6. **Include a narrative summary** explaining the primary driver of any variance (delayed milestone, cost overrun in a specific category, etc.).
7. **Provide a recommendation** — what action is needed to recover cost/schedule performance.
8. **Never fabricate actuals** — if AC data is not provided, clearly mark AC as `[DATA REQUIRED]` and produce a partial analysis.
9. **Cross-reference milestone plan** — identify which milestones are driving SV.

---

## Worked Example Structure

Every EVM report should follow this section order:

1. **Executive Summary** — RAG status, headline CPI/SPI, one-sentence health statement
2. **Data Summary Table** — BAC, PV, EV, AC at analysis date
3. **Variance Analysis** — SV, CV with amounts and percentages
4. **Performance Indices** — CPI, SPI with interpretations
5. **Forecast** — EAC (show method), SAC, VAC
6. **TCPI** — required efficiency to finish within budget
7. **Trend Analysis** — CPI/SPI trend over last 3+ periods (if data available)
8. **Root Cause & Recommendations** — specific actions to improve performance
