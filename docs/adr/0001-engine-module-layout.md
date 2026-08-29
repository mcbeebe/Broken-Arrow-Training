# ADR 0001 — Engine module layout under `src/engines/`

**Status:** Accepted — still in force
**Date:** 2026-04-24
**Context PR:** [PR-01] Add `src/engines/` module boundary

> **Dead references (noted 2026-08-29).** This ADR cites
> `specs/terrain-descent-engine-v1/`, `BA_Terrain_Descent_Engine_Spec_v1.0.docx`,
> `BA_DataFlow_v2.html` and `BA_Executive_Summary_v3.html`. None of these was
> ever committed to this repo — `git log --all -- 'specs/*'` and `find . -name
> 'BA_*'` both come back empty. The decision below stands on its own; treat the
> citations as pointers to material that lives outside version control.

## Context

The Broken Arrow Training App ships five domain engines: **Readiness**, **MIM** (Musculoskeletal Impact Modifier), **Terrain**, **Descent-Load**, and **Altitude**. Today the live engines (Readiness, MIM) live in `src/utils/` next to unrelated helpers. The Terrain and Descent specs in [`specs/terrain-descent-engine-v1/`](../../specs/terrain-descent-engine-v1/) call for a clean module boundary so each engine can grow independently with co-located tests, fixtures, and docs.

`BA_Terrain_Descent_Engine_Spec_v1.0.docx` §7.3 and §11.2 propose one folder per engine under a single `src/engines/` namespace.

## Decision

Adopt the layout:

```
src/engines/
  index.ts            # re-exports each engine as a namespace
  readiness/index.ts  # re-exports src/utils/readiness (no logic move)
  mim/index.ts        # re-exports src/utils/trimp     (no logic move)
  terrain/index.ts    # empty barrel — populated by PR-03+
  descent/index.ts    # empty barrel — populated by PR-08+
  altitude/index.ts   # empty barrel — populated by Phase 4 sprints
```

Engine ownership:

| Engine | Owns | First populated in |
|--------|------|---------------------|
| `readiness` | ATE composite, Plews CV guardrail, Meeusen NFOR, training-state classifier | already live (re-export only) |
| `mim` | Banister TRIMP, MIM matrix, DOMS carry-forward, sport classifiers | already live (re-export only) |
| `terrain` | Minetti GAP, segment profiles, gait crossover, vertical efficiency | PR-03 (Minetti coefficients) |
| `descent` | Eccentric bucketing, eccentric-TRIMP, repeated-bout protection, DOMS forecast | PR-08 (eccentric bucket) |
| `altitude` | Hypoxic dose, acclimatization sigmoid, intensity dampening, AMS red-flag | future (Phase 4 sprints S10, S11) |

## Consequences

**Positive.**
- Future engine PRs (Terrain, Descent, MIM grade-modifier hook) land entirely under `src/engines/<name>/` with co-located `__tests__/engines/<name>/`. No edits to `src/utils/` are required for new engine logic.
- React components import from a domain hook (`useTerrain`, `useDescent`), never directly from `src/engines/`. Keeps the engine layer pure and testable.
- The five-engine namespace mirrors the architecture diagram in `BA_DataFlow_v2.html` and the engine-status badges in `BA_Executive_Summary_v3.html`.

**Neutral.**
- This PR is a **re-export only**. No callers are migrated; the shipped app continues to import from `src/utils/readiness` and `src/utils/trimp`. The engine barrels are an additive surface for new code.

**Negative.**
- Two import paths now exist for the same symbols (`src/utils/readiness` and `src/engines/readiness`). Acceptable as transitional state; a follow-on PR (out of scope for v1.0) may collapse the duplicate once all callers move to the engine surface.

## Compliance

- All 12 existing test files in `src/__tests__/` remain green.
- `src/utils/{readiness,trimp,strava,garmin}.ts` are not modified by PR-01.
- Coverage: the new barrel files are tested via `src/__tests__/engines/boundary.test.ts`, which asserts that engine re-exports resolve to the same symbols as their `src/utils/` originals.
