# Plan Generator Algorithm — Design v1 (DRAFT)

**Status:** Draft for Mike's review — do not start coding until approved.
**Date:** 2026-05-09
**Author:** Claude (Cowork)
**Supersedes:** none (replaces the trail-only path; complements existing Hyrox path in `src/utils/planGenerator.ts`)

---

## 1. Goal

Build the BA Training App's workout-building algorithm:

> **Onboarding inputs × Training philosophy × Race distance → user-specific training plan, rooted in one of the 8 Phase-1 training methods.**

The data layer is already complete (8 method JSONs, schema, 198/198 tests passing). This phase is about the **engine** that consumes the data + onboarding outputs and emits a personalized week-by-week plan compatible with the existing `TrainingPlan` shape (`src/types/index.ts`).

---

## 2. Inputs — exactly as Onboarding emits them

From `src/hooks/useOnboarding.ts → OnboardingConfig`:

- **raceType** — `'trail' | 'hyrox' | 'general'`
- **raceName** — string (free text — e.g. *"Broken Arrow Skyrace 18K"*)
- **raceDate** — ISO date string (may be empty for general fitness)
- **experienceLevel** — `'first_timer' | 'beginner' | 'intermediate' | 'advanced' | 'elite'`
- **trainingDaysPerWeek** — `3 | 4 | 5 | 6`
- **longRunDay** — `'Saturday' | 'Sunday' | 'Tuesday' | 'Friday'` (trail/general only)
- **weakStation** — string (Hyrox only)
- **wearable** — `'garmin' | 'apple_watch' | 'oura' | 'none'`
- **athleteName, age** — string/number
- **maxHR** — number (optional; falls back to 220-age)
- **ftpWatts** — number (optional, cycling)

> **GAP:** Onboarding does **not** capture **race distance** (5K, 10K, half, marathon, 50K, etc.) or **terrain category** (road/track/trail-rolling/mountain). Both are required to pick a method and set workout volumes correctly. Resolution options listed in §10.

---

## 3. Architecture — six-stage pipeline

```
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Onboarding   │──▶│ 1. Normalize │──▶│ 2. Method Select │──▶│ 3. Plan Skeleton │
│   Config     │   │   inputs     │   │ (rank 8 methods) │   │ (weeks + phases) │
└──────────────┘   └──────────────┘   └──────────────────┘   └──────────────────┘
                                                                      │
                          ┌──────────────────┐   ┌──────────────────┐ │
                          │ 6. Output mapped │◀──│ 5. Personalize   │◀┘
                          │  to TrainingPlan │   │ paces, volumes   │
                          └──────────────────┘   │ + 4. Instantiate │
                                                 │   weekly workouts│
                                                 └──────────────────┘
```

### Stage 1 — Normalize inputs → `EngineInputs`

Resolve gaps before the engine runs:

- **Derive race distance** from `raceName` (regex: `5K|10K|half|marathon|50K|18K|...`); fallback per §10.
- **Derive terrain** from raceType (`trail` → `trail_rolling` default, with hint for mountain if name contains "Sky"/"Vert"/"Mountain"/"Mt").
- **Map experience** → schema enum (`first_timer→beginner` per Daniels' restriction; `recreational→recreational`; etc.). Onboarding's 5-level scale collapses to schema's `beginner/recreational/intermediate/advanced/elite`.
- **Compute plan length** from race date (clamped to method's `supportedPlanWeeks`).
- **Resolve maxHR** (`config.maxHR ?? 220-age`) and **estimate LTHR** (`maxHR × 0.89`) for HR-anchored methods.

### Stage 2 — Method selection

Score each of the 8 methods against the inputs using a weighted rubric over `applicability.byDistance × byExperience × byTerrain × hours/week × restrictions`:

```
BEST=4 · GOOD=3 · OK=2 · CAUTION=1 · NOT_SUITED=0
score = w_d·distance + w_e·experience + w_t·terrain + w_h·hours − penalties(restrictions)
```

- `restrictions[].blocking === false` for all 8 (per Q6 design) → penalize but never exclude.
- Surface **top-3 methods** with their scores + rationale + warnings.
- **Selection mode** to be confirmed (auto / user-picks-from-top-3 / hybrid — see §10 Q2).

### Stage 3 — Plan skeleton

For the chosen method:

- **Total weeks** = number of weeks between today and `raceDate`, snapped to the closest supported value in `generationRules.supportedPlanWeeks`. If race date is missing → use `defaultPlanWeeks`.
- **Phase allocation:** start from `phases[*].pctOfPlan.default`. If total weeks doesn't fit, apply `compressionPriority` (cut from the listed phases first) or `expansionPriority` (add weeks first to the listed phases). Respect each phase's `weekBounds.{minWeeks, maxWeeks}`.
- **Cutback rhythm:** insert recovery weeks per `mileageProgression.cutbackEveryNWeeks` and `cutbackPct`.
- **Taper:** last `taper.durationWeeks` weeks override the phase, applying `weeklyVolumePcts` and `raceWeekSchedule`.

### Stage 4 — Weekly pattern + workout instantiation

For each week:

- **Pick a `weeklyPattern`:** match by `phaseId`, `daysPerWeek` (from onboarding), and `weekType` (`standard` vs `recovery`).
- **Anchor long run** to `longRunDay` from onboarding. If the pattern's long-run day doesn't match the user's preference, rotate the schedule (preserving the pattern's hard/easy spacing — never schedule two hard days back-to-back; honor `minDaysBetweenHardSessions`).
- **Pick a workout** for each scheduled day from `preferredWorkoutIds`. Tie-breakers: phase progression heuristic (early phase → simpler variant; late phase → more race-specific), and rotate through preferred IDs across weeks for variety.
- **Validate workout legality:** check `minimumExperience` and `requiresBaseMileage` against the user; if blocked, fall back to next preferred ID.

### Stage 5 — Personalize paces, HR, volumes

For each instantiated workout segment:

- **Pace** — apply `paceFormula` against the anchor:
  - `recent_race_time` methods (Daniels, Pfitz, Hansons): VDOT or LT-pace tables (Daniels VDOT table embedded as static lookup; Pfitz LT pace = 15K-half pace).
  - `lthr` methods (Fitzgerald 80/20, Koop): convert `paceFormula.hrRange` × user LTHR.
  - `aet` methods (Roche): use AeT estimate (~75% of maxHR or HR-cap rule).
  - `self_assessed_pace` (Higdon, Galloway): RPE descriptor only — no quantitative pace.
  - **Fallback chain:** `primaryAnchor → fallbackAnchor → RPE`.
- **HR zone** — populate from `paceZone.hrRange` × `maxHR` (or LTHR).
- **Volume** — start from `mileageProgression.startMileagePctOfPeak` × peak; ramp by `maxWeeklyIncreasePct`; cap long run by `longRunPctCap`.
- **Invariants check** — enforce every rule in `generationRules.invariants` (e.g. *"Long run must not exceed 30% of weekly mileage"*, *"I-pace volume ≤ 8% of weekly mileage"*).

### Stage 6 — Output → existing `TrainingPlan` shape

The engine returns the existing `TrainingPlan` interface (`src/types/index.ts:243`), populated as:

- `athlete`: `AthleteProfile` from onboarding (name, maxHR, ftpWatts).
- `zones`: `HRZone[]` derived from method's pace zones × user maxHR/LTHR.
- `race`: `RaceInfo` from onboarding + parsed race distance.
- `weeks[]`: `TrainingWeek[]`, each with 7 `PlannedDay` entries (`day`, `type`, `workout`, `detail`, `zone`, `route`, `time`).

> **Decision needed (§10 Q4):** keep `PlannedDay` (string-based) for backward compatibility with the existing UI/grader, OR introduce a richer Level-3 `PlannedWorkout` that mirrors the schema (warmup + mainSet[] + cooldown + cues). Recommendation: emit BOTH — keep `PlannedDay` strings as the rendered surface for the existing UI, attach a typed `PlannedWorkout` reference for the new detail view + coach context.

---

## 4. Module layout in `src/`

Proposed (TypeScript, strict mode, mirrors the existing `src/engines/` convention):

```
src/
├── data/methods/
│   ├── daniels.json           ← copied from uploaded data layer
│   ├── pfitzinger.json
│   ├── hansons.json
│   ├── higdon.json
│   ├── galloway.json
│   ├── fitzgerald_8020.json
│   ├── koop.json
│   ├── roche_swap.json
│   └── index.ts               ← typed registry
├── types/
│   └── training-method.ts     ← from uploaded `types/training-method.ts`
├── schema/
│   └── training-method.schema.json
└── engines/
    └── plan-builder/
        ├── index.ts           ← public API: `buildPlan(config) → TrainingPlan`
        ├── normalize.ts       ← Stage 1
        ├── selectMethod.ts    ← Stage 2
        ├── skeleton.ts        ← Stage 3 (phases, cutbacks, taper)
        ├── weeklyPattern.ts   ← Stage 4
        ├── personalize.ts     ← Stage 5 (pace formulas, HR zones, volumes)
        ├── invariants.ts      ← rule enforcement
        ├── danielsVdot.ts     ← VDOT lookup table
        └── output.ts          ← Stage 6 (map to TrainingPlan/PlannedDay)
└── __tests__/engines/plan-builder/
    ├── normalize.test.ts
    ├── selectMethod.test.ts
    ├── skeleton.test.ts
    ├── personalize.test.ts
    ├── invariants.test.ts
    └── golden/                ← snapshot plans for each (method × user) combo
```

---

## 5. Public API

```ts
// src/engines/plan-builder/index.ts
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingPlan } from '../../types'

export interface BuildPlanResult {
  plan: TrainingPlan
  methodId: string
  methodScore: number          // 0–1, how well the method fits
  alternativeMethods: { id: string; score: number; rationale: string }[]
  warnings: string[]           // restriction triggers that fired
  parsedRace: { distance: string; distanceMiles: number; terrain: string }
}

export function buildPlan(config: OnboardingConfig): BuildPlanResult
```

Pure function. No I/O, no fetches. Method JSONs imported at build time.

---

## 6. Race-type coverage

| `raceType` | Engine path | Notes |
|---|---|---|
| `trail` | **NEW plan-builder** (this design) | All 8 methods in scope; method picker filters by terrain. |
| `general` | **NEW plan-builder** | Default to Higdon or Fitzgerald 80/20 (best for general fitness). |
| `hyrox` | **Existing** `src/utils/planGenerator.ts` | Unchanged for now — out of scope for the 8-method library. Re-evaluate post-MVP. |

Implication: the new `plan-builder/index.ts` is invoked when `raceType ∈ {trail, general}`; the existing Hyrox generator stays.

---

## 7. Validation strategy (per Mike's QA standard)

- **Unit tests** for every stage — Vitest, ≥90% line coverage on the new module.
- **Schema-layer tests** — re-run the uploaded `training-method.test.ts` after copying method JSONs into the repo (must hit 198/198 again).
- **Property-based tests** for invariants — generate random valid `OnboardingConfig` inputs (fast-check) and assert plan invariants always hold (long-run cap, intensity caps, taper monotonicity, `minDaysBetweenHardSessions`).
- **Golden plan snapshots** — one per representative (method × user) pairing (e.g. *Daniels + intermediate + marathon*, *Roche + advanced + 50M*) — committed and diffed in CI.
- **TypeScript strict-mode compile check** — `npx tsc --noEmit`.
- **Lint** — `npm run lint`.

Done = **all** of: tests pass, lint passes, tsc passes, golden plans look right after manual review.

---

## 8. Version control & artifacts

- New work goes on a feature branch: `feat/plan-builder-engine`.
- Atomic commits per stage (normalize → selectMethod → skeleton → weeklyPattern → personalize → invariants → output → tests).
- This plan doc lives at `docs/PLAN_GENERATOR_ALGORITHM.md`.
- Older versions move to `docs/Archive/` once superseded.
- PR description includes the test report + a sample generated plan for a known user.

---

## 9. Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Plan approval (now)** | This doc + clarifying questions answered | Mike approves, §10 questions resolved |
| **1. Data layer import** | Copy schema + 8 JSONs into repo, wire vitest config | 198/198 tests pass in repo |
| **2. Stages 1–3** | Normalize, method-select, skeleton + tests | Unit tests pass |
| **3. Stages 4–5** | Weekly pattern + personalize + tests | Golden plans for 2 methods look right |
| **4. Stage 6 + integration** | Map to TrainingPlan, wire into App | App renders a generated plan end-to-end |
| **5. QA & polish** | Property tests, edge-case audit, doc updates | All §7 gates green |

---

## 10. Open questions (need Mike's input)

1. **Race distance source.** Onboarding captures `raceName` as free text only. Where do we get the canonical distance (5K, half, marathon, 50K, etc.)?
2. **Method selection mode.** Auto-pick the top-scoring method, or surface top-3 and let the user choose, or hybrid (auto-pick + offer to switch)?
3. **Data layer location in repo.** `src/data/methods/` (consistent with existing `src/data/`), or `data/methods/` at the repo root (matches uploaded README)?
4. **Output shape.** Use only existing `PlannedDay` strings (works with current UI, less detail), or emit a richer typed `PlannedWorkout` alongside (more work, but Level-3 detail flows through to the coach)?

Recommendations baked into questions below.

---

## 11. Trade-offs already made (and why)

- **TypeScript engine, not Python.** The app is Vite/React/TS; runtime engine must be TS. The Python validator stays as a CI pre-commit hook only.
- **Pure function, no I/O.** Makes testing trivial and lets the engine run client-side or in a worker.
- **Data layer imported as JSON modules.** Static at build time → tree-shakeable, type-safe via the schema.
- **Existing Hyrox generator untouched.** Don't rewrite working code; the 8 methods are run-only.
- **Restrictions warn, never block.** Honors the schema's Q6 design directive.
