# iRunFar Roadmap → Product Specs & Build Plan (R1–R14)

**Version:** 1.0 · **Date:** 2026-06-22 · **Owner:** product/engineering
**Source of truth:** the fact-checked competitive analysis `docs/research/Competitive_Analysis_iRunFar_Training_v1.3.{html,md}` (ranked roadmap R1–R14).
**Goal:** turn the 14 ranked updates into buildable product specs — user stories, acceptance criteria, and **stringent test criteria that prove the generated plan/coach output actually applies each iRunFar theory** — sequenced into shippable PRs.

> **The non-negotiable in this plan:** a feature is "done" only when a test asserts the **athlete-facing output changes correctly** — a climby race's plan contains real vert + downhill sessions, a 5-hour race's long runs carry a carb target, a hot race inserts a heat block — *and* that the logic is **conditional** (a flat road 5K gets none of it). We test the *plan*, not just the helper.

---

## 0. Testing philosophy — "prove the logic is applied"

Every R-item must land all four test layers below. The decisive ones are **L2 (plan-output behavioral)** and **L3 (golden-plan regression)** — they are what confirm the theory reaches the athlete.

| Layer | What it proves | How (real harness) |
|---|---|---|
| **L1 · Unit** | the science math is correct in isolation | vitest on the new pure function; pin numbers to the **fact-checked** values in v1.3 (e.g. carbs 200–300 cal/hr; repeated-bout 14-day triangular curve, Hyldahl 2017) |
| **L2 · Plan-output behavioral** | the generated plan **contains** the prescription, **scaled** correctly, and **only when warranted** | build a config → `generatePlanFromMethod(...)` → assert on `plan.weeks[].days[].{detail,zone,type,plannedWorkout}` (regex/counts) + `plan.advisories`. **Always include a negative/guard test** (flat/short race ⇒ feature absent). |
| **L3 · Golden-plan regression** | the whole plan for representative personas is stable & inspectable | extend `scripts/onboarding-logic-ground-truth.ts` with new personas (climby-100, hot-marathon, masters-F55, etc.); commit `docs/onboarding-ground-truth.json`; CI diffs it — any drift is visible per-week, per-day. |
| **L4 · Coach-surface fixture-honesty** | non-workout guidance (fuel/heat/pacing/mental) actually renders in the coach prompt | Python keyless test: fixture with `_expect.context_contains: "<the guidance string>"` → `build_context_block(snap)` must contain it (mirrors `api/coach/tests/eval/test_fixture_honesty.py`). |

**Traceability requirement:** each iRunFar theory gets a row in the **Theory → Manifestation → Test** matrix (§4). A PR cannot merge if any of its theories lacks a passing L2/L3/L4 test. CI gate stays: `tsc -b` + `vitest run` + `pytest -m "not eval" api/coach/tests` (all green; the 2 known pre-existing `raceReadiness` date-rounding failures excepted).

---

## 1. Architecture integration points (grounded)

Specs hook into these real seams (file:line from the codebase audit):

