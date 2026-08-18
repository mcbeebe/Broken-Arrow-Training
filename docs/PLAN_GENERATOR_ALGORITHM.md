# Plan Generator Algorithm — As Built

**Status:** Living reference — describes the engine as implemented.
**Last rewritten:** 2026-08-18 (R2 of the running-plan roadmap in `docs/running-plan-audit.md`)
**Scope:** the road/trail method engine (`src/engines/planGenerator/`). The Hyrox engine (`src/utils/planGenerator.ts`) is a separate path with its own docs.

> The previous version of this file was the May 2026 pre-implementation
> design draft. It described a six-stage pipeline and promised that the
> engine "enforces every rule in `generationRules.invariants`" — none of
> which was true of the shipped code (audit finding E1). This rewrite
> documents what the engine actually does, with file references, so the
> doc can be held against the code again.

---

## 1. Entry points

- **`generatePlanFromMethod(method, config, today)`** — `src/engines/planGenerator/generatePlan.ts`. One race, one method → a full `TrainingPlan` (weeks → days → planned workouts, advisories, paces/zones).
- **`selectMethods(...)` / `bestMethodForDistance(distance)`** — `src/engines/planGenerator/methodSelection.ts`. Ranks the 9 method JSONs by `applicability` ratings (BEST=4 … NOT_SUITED=0); `bestMethodForDistance` never returns a NOT_SUITED pairing.
- **`spliceSeasonWeeks(...)`** — `src/engines/season/spliceSeason.ts`. Multi-race seasons: anchor plan + RECOVER/BRIDGE streams + a freshly generated plan per later race, with volume continuity (§7).
- **`validatePlan(input)`** — `src/engines/planQA/validatePlan.ts`. The QA gate (§8). Runs inside `generatePlanFromMethod` (findings become plan advisories) and in CI.

## 2. Inputs

`OnboardingConfig` (`src/hooks/useOnboarding.ts`): race (type/name/date/distance/miles/vert), athlete (name, age, sex, experience, `currentWeeklyMileage`, `fitnessAnchor`, injury status/area, menopause status), schedule (`trainingDaysPerWeek` — a TOTAL including strength/cross, `strengthDaysPerWeek`, `crossTrainingDaysPerWeek`, `longRunDay`, equipment), and `selectedMethodId`.

Derived up front: VDOT/paces from the fitness anchor (`paceTargets.ts`, `vdot.ts`), predicted finish time (vert-adjusted), grade-adjustment factor for climby races, and the injury policy (`prehab.ts` lead-ins, day caps, ramp caps).

## 3. Method invariants (R2)

`src/engines/planGenerator/methodInvariants.ts` is the typed, machine-checkable extraction of each method JSON's prose `generationRules.invariants`:

| field | meaning |
|---|---|
| `longRunMaxPctOfWeek` | long run's max share of weekly miles (Daniels 0.30 … Galloway 0.55) |
| `longRunMaxMi` | absolute ceiling where authored (Hansons 16 mi) |
| `minDaysBetweenQuality` | authored hard-day gap; 0 = deliberate stacking (Hansons, Koop) |
| `qualityMaxPctOfWeek` | quality volume's max share (80/20 0.25 … Hansons 0.55) |
| `lowMileageDowngradeMi` | below this base, experience routing caps at `intermediate` (Daniels 20) |

The registry is consumed twice: generation targets the authored numbers (§5), and the QA gate re-checks them with tolerance (§8). The prose lists in the JSONs remain the source documents.

## 4. Weekly volume model — `weekPlan.ts`

`allocatePhaseWeeks` maps the method's phases onto the runway; `capTaperBlocks` + `TAPER_WEEKS_CAP` bound the taper by distance (5K/10K: 2 weeks, half: 3) and return excess weeks to the build.

`buildWeeklyMileage` computes per-week targets:

