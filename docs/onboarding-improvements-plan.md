# Onboarding → Plan-Generation Improvements — PRD & Build Plan

> **Status:** P0 ✅ · P1 ✅ · P2 ✅ — all 11 improvements shipped; all 12 weaknesses resolved.
> Coach welcome-letter narration of advisories also shipped (PR #250), completing all three advisory surfaces.  
> **Created:** 2026-06-14 · **Owner:** engineering  
> **Companion doc:** [`docs/onboarding-logic-flow.html`](./onboarding-logic-flow.html) — the audited logic
> map (3 engines, 50-scenario audit, weaknesses, live explorer). This file is the actionable build plan
> that resolves the weaknesses that doc surfaced.

## Context

The onboarding → plan-generation review audited 50 scenarios across the three engines (method-based
running, Hyrox, General Fitness) and surfaced **12 structural weaknesses** and **11 prioritized
improvements**. This plan fleshes those improvements into user stories + product specs and a phased
build that **resolves every exposed weakness** as fully as practical.

The goal: stop the engine producing confidently-wrong or silently-incomplete plans — back-dated
calendars, ignored goal times, impossible goals, road-races-scored-as-trail, blind spots in Hyrox,
inconsistent maxHR — and make the engine's honest limits visible to the athlete.

**Decisions locked (product):**
- **Feasibility** = *warn + suggest a realistic alternative*, never hard-block (athlete keeps autonomy).
- **maxHR** = switch to **Tanaka (208 − 0.7·age)**, route all engines through one shared helper with a
  consistent floor, and prompt for a measured maxHR/LTHR. (Accepts a small zone shift for existing
  estimated athletes — more accurate, especially for masters.)
- **Rollout** = **P0 first** (one PR), then P1 and P2 as follow-up PRs.

Per the team's Witchel 3-rule check, user-facing choices below carry the check inline (massive market ·
visceral solve · customer language).

## Cross-cutting architecture (built once, used by many)

1. **Plan advisories model** — `PlanAdvisory { id; severity: 'info'|'caution'|'critical'; title; detail;
   suggestion? }` on `TrainingPlan.advisories?`. One honest-warning vocabulary surfaced where they exist:
   - **MethodSelection** (`src/components/MethodSelection.tsx`) renders per-method `warnings[]` in amber
     boxes — a plan-level advisories block sits above the cards.
   - **Summary** — advisories render with the existing `InsightNote` primitive
     (`src/components/primitives/InsightNote.tsx`) above `PlanAtAGlance`.
   - **Coach** ✅ — the `CoachSnapshot` build (`src/App.tsx`, alongside `injuryContext` /
     `menopauseContext`) summarizes the advisories into `advisoriesContext`, and
     `build_context_block` (`api/coach/_core.py`) emits a `PLAN ADVISORIES:` line so the welcome
     letter acknowledges them plainly instead of writing around them. Keyless harness test locks
     the rendering + gating. *(PR #250.)*
2. **Feasibility module** — `src/engines/planGenerator/feasibility.ts`: pure `assessFeasibility(config,
   today, method?) → PlanAdvisory[]`. Reuses `athleteCurrentVdot()` / `vdotFromRace()` and a
   `predictRaceTime()` inverse to translate a "realistic VDOT" into a concrete suggested time.
3. **Shared heart-rate util** ✅ (P1-7) — `src/utils/heartRate.ts`: `computeMaxHR(config)`
   (Tanaka + one floor) and `computeHrZones(maxHR)` (single 5-zone source of truth). Replaces the 4
   duplicate maxHR sites and 3 divergent zone copies.

---

## P0 — shipped ✅

### P0-1 · Guard the minimum runway → resolves weakness #1 (short runway back-dates the plan)
- **User story:** *As a runner who signs up close to race day, I want a plan that starts today and is
  honest about my runway, so I never open a schedule whose week 1 is already in the past.*
- **Spec:** Compute `weeksUntilRace` first; clamp the plan so the back-counted calendar can never start
  before today (a race closer than the method minimum compresses into the weeks available). Emit a
  `caution`/`critical` "Tight runway" advisory.
- **Acceptance:** race ~2 wk out → plan length ≤ ~3 wk, week 1 ≥ today, advisory shown.
- **Implemented in:** `src/engines/planGenerator/generatePlan.ts` (runway clamp + `daysBetween` helper).
- **Witchel:** market = registration peaks <12 wk out · solve = "my plan started 6 weeks ago" is instantly
  trust-killing · language = "Is there enough time before race day?"

### P0-2 · Never silently drop the goal time → resolves weakness #3 (goal ignored without an anchor)
- **User story:** *As an athlete who enters a goal time but no recent race, I want paces aimed at my goal
  (clearly caveated), so the app never quietly ignores the target I gave it.*
- **Spec:** Goal time + no anchor → derive paces from the goal's VDOT (advisory flags they're
  goal-derived). Both present → existing goal-blend (capped +8% VDOT).