- **Pipeline:** `generatePlanFromMethod` (`src/engines/planGenerator/generatePlan.ts:486`) → `resolvePaces` → `chooseTotalWeeks` → `buildWeeklyMileage` (`weekPlan.ts:339`) → per-week day loop → `injectExtraDays` (`extraDays.ts`) → `assessFeasibility` (`feasibility.ts:108`).
- **The injection point for prescriptions:** `buildDetailString` (`generatePlan.ts:198`) emits the per-day `detail` string; `buildPlannedDay` (`:321`) assembles the `PlannedDay`. **The compliance layer already parses elevation back out** of `detail` via `parseElevation` (`src/utils/targets.ts:59`) — so emitting `"~NNN ft gain"` is immediately tracked.
- **Plan data model** (`src/types/index.ts`): `TrainingPlan{athlete,weeks,zones,race,advisories?}` · `TrainingWeek{num,dates,miles,focus,days}` · `PlannedDay{day,type,workout,detail,zone,route,time,plannedWorkout?}`. **No native elevation field** — it lives in `detail`.
- **Race vert input (gap):** there is **no structured `elevationGainFt`** — only free-text `race.elevation` parsed by `parseRaceElevationFt` (`raceReadiness.ts:72`), plus `shouldTrackVerticalGain` (>100 ft/mi, `:62`) and `isVertHeavy` (≥150 ft/mi). **PR-1 adds a structured numeric input.**
- **Built-but-unwired physics** (to wire, not build): terrain `costRun/costWalk` (`terrain/locomotion/minetti.ts`), `computeTerrainProfile`/`computeWholeActivityGAP` (`terrain/locomotion/gap.ts`); descent `eccentricScore`/`eccentricBucket`, `eccentricTrimpForActivity`, `protectionFromBout`/`repeatedBoutProtection` (Hyldahl 14-day curve, `descent/repeatedBout.ts`), `forecastDOMS` (`descent/forecast.ts`). **Readiness is already wired** (`src/utils/readiness.ts` via `useReadiness`) but `loadDampeningFactor` is exported-yet-unused (static 1).
- **Coach surface:** `App.tsx` `buildCoachSnapshot(...)` injects `injuryContext`/`menopauseContext`/`advisoriesContext`; `api/coach/_core.py` `build_context_block` renders them as `INJURY/HEALTH NOTE` / `MENOPAUSE NOTE` / `PLAN ADVISORIES` prompt sections. **New guidance (fuel/heat/pace/mental) follows this exact pattern.**
- **Test seams:** `makeConfig(overrides)` + `generatePlanFromMethod` in `src/__tests__/engines/planGenerator/generatePlan.test.ts`; golden harness `scripts/onboarding-logic-ground-truth.ts`; Python `api/coach/tests/eval/{harness.py,assertions.py,test_fixture_honesty.py}`.

Per CLAUDE.md, each user-facing item carries the **Witchel 3-rule check** (massive market · visceral solve · customer language).

---

## 2. The 14 specs

Each: **User story · Spec · Acceptance criteria · Testing criteria (L1–L4) · Witchel · Effort · Deps.**

### TIER 1

#### R1 — Wire Terrain + Descent into vert + downhill **prescription**
- **User story:** *As a trail/mountain racer, I want my plan to actually train climbing and descending, scaled to my race's vert, so I arrive with climbing legs and quads that survive the downhills.*
- **Spec:** From the structured race vert (PR-1) compute **ft/mi**; when `shouldTrackVerticalGain` (>100 ft/mi) is true: (a) emit a **weekly vert target** into long-run (and hill) `detail` via `buildDetailString` — ramping with mileage, peaking in build, tapering — using `race vert × (longRunMi / raceMiles) × phaseMult`; (b) schedule **downhill-repeat / mountain-climb** sessions in build+peak at a cadence **≤14 days** (the repeated-bout protective window, `repeatedBoutProtection`), with the session's eccentric dose informed by `eccentricScore`/`eccentricBucket`; (c) expose the planned eccentric dose so `descentCapacity` becomes a *programmed* progression, not a passive metric.
- **Acceptance:** climby race (≥150 ft/mi or `mountain_ultra`) → long runs carry `~NNN ft gain`; ≥1 downhill/climb session in every ~14-day window of build+peak; weekly vert is non-decreasing through build then drops in taper. **Flat road race (≤30 ft/mi) → zero vert targets, zero downhill sessions.**
- **Testing criteria:**
  - **L1:** `weeklyVertTarget(raceVertFt, raceMiles, weekMi, phase, weekIdx)` is monotonic-non-decreasing across build, 0 for flat; the downhill-cadence picker returns gaps ≤14 (assert it derives from `REPEATED_BOUT` window, not a literal).
  - **L2 (apply):** `generatePlanFromMethod(koop, climby100)` → `days.filter(d => parseElevation(d.detail) != null).length > 0`; per-week vert (via `parseElevation` on the long day) is non-decreasing in build; `maxGapDays(downhillSessions) <= 14` within build+peak.
  - **L2 (guard / NOT applied):** `generatePlanFromMethod(daniels, flatRoadMarathon)` → `days.every(d => parseElevation(d.detail) == null)` **and** `days.filter(d => /downhill|descent|mountain climb/i.test(d.workout+d.detail)).length === 0`.
  - **L2 (engine wiring):** a test that the scheduled downhill session's stated eccentric load equals `eccentricScore(grade)`-derived value (proves the *theory*, not a hardcoded string).
  - **L3:** add `climby-100mi` + `flat-road-marathon` personas to the golden harness; commit the JSON; the diff shows vert/downhill on the climby plan only.
