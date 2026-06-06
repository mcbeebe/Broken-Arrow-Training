# General Fitness Engine — Design v1 (DRAFT)

**Status:** Draft for Mike's review — do not start coding until approved.
**Date:** 2026-06-05
**Author:** Claude (Cowork)
**Grounded in:** `docs/research/General_Fitness_Training_Evidence_Foundation_v1.1.docx` (~64 adversarially-verified claims + a goal-preset layer)
**Complements:** `docs/PLAN_GENERATOR_ALGORITHM.md` (the trail/road 8-method engine). This doc covers ONLY `raceType: 'general'`, which is a stub today (dead-ends on a "coming soon" screen in `src/App.tsx`).

---

## 1. Goal

Build `generateGeneralFitnessPlan(config) → TrainingPlan` for the **General Fitness path** — users with **no target race** who want overall fitness and healthspan.

> **One 4-pillar engine × a goal preset × the user's inputs → a personalized, open-ended weekly plan that progresses and auto-deloads.**

Unlike Trail (8 named running methods) and Hyrox (one built-in model), General Fitness is **event-less**. The organizing principle is a **rolling block** (not a countdown to a peak), with an *optional* goal-horizon.

---

## 2. Architecture

```
OnboardingConfig (general)
        │
        ▼
┌───────────────────┐   ┌────────────────────┐   ┌──────────────────────┐
│ 1. Normalize      │──▶│ 2. Apply goal      │──▶│ 3. Block planner     │
│   inputs          │   │    preset (dials)  │   │  (rolling / horizon) │
└───────────────────┘   └────────────────────┘   └──────────────────────┘
                                                            │
        ┌────────────────────┐   ┌────────────────────┐    │
        │ 6. Map →           │◀──│ 5. Personalize     │◀───┘
        │   TrainingPlan     │   │  paces/HR/loads    │
        └────────────────────┘   │ + 4. Lay out week  │
                                  └────────────────────┘
```

**Four pillars** (every plan blends these; the preset re-weights them):
1. **Aerobic base (Zone 2)** — bulk of weekly aerobic minutes.
2. **VO₂max / intervals** — the longevity multiplier (fitness ↔ mortality, HR 0.20).
3. **Strength** — ≥2 days/wk floor; volume dialed by goal.
4. **Mobility / stability** — dynamic warm-up every session; flexibility after; balance for 65+.

**Goal presets** (the dials): **Stay Healthy** (balanced) · **Lose Fat** · **Build Muscle** · **Build Endurance**. A preset = pillar weighting + a small set of rule overrides on the *same* engine. **Modality** (run / bike / row / swim / gym) is an **input** that colors cardio sessions — never its own path.

---

## 3. Inputs — and the one onboarding gap

From `src/hooks/useOnboarding.ts → OnboardingConfig` (general path already collects):

- `experienceLevel` — `first_timer … elite`
- `trainingDaysPerWeek` — 3–6
- `longRunDay` — repurposed as **"longest/anchor workout day"**
- `strengthDaysPerWeek`, `strengthExperience`
- `crossTrainingModes` (cycling/swimming/rowing/hiking/yoga), `crossTrainingDaysPerWeek`
- `equipmentAccess` (track/hills/treadmill/trails/gym)
- `injuryStatus` (+ area/timeframe/note), `age`, `maxHR`, `fitnessAnchor`, `detailLevel`

> **GAP — onboarding has no GOAL field.** The general path must add a **goal-selection step** (Stay Healthy / Lose Fat / Build Muscle / Build Endurance) and an **optional horizon** ("just keep me progressing" vs. "I have a date/milestone"). New `OnboardingConfig` fields proposed:
> ```ts
> generalGoal?: 'stay_healthy' | 'lose_fat' | 'build_muscle' | 'build_endurance'  // default 'stay_healthy'
> goalHorizonWeeks?: number   // unset = rolling/open-ended
> cardioModality?: CrossTrainingMode | 'running'  // primary cardio; default from equipment/cross-training
> ```

---

## 4. The four pillars — evidence-based dosing