- **Acceptance:** goal-only config → concrete `/mi` paces + a `goal_no_anchor` advisory.
- **Implemented in:** `src/engines/planGenerator/generatePlan.ts` (`goalOnly` → `resolvePaces` with
  `vdotOverride`).
- **Witchel:** market = almost everyone enters a goal, many skip the optional anchor · solve = "I told it my
  goal and it ignored me" · language = "What pace do I need to hit my goal?"

### P0-3 · Honest feasibility check → resolves #2 (no feasibility gate) + #4 (goal vs base), mitigates #12
- **User story:** *As an aspirational athlete, I want the truth about whether my goal is realistic in the
  time I have and a smart interim target, so I train toward something achievable.*
- **Spec:** Score distance × experience × base × runway × goal-vs-fitness. Red → **warn + suggest a
  realistic alternative** (e.g. realistic time from `currentVdot × 1.08`; "an ultra is a big step — consider
  a 50K first"). Never blocks. Shown above the method cards and on the plan surface.
- **Acceptance:** beginner→100mi / 2:50-off-15mi / extreme goal each warn with a concrete alternative;
  realistic athletes produce none.
- **Implemented in:** `src/engines/planGenerator/feasibility.ts`; surfaced in `MethodSelection.tsx` and
  `Summary.tsx`; attached to `plan.advisories`.
- **Witchel:** market = first-ultra / big-PR signups are huge · solve = prevents injury + slow betrayal ·
  language = "Can I actually do this in time?"

**Bonus fix (found during P0):** the runway clamp exposed a latent **infinite loop in
`allocatePhaseWeeks`** (the delta-distribution loop wrapped forever when a plan was shorter than the phase
count). Rewrote it to terminate on a no-progress pass; locked with a regression test.

---

## P1 — shipped ✅

> Implemented: peak volume cap (`DISTANCE_PEAK_CAP_MI` in `weekPlan.ts`); the `'road'` race type
> (`useOnboarding.ts` + `Onboarding.tsx` + `App.tsx`); Hyrox bone finisher + injury lead-in and the
> menopause gate widened to 38 (`utils/planGenerator.ts`, `Onboarding.tsx`); unified Tanaka maxHR
> (`utils/heartRate.ts` → all four engine sites). Tests in `src/__tests__/engines/p1-improvements.test.ts`.

### P1-4 · Add a "Road" race type → resolves #5 (road races scored as trail)
- **User story:** *As a road marathoner, I want road-specialist methods (Daniels, Pfitzinger, Hansons) to
  rank correctly instead of being scored on trail terrain.*
- **Spec / impl (low-ripple):** add `'road'` to `RaceType` (`src/hooks/useOnboarding.ts`); in
  `Onboarding.tsx` extend `showsDistanceStep`, the variant-step `canContinue`, split the race-type card,
  add a road placeholder/label; `App.tsx` dispatch (road → method path, like trail) + emoji. `inferTerrain`
  already returns `'road'` for non-trail and methods already rate `byTerrain.road`, so scoring fixes itself.
  Bump `src/utils/storageVersion.ts` so cached method picks re-score.

### P1-5 · Sanity-cap volume & band the goal → resolves #4 (no upper peak cap)
- **User story:** *As any athlete, I want peak volume to stay physiologically sane regardless of my base.*
- **Spec / impl:** add `DISTANCE_PEAK_CAP_MI` and clamp `peak = clamp(current × mult, floor, cap)` in
  `src/engines/planGenerator/weekPlan.ts` `buildWeeklyMileage`. Pairs with P0-3's goal banding.

### P1-6 · Midlife + injury awareness on every path → resolves #6 (Hyrox blind spots) + early-peri gate
- **User story:** *As a midlife or injured Hyrox athlete, I want the same bone-loading and injury
  accommodation the running engine gives me.*
- **Spec / impl:** thread `config` into `getHyroxWorkoutByRole` and append `menopauseStrengthCue(config)`
  on strength roles; add a Hyrox injury de-load mirroring `injuryPolicyFor`; widen `showsMenopauseStep`
  (`src/components/Onboarding.tsx`) so late-30s perimenopause isn't missed.

### P1-7 · Unify & improve maxHR (Tanaka) → resolves #7 (220−age, inconsistent floor)
- **User story:** *As an athlete (esp. masters), I want accurate, consistent zones on any plan and an easy
  way to enter measured maxHR/LTHR.*
- **Spec / impl:** new `src/utils/heartRate.ts` (Tanaka + one floor + one 5-zone source). Replace the 4
  maxHR sites (`generatePlan.ts`, `paceTargets.ts`, `generalFitness/index.ts`, `utils/planGenerator.ts`)
  and 3 zone copies. Add a measured-maxHR/LTHR prompt in the zones primer / profile.

---

## P2 — shipped ✅

> Implemented: method tie-breaks on profile fit (experience → terrain → distance, `methodSelection.ts`);
> General-Fitness cardio paces anchored to a recent race (`generalFitness/index.ts`); long-runway
> base-building so the plan starts today (`generatePlan.ts`); cross-distance extrapolation already flagged
> by the P0 advisory. Tests in `src/__tests__/engines/p2-improvements.test.ts`.

- **P2-8 · Base-build the long runway** → #8. When `weeksUntilRace > max supported`, prepend repeating
  foundation weeks so the plan starts today instead of leaving a dead zone. (`weekPlan.ts` + anchor in
  `generatePlan.ts`.)
- **P2-9 · Smarter method tie-breaks** → #10. In `methodSelection.ts` `selectMethods`, break score ties
  on experience points, then terrain points, then id (not alphabetical).
- **P2-10 · Let General Fitness use a tested effort** → #11. In `generalFitness/index.ts`, read
  `fitnessAnchor` and derive pace/HR intensity for the cardio pillars via `resolvePaces`/`vdot.ts`.
- **P2-11 · Flag cross-distance extrapolation** → #9. Already emitted by `feasibility.ts`
  (`cross_distance` advisory); extend to prefer a same-distance anchor.

---

## Weakness → resolution coverage (all 12)

| # | Weakness | Improvement(s) | Coverage | Status |
|---|----------|----------------|----------|--------|
| 1 | Short runway back-dates | P0-1 | Full | ✅ |
| 2 | No feasibility gate | P0-3 | Full (warn+alt) | ✅ |
| 3 | Goal ignored w/o anchor | P0-2 | Full | ✅ |
| 4 | Goal not validated vs base | P0-3 + P1-5 | Full | ✅ |
| 5 | Road scored as trail | P1-4 | Full | ✅ |
| 6 | Hyrox blind spots | P1-6 | Substantial (equipment/anchor lower-value) | ✅ |
| 7 | maxHR 220−age / floor | P1-7 | Full | ✅ |
| 8 | Long-runway dead zone | P2-8 | Full | ✅ |
| 9 | Cross-distance extrapolation | P0-3 / P2-11 | Full (flagged) | ✅ |
| 10 | Alphabetical tie-break | P2-9 | Full | ✅ |
| 11 | GF can't anchor | P2-10 | Full | ✅ |
| 12 | Experience over-leverage | P0-3 cross-check + P1-7 prompt | Substantial | ✅ |

## Rollout (PRs)
- **PR-1 (P0) ✅** — advisories model + MethodSelection/Summary plumbing, `feasibility.ts`, runway guard,
  goal-never-dropped, `allocatePhaseWeeks` loop fix.
- **PR-2 (P1) ✅** — road type, volume cap, Hyrox midlife/injury + gate widening, `heartRate.ts` (Tanaka).
- **PR-3 (P2) ✅** — base-build long runway, tie-breaks, GF anchoring, cross-distance flag.

## Verification
- **Unit tests** mirror `src/__tests__/engines/planGenerator/generatePlan.test.ts`. P0 added
  `feasibility.test.ts` (8) + runway/goal-only (3) + the loop regression (1) — all passing.
- **Regression oracle:** re-run `scripts/onboarding-logic-ground-truth.ts`; confirm flagged audit scenarios
  resolve. **Follow-up:** resync `docs/onboarding-logic-flow.*` (embedded port + finding cards) so the doc
  marks the now-fixed weaknesses resolved (as was done for the taper-cap bug).
- **Manual (preview tools):** drive onboarding for a short-runway, a goal-only, and a road persona; confirm
  advisories render via `MethodSelection` / `InsightNote`, zones are consistent, no console errors.
- **Full suite** `npx vitest run` green — note the 2 pre-existing `raceReadiness` date-rounding failures are
  unrelated to this work.