- **Witchel:** massive (trail/ultra core) · visceral ("my plan never trained descending and my quads blew up") · language ("vert", "climbing legs", "blown quads", "downhill reps").
- **Effort:** M (wiring existing engines). **Deps:** PR-1 (structured vert input).

#### R2 — Fueling & Hydration engine
- **User story:** *As an endurance athlete, I want my long sessions to tell me how much to eat and drink and to practice race fueling, so I stop bonking and blowing up my gut.*
- **Spec:** `computeFuelingPlan(config, plan)` → per-long-run **carb g/hr** target (verified science: **200–300 cal/hr**, ramp toward **~90 g/hr** via multiple-transportable carbs for long races; start ≤45 min), **protein** (1.6–2.2, →2.5 g/kg peak), **hydration "drink to thirst"** (no fixed hourly volume) + hyponatremia caution, **caffeine** 3–6 mg/kg. Emit a fueling target into long-run `detail`; tag a **"fueling rehearsal"** long run **4–6 wk** pre-race (gut training). Surface a `fuelingContext` snapshot field rendered as a `FUELING` coach section (App.tsx + `_core.py` pattern).
- **Acceptance:** ≥3-hr goal effort → long runs carry a carb-g/hr target that scales up with race duration; a fueling-rehearsal long run exists 4–6 wk out. **<90-min race (5K/10K) → no per-hour fueling prescription.**
- **Testing criteria:**
  - **L1:** `carbTargetGramsPerHour(durationMin, intensity)` returns the fact-checked envelope (e.g. ≤90 min → 0; 3 h → ~60; long ultra → ~90, capped); never exceeds 90 g/hr.
  - **L2 (apply):** 100-mile plan → `longDays.every(d => /\d+\s*g\/h/.test(d.detail))` and the g/hr on a 100-mile long ≥ the g/hr on a 50K long (scales with duration); a `/fuel(ing)? rehearsal|practice race nutrition/i` long run lands in weeks `[total-6, total-4]`.
  - **L2 (guard):** 5K plan → `days.every(d => !/g\/h/.test(d.detail))`.
  - **L4 (coach):** fixture with `fuelingContext` → `build_context_block` contains `"FUELING"` and the g/hr number (`_expect.context_contains`).
- **Witchel:** massive (every endurance athlete) · visceral ("I bonked / my gut shut down") · language ("bonk", "carbs per hour", "drink to thirst", "gut training").
- **Effort:** M. **Deps:** PR-1 coach-field scaffold.