| Pillar | Dose (balanced default) | Anchor / cue | Source (v1.1) |
|---|---|---|---|
| Zone 2 | bulk of 150–300 min/wk | 64–76% HRmax / 40–59% HRR; Talk Test ≈ VT1 | WHO/US-PAG; MICT meta 2026 |
| VO₂max | 1×/wk (4×4 @ 90–95% / 3 min @ 70%, ×4; or 15/15) | "hard, few words only" | Helgerud 2007; Mandsager 2018 |
| Strength | ≥2 days/wk, all major groups; ~6–10 sets/muscle/wk | RIR/RPE for experienced; simple loading for novices | WHO; Schoenfeld; Shailendra 2022 |
| Mobility | dynamic warm-up ~7–10 min every session; flexibility post; balance for 65+ | RAMP pattern | Behm 2011; Sherrington 2020 |

Intensity split ~**80/20 easy:hard**, model-agnostic (don't force strict polarized). **Interference is negligible** for general fitness → blend cardio + lifting freely; only **lift-before-cardio** if a single session must be shared.

---

## 5. Goal presets — the dials

| Pillar / dial | Stay Healthy | Lose Fat ✓ | Build Muscle ⚠ | Build Endurance ⚠ |
|---|---|---|---|---|
| Zone 2 cardio | 150–300 min | ↑ + optional density/circuit | ~150 min (floor) | ↑↑ 300+ min, gradual |
| VO₂max / HIIT | 1×/wk | 1–2×/wk (time-efficient) | 0–1×/wk | 1–2×/wk + 1 tempo |
| Strength sets/muscle/wk | ~6–10 | ~10–12 (heavy, muscle-sparing) | 12–20 (2×/wk, 0–3 RIR) | ~6 (heavy, 1–2×/wk, economy) |
| Mobility/stability | standard | standard | standard | standard + long easy session |
| Emphasis | balance | spare lean mass; visceral fat | hypertrophy volume | aerobic volume |
| Extra rule | — | step floor ~8.5k/day; 0.5–1%/wk framing | loads ~6–15 reps incl. heavy | ~10%/wk volume ramp; threshold accent |

✓ verified · ⚠ extracted, pending verification. (Lose Fat's "diet drives the deficit" framing is messaging, not a training lever.)

---

## 6. Weekly scheduler (Stage 4)

For `trainingDaysPerWeek ∈ {3,4,5,6}`, lay out pillar sessions honoring:
- **Anchor** the longest/key session to `longRunDay`.
- **Hard/easy spacing** — never two hard days (VO₂max/heavy strength/threshold) back-to-back; honor a `minDaysBetweenHardSessions` of 1.
- **Interference rule** — separate cardio & lifting onto different days where days allow; if combined, **resistance first** (only matters when sharing a session).
- **Modality** — cardio sessions inherit `cardioModality`; cross-training days use `crossTrainingModes`; respect `equipmentAccess`.

Representative balanced templates (full per-preset matrices in the build):

| Days | Layout (balanced) |
|---|---|
| 3 | Full-body strength · Zone 2 (+ short intervals) · Full-body strength + mobility |
| 4 | Strength · Zone 2 · Strength · VO₂max (or long Z2) |
| 5 | Strength · Zone 2 · VO₂max · Strength · long Zone 2 |
| 6 | Upper · Zone 2 · Lower · VO₂max · Push/Pull/Legs or Zone 2 · long Zone 2 |

> Day-count templates are **design inference** — the evidence supports the *principles* (spacing, order, ~80/20, ≥2 strength days), not numbers keyed to a specific weekly frequency. Lock templates as golden snapshots (§11).

---

## 7. Hybrid block structure & progression (Stage 3)

**Default = rolling, open-ended.** No end date.
- **Progressive overload:** ramp the dialed-up pillar gradually (strength: double-progression / add a set; endurance: ~+10%/wk volume guideline, capped). Hold non-emphasis pillars at their floor.
- **Auto-deload:** insert a lighter week on a **fatigue trigger** (sustained performance drop + elevated RPE + poor sleep/mood) with a **default cadence of ~every 4–8 weeks** (design choice — evidence supports trigger-based, gives no fixed number).
- **Re-baseline** periodically from wearable/feedback.

**Optional horizon** (`goalHorizonWeeks` set): reuse the existing race-date/countdown machinery to periodize toward a soft milestone, then prompt to re-up and fall back to rolling.

No taper/peak by default; monitor a readiness **panel**, not any single biomarker.

---

## 8. Personalization levers

- **Experience:** beginners → weight Zone 2, conservative intensity, simple structured loading (they can't sustain a high hard-fraction; periodization benefit is actually larger in novices). Advanced → autoregulation (RIR), higher strength volume.
- **Age (60+):** prescribing *above* the aerobic floor is beneficial where tolerated; **balance/stability becomes a core pillar**, not optional.
- **Injury / return-to-training:** start low (e.g., ~120 min/wk strength over 3 sessions for sarcopenic/older beginners), progress as tolerated, prefer low-impact modalities.

---

## 9. Output → existing `TrainingPlan` shape (Stage 6)

Return the existing `TrainingPlan` (`src/types/index.ts`), matching the trail/Hyrox engines:
- `athlete` from onboarding; `zones` from method-agnostic %HRmax/HRR bands × maxHR; `race` becomes a **goal descriptor** (name = preset label, no date unless horizon set); `weeks[]` of `TrainingWeek` with 7 `PlannedDay` entries (`day`, `type`, `workout`, `detail`, `zone`, `route`, `time`).
- Keep `PlannedDay` strings as the rendered surface (back-compat with the current UI/grader); optionally attach a typed `PlannedWorkout` for the detail view + coach context (same open question as the trail engine, §10 there).

---

## 10. Integration

- **New engine:** `src/engines/generalFitness/index.ts → generateGeneralFitnessPlan(config)`, mirroring `src/engines/planGenerator/` conventions. Pure function, no I/O.
- **Routing:** in `src/App.tsx`, replace the `raceType === 'general'` "coming soon" fallback with a call to the new engine.
- **Onboarding:** add the **goal-selection step** + optional-horizon + cardio-modality default (see §3). Skip method selection (general has none). Add a post-onboarding primer for the chosen goal.
- **Coach:** pass the preset + pillar dials into coach context so daily guidance matches the goal.

---

## 11. Validation / QA (per Mike's standard)

- **Unit tests** per stage (normalize, preset application, scheduler, progression, output) — ≥90% line coverage on the new module.
- **Property tests** — random valid `OnboardingConfig` (general) → assert invariants always hold: ≥2 strength days when strength requested, no back-to-back hard days, weekly aerobic within the preset band, deload inserted on cadence, long session on `longRunDay`.
- **Golden snapshots** — one per (preset × days-per-week × experience) representative cell, committed and diffed in CI.
- **tsc strict + lint** green.
- Done = tests + lint + tsc pass and golden plans look right on manual review.

---

## 12. Open decisions (need Mike's input)

1. **Onboarding goal step** — add the 4-goal selector + optional horizon now, or ship Stay-Healthy-only first and add goals in a fast-follow? (Recommend: add the selector now; default `stay_healthy`.)
2. **Build Muscle / Build Endurance rigor** — these presets are built on *extracted, not-yet-verified* evidence. Ship behind the verified Lose Fat + Stay Healthy, or run their verification passes (when the API recovers) before they go live?
3. **Output shape** — `PlannedDay` strings only (works today), or also emit typed `PlannedWorkout` (richer coach/detail, more work)? (Same fork as the trail engine — recommend matching whatever that engine lands on.)
4. **Deload cadence default** — confirm ~4–8 week trigger-based deload as the shipping default (evidence gives no fixed number).
5. **Modality default** — infer primary cardio from `equipmentAccess` + `crossTrainingModes`, or ask explicitly in onboarding?

---

## 13. Phasing

| Phase | Scope | Exit |
|---|---|---|
| 0. Approval (now) | This doc + §12 answered | Mike approves |
| 1. Types + onboarding goal step | `generalGoal`/horizon/modality fields + UI | Onboarding emits a goal |
| 2. Engine stages 1–3 | normalize → preset → block planner + tests | Unit tests pass |
| 3. Stages 4–6 | scheduler + personalize + output + tests | Golden plans for Stay Healthy + Lose Fat look right |
| 4. Integration | wire into App.tsx, coach context | App renders a general plan end-to-end |
| 5. Remaining presets + QA | Build Muscle / Build Endurance (verify first per §12.2), property tests | All gates green |
