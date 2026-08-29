# Initiative registry

One row per initiative, one global ID sequence. This file answers the question
that currently takes `git log --grep` archaeology: **what was this PR series,
and where is the thinking behind it?**

## When an initiative folder is required

Only when the work is expected to span **≥3 PRs or ≥2 sessions, touches a
deploy surface, or changes a locked decision.** Everything below that bar has
its PR description as the record — no folder, no row.

That threshold is deliberate. At this repo's cadence (68 PRs in the 13 days to
2026-08-28, 15 of them on 2026-08-26 alone) a folder-per-PR convention would be
abandoned inside a week, which is precisely how the last set of process rules
died.

## The chain

```
intent.md      written BEFORE analysis — one page, five sections
analysis.md    optional — the audit or research the plan rests on
plan.md        the build plan, PR-numbered
               ↓ each PR references the initiative ID
close-out      status flipped here and in the row below; superseded docs
               stamped and moved to docs/archive/ in the same commit
```

## Numbering

IDs are `NNN` from this one sequence and never restart. Historically the repo
carried **three** unrelated R-series and **six** independent restart-at-1
series (`[PR-01]`, `PR-1`, `PR-2…PR-11`, `Phase 1–3` twice, `Phase 1–5`,
`Adaptive engine PR 1–9`), which makes older commit subjects ambiguous to any
future session. Initiative IDs are global; a series' own internal numbering
(R0–R4, G1–G10) stays local to its plan doc.

## Registry

| ID | Initiative | Status | PRs | Artifacts |
|----|------------|--------|-----|-----------|
| 001 | SDLC uplevel — gates, artifact chain, standing instructions | Open | — | [intent](001-sdlc-uplevel/intent.md) |
| 002 | eslint to zero, then make it a required gate | Open | — | [intent](002-eslint-to-green/intent.md) |

### Backfilled — pre-convention (recorded 2026-08-29 while the commits were still fresh)

These four shipped before this registry existed. Rows are reconstructed from
git history; none had an intent doc, and only the first had any plan doc
committed before building.

| ID | Initiative | Status | PRs | Plan committed first? |
|----|------------|--------|-----|----------------------|
| 000-a | Running plan generator — audit → R0–R4 roadmap | Shipped 2026-08-18 | #306–#311 | **Yes** — [`running-plan-audit.md`](../running-plan-audit.md) landed as #306, R0–R4 shipped the same day |
| 000-b | Gap-closure G1–G10 | Shipped 2026-07-07/08 | merge PRs #270–#272, internally PR-1…PR-11 | **Yes** — [`gap-closure-build-plan.md`](../gap-closure-build-plan.md) |
| 000-c | Hyrox product plan P0–P6 | Shipped 2026-08-16/17 | #296–#305 | No — the P-numbering exists only in commit subjects. Evidence audit and expert packet landed mid-series |
| 000-d | PRD-101–110, Phases 1–5 | Shipped 2026-08-18 | #312–#319 | No — PRD numbering survives in ~20 source files and in `PLAN_GENERATOR_ALGORITHM.md`, but the sequencing (which PR, in what order, why) exists nowhere |
| 000-e | Adaptive engine PR 1–9 | Shipped 2026-08-26 | #344–#352 | No |

The pattern those rows record is the reason for this registry: **the chain ran
when the work started from a document, and broke when it started from chat.**
Both happened in the same week of August — 000-a and 000-d shipped on the same
day.