#### R3 — Heat-acclimation protocol module
- **User story:** *As someone racing in heat, I want a heat-prep block timed to my race so I don't cook and DNF.*
- **Spec:** When the race is hot (race location/season or an athlete "expect heat" flag), generate a **7–10 day** protocol (50–100 min/day easy in heat, or a post-run sauna / passive-heat block), **starting ~2 wk out**, **maintain every 3rd day**, with decay rules. Surface as a `caution`-style **plan advisory** (`assessFeasibility`-style) + a `heatContext` coach section + calendar blocks in the taper weeks.
- **Acceptance:** hot race → advisory `heat_prep` present + a heat block scheduled in the final ~2 wk; temperate race → absent.
- **Testing criteria:**
  - **L1:** `heatProtocol(raceDatesOut)` returns 7–10 sessions starting ~14 d out, cadence then every 3 d.
  - **L2 (apply):** hot-race config → `plan.advisories.some(a => a.id === 'heat_prep')` and ≥1 day with `/heat|sauna|acclimat/i` in the last 14 days.
  - **L2 (guard):** temperate race → no `heat_prep` advisory, no heat sessions.
  - **L4:** fixture `heatContext` → `build_context_block` contains `"HEAT"` + "every 3".
- **Witchel:** massive (hot goal races) · visceral ("I cooked in the heat") · language ("heat training", "sauna protocol", "acclimatize").
- **Effort:** S–M. **Deps:** PR-1 scaffold.

### TIER 2

#### R4 — Structured trail-workout taxonomy (+ predictor)
- **User story:** *As a trail runner, I want real sessions (hill reps, downhill reps, a dress-rehearsal) matched to my race's terrain, not generic "quality."*
- **Spec:** Replace generic quality picks with iRunFar-style sessions keyed to phase + **vert tier** (Flat <120 / Mountainous 120–240 / Colossal >240 ft/mi): short/long hill reps, downhill reps, gear-changing, strides; insert a **dress-rehearsal predictor** 4–6 wk out at ~30–60% of course (the fact-checked numbers). Hook in `pickWorkoutForDay`/method workout templates.
- **Acceptance:** Mountainous race → build/peak contain hill + downhill sessions; a predictor workout 4–6 wk out; Flat race → tempo/threshold dominate, no mandatory hill sessions.
- **Testing criteria:** **L2:** count sessions by tier (`/hill rep|downhill rep|dress rehearsal|predictor/i`) for a Colossal vs Flat config; predictor lands in `[total-6, total-4]`. **L3:** golden personas per tier. **L1:** tier classifier on ft/mi boundaries (119/120/240/241).
- **Witchel:** massive (trail) · visceral ("my plan was just road tempos") · language ("hill repeats", "dress rehearsal"). **Effort:** M (overlaps R1). **Deps:** R1.

#### R5 — Recovery, sleep & overtraining protection (wire readiness)
- **User story:** *As any athlete, I want honest recovery (post-race rest, sleep), and I want the app to catch overtraining before I dig a hole.*
- **Spec:** Post-race **rest-day (1 day/10 mi)** + **sleep (+1 h/10 mi; 7–9 h baseline)** formulas as a reverse-taper rebuild block; a Stoplight 24-h return-to-run; **activate the dormant readiness leverage** — turn on `loadDampeningFactor` (currently static 1) so high DOMS attenuates load, and surface `classifyTrainingState` C/D (overreaching/overtrained) + `checkInjuryRisk` flags into a coach `OVERTRAINING/RECOVERY` section. (Verified science only — no "morning HR >5 bpm"; use elevated morning/resting HR qualitatively.)
- **Acceptance:** a logged 100-miler → a post-race recovery block (rest days + sleep target) appears; sustained low readiness (State C/D) → a coach overtraining flag; normal → none.
- **Testing criteria:** **L1:** `postRaceRecovery(raceMiles)` → restDays = round(miles/10), sleepBonusH = round(miles/10). `loadDampeningFactor(forecast24h, ref)` ∈ [0.7,1]. **L2:** a plan following a goal race contains a reverse-taper rebuild with `restDays` matching the formula. **L4:** fixture with State D / risk flags → `build_context_block` contains `"OVERTRAINING"`/`"RISK"` directives; **guard:** State A fixture → none. **L1 (regression):** `classifyTrainingState`/`applyGuardrails` unit coverage stays green.
- **Witchel:** massive · visceral ("I came back too fast and got hurt") · language ("rest days", "sleep", "overtrained"). **Effort:** L–M (mostly wiring). **Deps:** PR-1 scaffold.