- **Peak** = `current × peakMult × volumeFactor`, then clamped by, in order: gain cap (`DISTANCE_PEAK_GAIN_MI` — one block adds at most +15 mi for 5K … +25 mi for marathon over the stated base), race-readiness floor (`DISTANCE_PEAK_FLOOR_MI` — half 25, marathon 35 enforced; ultra reference floors advisory-only), elite ceiling (`DISTANCE_PEAK_CAP_MI`), and the **content ceiling** (long-run time cap + ~80 min per other run day at the athlete's easy pace — a target no set of day cards can express is a target the ramp must not chase).
- **`volumeFactor`** (R1, `DAYS_VOLUME_FACTOR`): weekly volume follows running-day frequency (3 days ≈ 0.75× the 5-day baseline).
- **Start** = method's `startMileagePctOfPeak × peak`, floored at `currentWeeklyMileage`, and capped at one ramp step above a stated base (start-near-peak methods like Pfitzinger assume the base already exists).
- **Ramp**: linear build start→peak, week-over-week growth capped at `maxWeeklyIncreasePct` (masters cap 8% at 58+, injury caps compose via `min`), cutback weeks every N (masters cadence ≤3), taper percentages anchored to the volume actually reached in the last build week.
- **Long run** (`longRunMilesFor`) = min of: distance share (`LONG_PCT`), absolute cap (`LONG_MAX_MI` ∧ the method's `longRunMaxMi`), time cap (`LONG_TIME_CAP_MIN` at easy pace, ×0.85 for seniors), and the method's `longRunMaxPctOfWeek`. A predicted-finish duration floor (trail time-on-feet) can lift it, bounded by half the week.

## 5. Week construction — `generatePlan.ts`

Every week is built in two passes (R0):

1. **Pattern & schedule.** `pickWeeklyPattern` picks the phase's authored weekly pattern nearest the athlete's running-day budget (total days minus reserved strength/cross slots; every week keeps ≥1 full rest day — a 7-day request schedules 6). Injury lead-ins force intensity categories to easy; senior (70+) VO2/rep slots substitute to the method's threshold-flavored category; the long run moves to the chosen weekday.
2. **Instantiate, then fit.** All workouts are instantiated first (`pickWorkoutForDay` — experience/mileage gates, quality slots rotate week-to-week among eligible alternates to avoid clone weeks). Then the **quality budget** fits hard sessions into what the ramp-capped target leaves after the long run(s) and a 20-min floor per easy day, additionally capped at `totalMi × qualityMaxPctOfWeek`. Sessions scale down (rep floors keep the stimulus real); what can't fit is demoted to an easy run — cutback weeks may demote everything, normal weeks keep one, seniors keep at most one. Low-volume and taper weeks keep a single long day (extra B2B/medium-long days demote). When even the honest minimum exceeds ~120% of target, trailing easy days convert to rest.
3. **Easy runs absorb the true remainder** (`computeEasyRunTime`): weekly target − long − fitted quality, split across easy days by authored volume modifiers, clamped into the method's stated windows. Distance-authored easy/long templates are re-fit to the computed time (`fitDistanceSegmentsToTime`).

Race week is hand-authored (`taper.raceWeekSchedule`) with a hard-stamped race-day card; benchmark weeks swap one day for the field-test protocol.

**Schedule integrity (Phase 1, PRD-103):** no plan ever contains three consecutive HARD days (quality, long, race, or heavy/plyometric strength) — a generation-time repair swaps the offending day to the nearest legal slot or demotes quality-before-long, with the previous week's tail carried across boundaries; `qa_consecutive_hard` errors if one ever survives. Heavy strength never places the day before a hard run; second and subsequent long days build at 70% of the primary (`SECONDARY_LONG_FACTOR`); taper weeks shrink easy runs to a 15-minute floor before ever deleting a run day; and interval warm-ups scale no lower than a per-category floor (VO2/reps 12 min, tempo-class 10).

**Personalization layers:** masters policy (R1, `src/engines/running/heuristics.ts` — tiered, cited constants; 58+/70+ change cutback cadence, ramp, intensity menu, long-run time cap, and add a `masters_adjustments` advisory); low-mileage experience downgrade (`lowMileageDowngradeMi` → advisory); NOT_SUITED method×distance pairings generate but carry a critical `method_not_suited` advisory naming `bestMethodForDistance`'s pick; strength/cross days injected on rest days inside the total-day budget (`extraDays.ts` — tiered schemes: masters / technique-first / experienced, phase-coherent emphasis, no RM language).

**Undertrained-arrival honesty (Phase 2, PRD-101):** when ramp caps (masters, injury, runway, content) legitimately stop the build below ~85% of the distance's readiness floor, the plan carries a `peak_unreachable` advisory (critical below 70%) naming the binding cap, with concrete remedies — a later race date computed from the safe ramp, or a distance the achieved volume supports. Multi-long weeks additionally cap combined long-category volume at 65% of the week, size secondary long days at ~70% of the primary, and require ≥30 mi + an ultra distance (or Pfitzinger's authored medium-long) to keep a second long day at all.

## 6. Suitability

`applicability.byDistance` drives both selection surfaces: `bestMethodForDistance` (RATING_POINTS, NOT_SUITED excluded) and the season splicer's fallback (§7). Generating against a NOT_SUITED pairing is allowed but loudly advised against (§5).

## 7. Seasons — `spliceSeason.ts`

Anchor weeks stay byte-identical (trimmed after race day). Later blocks append: RECOVER day-streams (distance-scaled), BRIDGE streams, then one generated plan per subsequent race at its block start. R2 adds **volume continuity**: each later build's `currentWeeklyMileage` is the previous block's achieved peak ×0.85 (recover/bridge decay), so a second build resumes near pre-taper volume instead of re-ramping from the onboarding answer. The splicer re-picks the method when the athlete's choice is NOT_SUITED for that block's distance.

## 8. The QA gate — `validatePlan.ts`

Structural rules (week length, duplicate days, duration-range sanity, step-vs-header consistency), volume rules (weekly ramp: error above +30% AND >3 mi against the last full build baseline, warn above +20% AND >2 mi; adherence warns at 12%/2 mi — taper/cutback/recover/bridge/race weeks never serve as baselines; target adherence within 25% or 3 mi; time-only load spikes; taper monotonicity), progression (byte-identical weeks — an error when the targets claim progression the content doesn't deliver), zone contiguity, and — when `methodId` is passed — the **method-invariant rules**: long-run share/ceiling, quality share, hard-day spacing (share checks apply at ≥25 mi/week; percentages are noise below that).

Severity contract: generation targets the authored number; the gate warns just past it and errors only on egregious violation. **Zero errors** is the bar enforced in CI.

## 9. Permanent CI gates

- `src/__tests__/engines/planGenerator/r0-volume-safety.test.ts` — the Jim gate: every method × a two-5K season, zero errors, sane ramps, short-race tapers.
- `src/__tests__/engines/planGenerator/r1-masters-personalization.test.ts` — age tiers change plans; strength schemes match their emphasis.
- `src/__tests__/engines/planGenerator/road-persona-sweep.test.ts` — 12 personas (ages 24–79, first-timer→elite, 3–7 days, anchors, injuries, no-gym, trail) × every suited method×distance pairing × two runways + two multi-race seasons: zero validator errors with method invariants active. **If a change fails this, fix the generator (or, with justification, a tolerance) — never the persona.**

## 10. Known gaps (tracked in `docs/running-plan-audit.md`)

- R3: fuller season continuity (athlete-scaled recover/bridge content, cross-block QA as one timeline).
- R4: method fidelity — per-distance volume envelopes vs published programs, running-evidence audit, intensity-forward 5K/10K structures.
- Compressed (~4-week) Hyrox runway ramp lumpiness — flagged, not yet addressed.
