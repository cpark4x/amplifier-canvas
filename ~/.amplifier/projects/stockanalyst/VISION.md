---
last_updated: 2026-04-14
updated_by: "Chris Park"
---

## Summary

A personal financial projection and scenario modeling tool for a family of four (Chris 47, Laura, Mason 12, Charlotte 9) targeting retirement at age 55 with $5M in investable assets and zero mortgage debt. The tool ingests real account data, models growth scenarios, and surfaces the decisions that matter most on the path to early retirement.

## Problem

Today there is no single place to see the full picture and run "what if" scenarios against it. The financial state is spread across Fidelity (retirement + brokerage + HSA + 529s), Chase (cash + CDs), and a mortgage with HomeStreet Bank. Existing tools (Fidelity's planning, spreadsheets) either don't model the full picture or require manual updates that decay.

Specific pain points:
- **No unified view** — $2.75M across 10+ accounts at Fidelity, $25K across 7 Chase accounts, and a ~$500K Chelan mortgage. The total picture requires mental assembly.
- **No scenario modeling** — "Should I pay off Chelan early or invest that cash?" has no easy way to compare outcomes over 8 years.
- **No withdrawal strategy modeling** — ~50% of wealth is tax-advantaged (401k + IRA) and can't be accessed penalty-free until 59½. Retiring at 55 means 4.5 years of living off taxable accounts + Roth ladder or 72(t) distributions. This needs modeling.
- **529 underfunding is invisible** — $11K total for two kids with college starting in 6 years. The gap isn't quantified.
- **Cash reserves are thin** — $25K liquid for a family of four. No visibility into whether this is adequate given the overall plan.

## Solution

A projection engine that takes the current financial snapshot as input and answers the core question: **"What are my paths to $5M + no mortgage by age 55?"**

Core capabilities:
1. **Snapshot ingestion** — Import current balances across all accounts (manual entry initially, Fidelity/Chase CSV import as a stretch goal).
2. **Projection modeling** — Given savings rate, market return assumptions, and contribution allocations, project portfolio growth year-by-year from age 47 to 55 (and through 65 for withdrawal modeling).
3. **Scenario comparison** — Compare 2-3 scenarios side-by-side (e.g., "aggressive payoff" vs. "invest and carry mortgage" vs. "balanced").
4. **Mortgage payoff modeling** — Model extra payments against the Chelan mortgage and their impact on the total net worth trajectory.
5. **Tax-aware withdrawal simulation** — Model the "bridge years" (55-59½) showing which accounts to draw from and the tax implications.
6. **529 gap analysis** — Given target college costs for Mason (2032) and Charlotte (2035), show the contribution needed to close the gap.

## Current Financial State (April 2026)

| Category | Amount |
|----------|--------|
| Retirement (401k + Rollover IRA) | $1,377,733 |
| Taxable Brokerage (2 TOD accounts) | $1,268,008 |
| HSA | $89,703 |
| 529 Plans (Mason + Charlotte) | $11,165 |
| ESPP | $1,565 |
| Chase Cash + CDs | $25,182 |
| **Total Assets** | **$2,773,356** |
| Chelan Mortgage (est. remaining) | ~$490,000 |
| **Net Worth** | **~$2,283,000** |

## Non-Goals

- **Not a budgeting or expense tracking tool.** We are not building Mint or YNAB. No transaction categorization, no spending alerts, no linking bank feeds.
- **Not a stock picker or trading tool.** No individual stock analysis, no buy/sell signals, no portfolio rebalancing recommendations.
- **Not a tax preparation tool.** No tax filing, no form generation. Tax implications are modeled directionally, not to IRS precision.
- **Not a financial advisor replacement.** The tool models scenarios — it does not give advice. Decisions remain with the user.
- **Not multi-user.** This is for Chris and Laura's household. No auth, no multi-tenant, no sharing features.

## Who It's For

Chris Park — a 47-year-old software professional with a working spouse, two kids, and a clear retirement target. Tech-literate, comfortable with data, wants to see the math, not just the conclusion. Secondarily, Laura (spouse) as a consumer of the projections and scenario comparisons.

## Principles

- **We value projections over tracking.** The past is less interesting than the future. Show where we're headed, not where we've been.
- **We value clarity over completeness.** A clear answer to "am I on track?" beats a comprehensive dashboard with 50 metrics. Surface the 3-4 numbers that matter.
- **We value scenarios over single forecasts.** The future is uncertain. Always show a range (conservative / expected / optimistic) rather than a single line.
- **We value low maintenance over real-time accuracy.** A tool that works with quarterly manual updates beats one that requires daily data feeds and breaks when APIs change.