#### R6 — Pacing & race-execution plan
- **User story:** *As a racer, I want an effort-based pacing plan and an aid-station/fuel-per-segment card so I don't blow up early or melt down at aid.*
- **Spec:** Generate a **Rule-of-Thirds** effort-cap card (HR/RPE cap first third → even → finish), **power-hike grade thresholds** (>15.8°/15–20%), and an aid-station/fuel-per-segment plan from the course; surface as a `raceExecutionContext` coach section + a plan artifact.
- **Acceptance:** any race plan → a pacing card with 3 phases + effort caps; trail race → power-hike thresholds present.
- **Testing criteria:** **L2/L4:** plan/coach output contains the 3-phase structure + an effort cap; trail → `/power.?hike|hike the/i` present; road flat → power-hike absent. **L1:** crossover grade = 15.8° (fact-checked). **Effort:** M.
- **Witchel:** massive · visceral ("I went out too hard and died") · language ("pacing", "go out easy", "power-hike").

#### R7 — Power-hiking as a prescribed skill
- **User story:** *As a mountain racer, I want scheduled power-hike sessions so hiking is a trained weapon, not a last resort.*
- **Spec:** On climby races, schedule power-hike sessions (20–30 → 90 min, >15–20% grade) and "hike-up/run-down" days; uses `hiking.ts`/`inferGait` (run-hike crossover ≥+20% grade). **Acceptance/Tests:** climby plan → `/power.?hike/i` sessions present and progressing 20→90 min; flat plan → none (**L2 + guard**). **L3:** climby golden persona. **Effort:** S (after R1). **Deps:** R1.

#### R8 — Runner strength periodization
- **User story:** *As a runner, I want a real strength block (heavy → power → taper), not just a bone finisher.*
- **Spec:** In `extraDays.ts`, periodize strength: off-season **heavy maximal** (70%+ 1RM, 2×/wk, 6–9 wk) → in-season **power** → **drop race week**; add the **Trail-Worthy-Body** bodyweight/plyo/balance circuits; keep the menopause bone finisher we already have.
- **Acceptance:** base/off-season weeks → heavy lifts; peak → power; race week → no strength; menopause stage → bone finisher retained.
- **Testing criteria:** **L2:** strength `detail` matches phase (`/back squat|deadlift|heavy/i` in base; `/box jump|power|plyo/i` in peak; **none** race week); `/Farmer Carry/` retained for perimenopause (regression of existing test). **L1:** phase→prescription mapping. **Effort:** M.
- **Witchel:** massive · visceral ("I'm weak late-race") · language ("strength", "lifting").

#### R9 — Form & cadence coaching layer
- **User story:** *As a runner, I want cadence and form cues so I run more efficiently and get hurt less.*
- **Spec:** Cadence target (~170–180, + on descents) on workout cues; hip-hinge / braking-vs-COM / 7 stride cues + a morning mobility flow in the coach knowledge (`formContext`). **Tests:** **L2** workout cues include a cadence target on quality days; **L4** `formContext` renders in coach. **Effort:** S (coach/content).
- **Witchel:** massive · visceral ("I shuffle and my shins hurt") · language ("cadence", "form").

### TIER 3

#### R10 — Mental-training curriculum
- **User story:** *As a racer, I want mantras, segmenting, imagery, and process goals rehearsed in training, not improvised at mile 80.*
- **Spec:** A `mentalContext` coach curriculum (mantras ≤8 words; aid-to-aid segmenting; imagery + breath cue; **process > outcome** goals; Necessary/Possible/Impossible; M-fit) + optional "mental rep" tags on long runs. **Tests:** **L4** mental directives render; **L2** long runs carry a mental-rehearsal cue when enabled. **Effort:** L–M (content).

#### R11 — Women's menstrual-cycle awareness
- **User story:** *As a menstruating athlete, I want cycle-aware nuance (and an RED-S safety net) — evidence-humble, not prescriptive.*
- **Spec:** Optional cycle tracking → follicular/luteal training-fuel-recovery nuance; **RED-S screen** (amenorrhea ≥3 mo → advisory); reuse the menopause-research house style + the `menopauseContext` surfacing pattern; default off, self-tracked. **Tests:** **L2** amenorrhea flag → `red_s` advisory; **L4** cycle context renders when opted in; **guard** off by default. **Effort:** M (sensitive). **Deps:** PR-1 scaffold.

#### R12 — Masters load logic
- **User story:** *As a 40+ athlete, I want recovery-forward load (one hard day option, protein, strength priority), not the same ramp as a 25-year-old.*
- **Spec:** age ≥40 → option for **1 hard session/week**, longer recovery spacing, protein emphasis, strength priority; builds on the Tanaka maxHR we already use. **Tests:** **L2** masters config → ≤ (n) hard days/week and wider easy spacing vs a young config (same inputs); **guard:** young athlete unchanged. **Effort:** L–M.

#### R13 — Build out the altitude module
- **User story:** *As an athlete racing at altitude, I want arrival-window guidance and a ferritin caution.*
- **Spec:** Replace the `export {}` stub: per-elevation **arrival windows** (6,000 ft AMS ~6 h; 7,000 ft +20–30 s/mi), **pre-altitude VO2 work 2–3 wk before**, ferritin <35 gate, live-high/train-low, VO2 −8–11%/1,000 m → an `altitude_prep` advisory + `altitudeContext` coach section. **Tests:** **L1** arrival-window function by elevation; **L2** high-altitude race → `altitude_prep` advisory; **guard:** sea-level → none; **L4** altitude context renders. **Effort:** M.

#### R14 — Trail-first framing
- **User story:** *As a trail runner, I want time-on-feet as the primary long-run metric and visible periodization intent.*
- **Spec:** Offer **time-on-feet** as the primary long-run unit (we already cap long-run by time, `LONG_TIME_CAP_MIN`) and surface phase intent ("specificity timed late"). **Tests:** **L2** trail config → long-run `detail` leads with time-on-feet; **L3** golden shows framing. **Effort:** L–M.

---

## 3. PR rollout (7 PRs)

Sequenced by dependency and leverage. Each PR ships with its own L1–L4 tests **green** and updates the §4 traceability matrix.

| PR | Title | Items | Why grouped / depends |
|---|---|---|---|
| **PR-1** | **Foundation + test harness** | (cross-cutting) | Structured `elevationGainFt?` on config/`RaceInfo` (robust parse fallback via `parseRaceElevationFt`); a `src/__tests__/helpers/planAssert.ts` lib (vert/session/scaling assertions); new golden personas + committed `onboarding-ground-truth.json` diff gate; the `*_Context` snapshot-field + `_core.py` coach-section scaffold; the §4 traceability test skeleton. **Unblocks all.** |
| **PR-2** | **R1 — vert + downhill prescription** | R1 | Highest leverage; wires terrain/descent. Deps: PR-1. |
| **PR-3** | **Physiology rules: fuel · heat · altitude** | R2, R3, R13 | Share the advisory + coach-section pattern; testable identically. Deps: PR-1. |
| **PR-4** | **Trail workouts + power-hiking** | R4, R7 | Both vert-tier-driven session content. Deps: R1. |
| **PR-5** | **Recovery, sleep & overtraining** | R5 | Wires the readiness leverage (`loadDampening`, State C/D, risk flags). Deps: PR-1. |
| **PR-6** | **Durability: strength + form/cadence** | R8, R9 | Extend `extraDays` + workout cues. Deps: PR-1. |
| **PR-7** | **Execution & populations** | R6, R10, R11, R12, R14 | Coach/content + config personalization. Deps: PR-1. |

Rollout note: PR-1→PR-2→PR-3 is the "close the iRunFar gap" headline (vert/descent + fueling + heat). PR-4–PR-7 follow. Each is independently revertible.

---

## 4. Theory → Manifestation → Test traceability matrix

The contract that **the code applies the theory**. Every row needs a passing test before its PR merges. (Representative — the full set is enumerated per-PR.)

| iRunFar theory (v1.3, fact-checked) | Plan/coach manifestation | Proving test (layer) |
|---|---|---|
| Vert is the trail lever; manage like speed | weekly `~NNN ft gain` on long/hill days, ramped | R1 L2 apply + monotonic; **guard** flat=0 |
| Eccentric/downhill is perishable — repeated-bout ~14-day window (Hyldahl 2017) | downhill sessions ≤14 days apart in build/peak; dose from `eccentricScore` | R1 L2 cadence + engine-wiring test |
| Trashed quads cause many DNFs | downhill-conditioning sessions present for climby races | R1 L2 + R4 |
| Carbs 200–300 cal/hr → ~90 g/hr multi-transportable; gut-train 4–6 wk out | carb g/hr on long runs, scaling; rehearsal long run 4–6 wk out | R2 L1 envelope + L2 apply/scale + **guard** 5K=0 |
| Drink to thirst (no fixed hourly volume) | hydration cue with no ml/hr number; hyponatremia caution | R2 L2 + L4 |
| Heat: 7–10 d, ~2 wk out, every 3rd day | heat block in final ~2 wk; `heat_prep` advisory | R3 L2 + **guard** temperate=none |
| Recovery: 1 rest day & +1 h sleep per 10 mi | post-race rebuild block sized to race miles | R5 L1 formula + L2 apply |
| Overtraining is detectable (HRV/RHR/sleep trend) | `loadDampening` active; State C/D + risk flags to coach | R5 L4 + **guard** State A=none |
| Strength: heavy → power → drop race week | phase-correct strength `detail`; none race week | R8 L2 by-phase + race-week-empty |
| MAF 180/200/210−age; effort > pace | effort-based pacing card; HR/RPE caps | R6 L1 + L2 |
| Vert tiers Flat<120 / Mtn 120–240 / Colossal >240 | tier-specific session mix | R4 L1 boundaries + L2 |
| Altitude: arrival windows; ferritin <35 gate | `altitude_prep` advisory by elevation | R13 L1 + L2 + **guard** sea-level=none |
| Process > outcome; mantras ≤8 words | mental curriculum in coach | R10 L4 |
| Masters: recover more, strength priority | reduced hard-day frequency for 40+ | R12 L2 + **guard** young unchanged |

---

## 5. Cross-cutting verification & CI

- **Per PR:** `npm run build` (`tsc -b`) clean · `npm run test` (`vitest run`) green (only the 2 pre-existing `raceReadiness` failures) · `pytest -m "not eval" api/coach/tests` green · the committed `docs/onboarding-ground-truth.json` diff reviewed.
- **Preview drive (manual, per PR):** generate a plan for the PR's persona (climby-100, hot-marathon, masters-F55…) and confirm the prescription renders in the app + coach welcome letter; no console errors.
- **Definition of done (every item):** an L2 *apply* test **and** an L2 *guard* (negative) test pass, the theory's row in §4 is green, and the golden JSON reflects the change. No item ships on a unit test alone.

## 6. Sequencing & estimate
PR-1 (foundation) first; then PR-2 and PR-3 in parallel-ish (independent after PR-1) for the headline; PR-4 after PR-2 (needs R1 vert); PR-5/6/7 independent. Each PR is ~1 focused change set with its tests. The roadmap remains additive and reversible; nothing here changes the existing engines' current behavior except where a spec explicitly prescribes new output.
