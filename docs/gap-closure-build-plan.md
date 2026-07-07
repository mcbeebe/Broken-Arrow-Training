# Competitive Gap Closure → Product Specs & Build Plan (G1–G10)

**Version:** 1.0 · **Date:** 2026-07-07 · **Owner:** product/engineering
**Source of truth:** the fact-checked competitive analysis `docs/research/Competitive_Analysis_Coaching_Apps_v1.0.{html,md}` — §5 (ranked gaps G1–G10), §6 (UX/UI leading practice), §7 (multi-event periodization science + Season Engine sketch).
**Goal:** turn the 10 ranked strategic gaps into buildable product specs — user stories, acceptance criteria, and stringent tests that prove the athlete-facing output actually changes — sequenced into 12 shippable PRs across 3 waves. For every gap the plan defines two bars: **CLOSE** (parity with the market benchmark) and **WIN** (the verified differentiator that beats the named competitor). The two explicitly-requested centerpieces get first-class treatment: the **multi-race Season Engine** (§7 of the analysis → specs G1a/G1b, PRs 1·6·7) and the **UX/UI recommendations** (§6 of the analysis → the conformance workstream in §4 below, enforced across G2b/G3/G4/G8/G9).

> **The non-negotiable in this plan:** a feature is "done" only when a test asserts the **athlete-facing output changes correctly and conditionally** — a half→Hyrox→marathon season chains through explicit RECOVER→BRIDGE→BUILD blocks (and a single-race athlete's plan is byte-identical to today's), a missed key session produces a realignment proposal card within 24 h (and a completed one produces nothing), a plan edit re-pushes the changed workouts to the watch (and untouched days are not re-sent). For delivery gaps the bar is: **the workout reaches the wrist/screen and never goes stale.** We test the plan and the delivery surface, not just the helper.

---

## 0. Testing philosophy — "prove the logic is applied"

Inherited from `docs/irunfar-roadmap-build-plan.md` §0 (the harness that shipped R1–R14 as PRs #259–#266). Every G-item lands all four layers; the decisive ones are **L2** and **L3**.

| Layer | What it proves | How (real harness) |
|---|---|---|
| **L1 · Unit** | the science math is correct in isolation | vitest on the new pure function; pin numbers to the **fact-checked** values in the analysis (Issurin residuals 30±5/30±5/18±4/15±5/5±3 d; Friel TSB tiers A +15..+25, B −10..0; fueling 45–90 g/hr tiers) |
| **L2 · Output behavioral** | the generated plan/season/surface **contains** the prescription, **scaled** correctly, and **only when warranted** | build a config → `planSeason(...)` / `generatePlanFromMethod(...)` → assert on blocks/weeks/days/advisories. **Always include a negative/guard test** (single race ⇒ no season UI; completed workout ⇒ no realignment ping; road course ⇒ no trail bands). For UI-delivery gaps (G2/G3/G8/G9) L2 is satisfied by hook/component behavioral tests + **push-payload assertions** (what would be sent to the watch), since the "plan output" for them *is* the delivery surface. |
| **L3 · Golden-plan regression** | whole plans/seasons for representative personas are stable & inspectable | extend `scripts/onboarding-logic-ground-truth.ts` with `half-then-hyrox-then-marathon`, `two-A-races-5wk-apart`, and a `single-race-unchanged` guard persona; commit `docs/onboarding-ground-truth.json`; CI diffs it — drift is visible per-block, per-week, per-day |
| **L4 · Coach fixture-honesty** | season/pacing/intensity guidance actually renders in the coach prompt | keyless pytest: fixture with `_expect.context_contains` → `build_context_block(snap)` must contain the `SEASON` / `RACE_PACING` / `INTENSITY` section (mirrors `api/coach/tests/eval/test_fixture_honesty.py`) |

**Traceability requirement:** every cited theory/pattern gets a row in the **Theory → Manifestation → Test** matrix (§6). A PR cannot merge if any of its theories lacks a passing L2/L3/L4 test. CI gate unchanged: `tsc -b` + `vitest run` + `pytest -m "not eval" api/coach/tests` (all green; the 2 known pre-existing `raceReadiness` date-rounding failures excepted). **Golden-churn rule:** PR-G3, PR-6, and PR-8 each regenerate the golden JSON — never two of them in flight at once.

---

## 1. Architecture integration points (grounded) — the locked decisions

Specs hook into these real seams; the eight decisions below are **locked** and every spec conforms to them.

1. **Season data model (D1).** New top-level `Season { races: SeasonRace[]; blocks: SeasonBlock[] }` in `src/types/index.ts` — `SeasonRace { id; priority: 'A'|'B'|'C'; raceInfo: RaceInfo; status }`, `SeasonBlock { kind: 'BUILD'|'TAPER'|'RACE'|'RECOVER'|'BRIDGE'; raceId; dateRange; residualsCarried? }`. `TrainingPlan` (`src/types/index.ts:387`) **stays the unit of generation and rendering**, gaining only an optional `seasonBlockId` tag. An existing single-race athlete is the degenerate one-race season (lazy migration shim wraps `plan.race` into `season.races[0]` priority A) — so the ~90 existing vitest files, compliance, Garmin push, and coach snapshot are untouched.
2. **Derived, never stored, season state (D2).** The inter-event state machine lives in a new pure-TS `src/engines/season/` module; the current block is **recomputed deterministically from `(races, today, loggedActuals)`** on every read. No stored mutable "current state" ⇒ it cannot wedge — the explicit design answer to Garmin's documented post-race "stuck in recovery" failures. The coach *narrates* season state (`api/coach/_core.py`), never owns it.
3. **Regeneration never destroys history (D3).** Weeks dated before today are immutable; season re-chaining (G1), realignment (G4), and repacing (G5) splice `plan.weeks` **from the current week forward only**. Logged actuals already live in their own storage keys, never inside the plan. Every regeneration flows through the one existing atomic write seam: `src/utils/chatProposal.ts` validation + `ProposalCard.tsx` apply/undo.
4. **Pace write-back = generalize the rezone seam (D4).** `src/utils/rezone.ts` (rewrites baked HR strings when zones change) gets a sibling `repace.ts` that rewrites baked pace strings in future `PlannedDay.detail`/`plannedWorkout` when the effective VDOT changes. `athleteCurrentVdot` (`src/engines/planGenerator/paceTargets.ts`) reads a new `calibratedVdot` with provenance (`self_reported` vs `calibrated`), **opt-in only**.
5. **One structured-workout source for every watch (D5).** Factor the step model out of `src/engines/planGenerator/garminWorkout.ts` (`buildGarminPayloadForDay`, :284) into a platform-neutral `structuredWorkout.ts` intermediate; Garmin (today) and Apple WorkoutKit (G2c) render from it. Future third platforms are a renderer, not a rewrite.
6. **Public calculators are pure-client (D6).** G10 tools ship as extra Vite HTML entries (`build.rollupOptions.input`) in the existing build — **zero API calls, zero new auth surface** — which takes every `docs/MULTI_USER_TODO.md` blocker (no HTTP rate limiting, HMAC tokens) out of the critical path. Any calculator that would need an API call is out of scope by rule.
7. **Vercel 12-function standing rule (D7).** No PR adds a serverless function. New server behavior multiplexes into existing action switches: Garmin batch push into `api/garmin/activities.py`, realignment authoring into the coach ping handler, season sync into `api/_sync` (additive JSONB key).
8. **Coach context pattern (D8).** New sections `SEASON`, `RACE_PACING`, `INTENSITY` follow the exact `buildCoachSnapshot` (`src/App.tsx`) → `build_context_block` (`api/coach/_core.py`) named-section pattern used by the ~20 shipped sections (FUELING, RECOVERY, PLAN ADVISORIES, READINESS_DIRECTIVE…), each locked by an L4 fixture-honesty test.

**Other seams the specs reuse:** `generatePlanFromMethod` (`src/engines/planGenerator/generatePlan.ts`) and `generateHyroxPlan` (`src/utils/planGenerator.ts`) as block generators; `postRaceRecovery()` (`src/utils/recovery.ts`) as the RECOVER block core; `projectRaceDayTSB` / `getTSBState` (`src/utils/performance.ts`) for taper tiers; `assessFeasibility()` (`src/engines/planGenerator/feasibility.ts`) for season advisories; `useProactivePings.ts` triggers (`skipped_workout` :152, `compliance_drift` :284); `pushWorkoutToGarmin` (`src/utils/garmin.ts:128`); Minetti/GAP (`src/engines/terrain/locomotion/{minetti,gap}.ts`) + course files (`src/data/courses/broken-arrow-{11k,18k,46k}-2026.ts`, `src/data/terrain/broken-arrow-18k-2026.json`); `timeInZone.ts`, `grading.ts`, `runGAP.ts` as recalibration inputs; `terminology.ts` for plain-language names; `carbTargetForRaceMiles` (`src/utils/fueling.ts`) and `environmentPrep.ts` for the calculators.

Per CLAUDE.md, every user-facing item carries the **Witchel 3-rule check** (massive market · visceral solve · customer language) inline.

---

## 2. The Close vs. Win ledger

"Close" = parity with the market benchmark. "Win" = the verified differentiator. Win conditions are measurable and name the competitor they beat.

| Gap | Close (parity) | Win (differentiator) | Win condition vs. benchmark |
|---|---|---|---|
| **G1 season** | A/B/C race calendar + post-race recovery block (TrainingPeaks ATP parity) | **Residual-aware bridges chaining running + Hyrox** with cited science; derived state machine; coach narrates the season | Generate a valid half→Hyrox→marathon season **no app on the market can represent**; post-race state can never wedge (vs. Garmin's stuck-in-recovery threads) |
| **G2 execution loop** | Week-batch push to Garmin, surfaced in UI (Runna pushes 2 weeks) | **Auto re-push on every plan edit/realignment — the plan on the wrist is never stale**; then Apple WorkoutKit from the same intermediate | Runna pushes workouts; **nobody re-pushes on adaptation**. Stale-workout window after an applied edit ≈ 0 (next Garmin sync) |
| **G3 onboarding** | Goal-first flow + value preview (Runna's ~30-screen benchmark) | **Live personalized week-1 preview** mid-flow (plan gen is client-side and fast) — Runna previews a template, we preview *your* plan | Preview visible before 50% of questions are asked; identical answers ⇒ identical final plan (golden guard) |
| **G4 realignment** | Missed-workout prompt + explain + one-tap (Runna parity) | Fires at **1 missed key session or 2 of any type** (vs. Runna's >3), coach-authored *why*, undo, **chained to auto watch re-push** | Realignment offer within 24 h of the qualifying miss; zero silent plan changes (guard test) |
| **G5 adaptive paces** | VDOT/pace recalibration from actuals (Runna Pace Insights parity) | **GAP-corrected trail inputs** + compliance-grade filtering + evidence-cited proposal; opt-in, targets-only | Recalibrates from *trail* runs via Minetti GAP — Runna's one adaptive signal is road speed-work only |
| **G6 race pacing** | Grade-adjusted split bands (Garmin PacePro parity, free) | Trail-tuned Minetti bands **+ fueling checkpoints + heat/altitude cautions, calibrated to the athlete's adaptive VDOT**, for the 3 Broken Arrow courses first | A pacing+fueling race card **Garmin doesn't produce and Runna explicitly declines**; category-first for trail |
| **G7 intensity monitor** | Weekly easy/hard split with plain-language load truth (Garmin DSW-adjacent praise) | **Polarization compliance vs. the athlete's chosen method's target** + aerobic-decoupling durability trend on long runs | Nobody in the competitive set computes method-specific intensity-distribution *compliance*; "your easy days are too hard" said with receipts |
| **G8 readiness UX** | Verdict-first, trend-over-number, plain-language (WHOOP/TP conventions) | **Every red pairs with a one-tap concrete action** (the deload program already exists — surface it); orthosomnia-safe framing | Audit checklist 100%: action-paired reds, trend-first, non-color redundancy, plain-language defaults |
| **G9 consistency** | Weekly sessions-completed-vs-planned view | **Rest-as-compliance + grace mechanics, no streaks by design** (BJHP 2025; Milkman 2021) | A planned rest day renders as ✓ compliance; a negative test asserts no streak counter exists anywhere |
| **G10 free tools** | Free calculators at public URLs (Vert.run parity) | **Deeper engines behind them** (Minetti vert-adjusted prediction, tiered g/hr fueling, heat protocol) + CTA into onboarding | 3 tools live unauthenticated with **zero new API surface**; tool→signup referral measurable |

---

## 3. The specs

Grouped by tier. Each: **User story · Spec · Acceptance · Testing (L1–L4) · Witchel · Effort · Deps.**

### TIER 1 — the season centerpiece + the trust wins

#### G1a — Season Engine: inter-event state machine + residual-aware bridges *(the multi-race training approach, §7 of the analysis)*

- **User story:** *As an athlete racing a half marathon, a Hyrox, and a marathon this year, I want one plan that chains all three — recovering, bridging, rebuilding, and tapering on purpose — so I never face the post-race "now what?" void or lose fitness between events.*
- **Spec:** New `src/engines/season/` module, `planSeason(races, config, today) → Season`:
  - **State machine (per D2, derived):** `RACE → RECOVER → BRIDGE → BUILD → TAPER → RACE…`. RECOVER wraps the shipped `postRaceRecovery()` formulas (`src/utils/recovery.ts`) into *generated weeks* (reverse taper: volume back before speed) instead of prose. BUILD calls the existing block generators (`generatePlanFromMethod` / `generateHyroxPlan`) with a compressed-runway config honoring the **≥8 weeks to next peak** rule. TAPER targets **Friel TSB tiers** via `projectRaceDayTSB` (`src/utils/performance.ts`): **A +15..+25 · B −10..0 · C train-through** (below).
  - **Residual-aware BRIDGE (the category-first piece):** a residual table pinned to Issurin (Sports Med 2010) — aerobic **30±5 d**, max strength **30±5 d**, anaerobic glycolytic **18±4 d**, strength-endurance **15±5 d**, speed **5±3 d** — plus maintenance doses (Bickel 2011: strength holds at **1×/wk** once built; Hickson 1981: aerobic holds on 2–4 d/wk **if intensity is preserved**). Bridge content is selected by *next-race demands vs. decaying residuals*: the **half→Hyrox** bridge holds aerobic with 1–2 intensity touches while concentrating strength-endurance/glycolytic (their 15–18 d residuals mean they train **last**); the **Hyrox→marathon** bridge holds strength at 1×/wk while rebuilding run volume (Wilson 2012: acceptable — strength is maintenance-only; Hickson 1980: interference emerges only ~week 8, so short bridges are low-risk).
  - **B/C race handling (converged market grammar, §7.1):** only A races get full peak+taper; B races get a race-week mini-taper inside the active block + enforced post-race recovery days + tune-up placement 4–6 wk out feeding the shipped predictor rehearsal; C races are a day-type stamp, trained through. Proximity threshold: a secondary race <10 days from an A race is trained through.
  - **Season-level feasibility honesty:** extend `assessFeasibility()` with `season_peaks_too_close` (<8 wk between A peaks → suggest B-tagging one, the exact TrainerRoad/Athletica failure), `season_too_many_a_races` (3+ A races/season — Friel: "wastes the season"), `b_race_proximity`.
- **Acceptance:** the `half-then-hyrox-then-marathon` persona yields a block chain `BUILD→TAPER→RACE(half,A)→RECOVER→BRIDGE→BUILD→TAPER→RACE(hyrox,A)→RECOVER→BRIDGE→BUILD→TAPER→RACE(marathon,A)` with every RECOVER sized by the shipped R5 formula, every BRIDGE containing the residual-correct content, every A-taper projecting TSB into its tier band. Two A races 5 wk apart ⇒ `season_peaks_too_close` advisory. **A single-race athlete's generated plan is byte-identical to today's** (guard).
- **Testing:**
  - **L1:** residual decay table returns Issurin windows (assert the constants cite the paper, not magic numbers); bridge selector picks strength-endurance last for Hyrox-next; `taperTierTarget('A'|'B'|'C')` returns +15..+25 / −10..0 / train-through; 8-wk peak-spacing checker.
  - **L2 (apply):** `planSeason(threeRaces)` → block-sequence assertion (new `seasonAssert.ts` helper); Hyrox-bridge weeks contain ≥1 intensity-preserving aerobic touch AND strength-endurance/glycolytic emphasis; marathon-bridge weeks contain exactly 1 strength day/wk with rising run volume; RECOVER length = shipped `postRaceRecovery()` output.
  - **L2 (guard):** one-race season ⇒ blocks = `BUILD→TAPER→RACE` and the inner plan deep-equals `generatePlanFromMethod` output; races <10 d apart ⇒ the secondary is trained through (no second taper).
  - **L3:** three new golden personas committed; `single-race-unchanged` diff is empty.
  - **L4:** *(lands in G1b — engine PR has no prompt surface)*.
- **Witchel:** ✅ massive (every racer books multiple events/yr; hybrid Hyrox+running is the fastest-growing segment) · ✅ visceral (the post-race void + fear of losing fitness between events; Garmin's stuck-in-recovery threads show the pain live) · ✅ customer language ("plan my season", "my next race", "A race").
- **Effort:** L. **Deps:** PR-1 (data model).

#### G1b — Season surface: race calendar UI + multi-race onboarding + SEASON coach narration

- **User story:** *As a multi-race athlete, I want to see my whole season — every race tagged A/B/C on a block timeline — and have my coach explain where I am in the chain and why today's workout serves the NEXT race.*
- **Spec:** (a) **Race calendar panel**: add/edit races with A/B/C priority, block-timeline strip (BUILD/TAPER/RACE/RECOVER/BRIDGE color+label chips — non-color redundant per §4), B-race mini-taper and tune-up stamps rendered inside the active `WeeklyPlan`, C-race day stamp. (b) **Onboarding**: the race step in `useOnboarding.ts` becomes multi-race capable ("add another race?" branch, priority picker); single-race flow unchanged. (c) **Coach narration**: `buildCoachSnapshot` adds `seasonContext` → `build_context_block` emits a `SEASON` section (current block, what quality this block protects, days to next race, why today serves the *next* race) — no competitor's AI can explain a season. (d) Season sync: additive `season` key in localStorage + `api/_sync` allowlist (per D7).
- **Acceptance:** adding a second race regenerates only future weeks (D3); the coach's answer to "why is today easy?" during a BRIDGE cites the season ("holding your aerobic base while your legs absorb the Hyrox — marathon build starts Monday"); single-race athletes see no season UI (guard).
- **Testing:** **L1** timeline layout math; **L2** calendar component behavioral (add B race → mini-taper stamp appears in race week; C race → day stamp only); **L2 guard** one race ⇒ no timeline strip rendered; **L3** golden personas re-verified post-UI; **L4** fixture with a mid-BRIDGE snapshot → `build_context_block` contains `SEASON` and the block name; fixture without a season ⇒ section absent.
- **Witchel:** ✅✅✅ (same as G1a — this is its face).
- **Effort:** M/L. **Deps:** PR-6 (G1a).

#### G2a — Garmin push UX: week-batch push + auto re-push on edit

- **User story:** *As an athlete whose plan just changed, I want my watch to already know — send my week to the watch once, and keep it current when my coach and I adjust the plan — so I never run yesterday's plan.*
- **Spec:** (a) `pushWeekToGarmin` in `src/utils/garmin.ts` batching `buildGarminPayloadForDay` payloads for all pushable future days of the visible week (multiplexed into `api/garmin/activities.py` per D7); "Send week to watch" button on the week header (per-day button on `DayCard.tsx:77-108` stays). (b) **Auto re-push:** track pushed-workout ids per date in a localStorage map; on any applied plan edit (the `chatProposal.ts` apply path — one seam catches coach proposals, realignment, repace, season re-chain) diff future pushed days and re-push changed ones. (c) **Surfacing:** offer the week push at onboarding-complete (post-`CoachLetter`) and after every applied proposal ("Plan updated — 3 workouts re-sent to your watch").
- **Acceptance:** week push sends only future, pushable, non-completed days; an applied proposal that edits Tue+Thu re-pushes exactly Tue+Thu; unchanged days are not re-sent (guard); disconnected Garmin degrades to the current per-day silence.
- **Testing:** **L1** batch assembly + diff logic pure functions; **L2** push-payload assertions (mock the POST; assert payload set for the edit scenario); **L2 guard** no-edit ⇒ zero re-push calls; completed day never re-pushed; **L4** n/a.
- **Witchel:** ✅ massive (execution happens on-wrist; Runna's moat) · ✅ visceral ("I don't want to memorize intervals" / "my watch still has the old workout") · ✅ customer language ("send it to my watch").
- **Effort:** S/M. **Deps:** none — **ship first for momentum.**

#### G4 — Plan realignment as first-class UI (beat Runna's >3 threshold)

- **User story:** *As an athlete who missed workouts this week, I want my coach to notice and offer a rebalanced week — explained, one-tap, reversible — so my plan bends instead of silently drifting or silently changing.*
- **Spec:** Wire the two shipped detectors (`useProactivePings.ts`: `skipped_workout` :152, `compliance_drift` :284) to *author a realignment proposal*: the ping handler (coach function, D7) composes plan-edit ops via the shipped proposal contract (`api/coach/_core.py`) → renders as the shipped `ProposalCard.tsx` (Apply / Modify / Keep original + undo + "🧠 Why?"). **Trigger policy: 1 missed key session (long run / race-specific quality) or 2 missed of any type within 7 days** — vs. Runna's >3. "Keep original" suppresses re-prompting for that week. Realignment ops obey D3 (future weeks only) and chain into G2a auto re-push.
- **Acceptance:** miss Tuesday's long run ⇒ a realignment card exists by Wednesday 24 h later with a rationale naming the missed session; miss one easy run ⇒ no card (guard); applying re-pushes changed days to the watch; declining leaves the plan untouched and quiet for the week. **Never a silent change** (guard: plan hash unchanged without an applied proposal).
- **Testing:** **L1** trigger policy pure function (key-session taxonomy); **L2** detector fires → proposal ops validate atomically via `chatProposal.ts`; **L2 guard** completed week ⇒ no ping; second prompt same week after "keep" ⇒ suppressed; **L4** fixture-honesty: realignment ping context includes the missed-session facts the LLM must cite.
- **Witchel:** ✅ massive (missed workouts are universal) · ✅ visceral (silent drift is the failure mode; silent auto-change is the *other* failure mode — the most-criticized AI pattern) · ✅ customer language ("life happened, rebalance my week").
- **Effort:** M. **Deps:** PR-2 (for the re-push chain; card works without it).

### TIER 2 — adaptive intelligence + the race-day differentiators

#### G3 — Onboarding as belief-building (goal-first + live plan preview)

- **User story:** *As a new athlete, I want to tell the app my race and immediately SEE my plan taking shape — before I've answered 20 questions — so I believe in the product before it asks me to invest.*
- **Spec:** Reorder `Onboarding.tsx` goal-first (race/goal → experience → fitness anchor), then render a **live personalized week-1 preview + top-3 method match** (`methodSelection.ts` + client-side `generatePlanFromMethod` — fast, no API) mid-flow after ~5 questions; remaining plan-shaping questions refine the preview visibly ("+2 strength days added"). Move the LLM `CoachLetter` earlier (right after plan save). **Defer every non-plan-changing question** (gear details, landmarks, persona tuning) out of onboarding into contextual asks via the shipped `useProactivePings` pattern (NN/g: ask only what changes the plan, teach in context). Rich config in `useOnboarding.ts` is preserved — only *when* things are asked changes.
- **Acceptance:** preview visible before 50% of steps; every remaining onboarding question demonstrably changes the plan (map question→plan input); identical answers in any order ⇒ identical final plan; time-to-first-full-plan < 3 min at normal reading pace.
- **Testing:** **L1** question→plan-input coverage map (a question with no consumer fails the test); **L2** preview component renders a real generated week 1 from partial config; **L3 (the safety net):** golden ground-truth proves identical final plans for identical answers pre/post reorder — this PR regenerates zero golden diffs by definition; **L4** coach-letter fixture unchanged.
- **Witchel:** ✅ massive (fitness apps lose ~75%+ of users in 3 days; onboarding is where belief forms) · ✅ visceral ("show me my plan before you ask me to believe") · ✅ customer language ("what will my training actually look like?").
- **Effort:** M/L (high churn on `Onboarding.tsx` — isolated PR). **Deps:** none.

#### G5 — Performance-adaptive pace targets (Runna "Pace Insights", but trail-true)

- **User story:** *As an athlete getting fitter, I want my pace targets to keep up with me — recalibrated from what I actually ran, explained, and only with my consent — so my paces never go stale.*
- **Spec:** New `src/engines/planGenerator/recalibration.ts`: rolling **effective-VDOT estimator** from logged actuals — inputs: compliance grades (`grading.ts`) to filter honest efforts, `timeInZone.ts` (compliant-HR filter), **GAP via `runGAP.ts`/Minetti for trail sessions** (the input Runna doesn't have), `vdotFromRace`/inverse from `vdot.ts`. Output: a `calibratedVdot` (provenance-tagged, D4) delivered **only as a `ProposalCard` proposal** with evidence ("your last 3 tempo runs averaged 8 s/mi faster than target at compliant HR — update targets?"). Apply ⇒ `repace.ts` rewrites future baked pace strings; `blendGoalPaces` keeps its calendar blend but blends *from* the calibrated anchor. **Opt-in, targets-only, never restructures weeks.**
- **Acceptance:** 3 compliant faster-than-target quality sessions ⇒ a recalibration proposal with cited evidence; non-compliant or HR-drifted efforts excluded; declining changes nothing; applying updates only future days' targets; structure (week/day types) is untouched (guard).
- **Testing:** **L1** estimator math (GAP-corrected inputs; compliance filter); **L2** proposal generated under the scenario, ops touch only pace strings; **L2 guard** *no target changes without an applied proposal* (plan-hash assertion — the anti-silent-change encoding); **L3** golden persona `improving-runner` shows repaced future weeks only; **L4** proposal context contains the evidence lines.
- **Witchel:** ✅ massive (every improving athlete) · ✅ visceral ("my paces got stale" / "it still thinks I'm the runner I was in January") · ✅ customer language ("am I faster now?").
- **Effort:** M. **Deps:** PR-1 (provenance field); feeds PR-9.

#### G6 — Course-aware trail race pacing (PacePro-for-trail + fueling checkpoints)

- **User story:** *As a Broken Arrow racer, I want grade-adjusted pace bands for every segment of MY course — with fueling checkpoints on the same card — so I neither blow up on the first climb nor bonk on the second.*
- **Spec:** New `src/engines/racePacing/`: per-segment **grade-adjusted pace bands** for the 3 BA courses (`src/data/courses/broken-arrow-{11k,18k,46k}-2026.ts` + `src/data/terrain/broken-arrow-18k-2026.json`) through Minetti cost (`locomotion/minetti.ts`, `gap.ts`) — band = the athlete's **calibrated** VDOT-derived flat pace × terrain cost ± confidence; power-hike bands above the hiking-economy threshold (`locomotion/hiking.ts`). Overlay **fueling checkpoints** (`carbTargetForRaceMiles` → cumulative g/carb schedule pinned to aid-station segments) + heat/altitude cautions (`environmentPrep.ts`). Surfaces: a race-plan card in race week + `RACE_PACING` coach section (D8). Course matching via `courseMatching.ts`; unmatched course ⇒ feature absent (guard), extensible course-data format documented for growth beyond BA.
- **Acceptance:** BA-18k athlete in race week sees per-segment bands (climbs slower + hike flag, descents GAP-informed) + g/hr checkpoints summing to the race target; road-race athlete sees nothing (guard); bands shift when `calibratedVdot` changes.
- **Testing:** **L1** band math pinned to Minetti polynomial values; checkpoint sums = `carbTargetForRaceMiles` tier; **L2** race-week plan contains the card for a matched course, segments monotone with grade; **L2 guard** unmatched/road course ⇒ no card, no `RACE_PACING` section; **L4** fixture contains segment guidance ("power-hike the headwall").
- **Witchel:** ✅ massive (race-day execution is the whole point of training) · ✅ visceral (blowing up from bad pacing; Garmin does this free on road — trail athletes have nothing) · ✅ customer language ("what pace on the climbs?").
- **Effort:** M/L. **Deps:** PR-8 (calibrated VDOT), PR-1 (race model). Start with the 3 BA courses per the analysis.

#### G7 — Intensity-distribution monitor ("gray-zone guard") + durability metric

- **User story:** *As an athlete whose easy days creep too hard, I want a weekly plain-language check of my easy/hard split against MY method's target — and a durability read on my long runs — so the most-quoted coaching truth in the sport gets said to me with receipts.*
- **Spec:** New `src/utils/intensityDistribution.ts`: weekly easy/hard time split from `timeInZone.ts` vs. a new per-method `intensityTarget` (added to each of the 9 method files in `src/data/methods/` — e.g. 80/20 for `fitzgerald_8020`, polarized for `koop`); "gray-zone guard" advisory when easy-day time bleeds into mid zones; weekly split bar in `ComplianceWeekRow` (non-color redundant). **Aerobic decoupling** (pace:HR first-half vs. second-half, GAP-corrected) computed on long runs → durability trend. Both feed an `INTENSITY` coach section (D8). Plain-language names via `terminology.ts` ("Easy/Hard Balance", "Endurance Durability").
- **Acceptance:** a week of gray-zone easy runs ⇒ advisory quoting the method's own target ("Koop's plan wants your easy days easy: 82% target, you ran 61%"); compliant week ⇒ no advisory (guard); long run with >8% decoupling flags durability, capped-effort long run doesn't.
- **Testing:** **L1** split + decoupling math (GAP-corrected halves); **L1** all 9 method files carry a validated `intensityTarget`; **L2** advisory emitted/withheld per scenario; **L4** `INTENSITY` section fixture-honesty.
- **Witchel:** ✅ massive ("your easy days are too hard" is the most-quoted coaching truth in the category; Garmin's DSW praise centers on exactly this) · ✅ visceral (chronic gray-zone = staleness + injury) · ✅ customer language ("am I going too hard on easy days?").
- **Effort:** M. **Deps:** none hard (parallel with G6).

### TIER 3 — polish, funnel, and the second platform

#### G8 — Readiness UX hardening (orthosomnia-safe, action-paired, accessible)

- **User story:** *As a masters athlete looking at a red readiness morning, I want a concrete next step and a trend — not a scary number — in words I use, with encodings I can read.*
- **Spec:** Audit + polish pass on `ReadinessBanner.tsx`/`TodayBriefing.tsx` per the §4 checklist: **every red state pairs with a one-tap concrete action** (wire `computeDeloadProgram()` / `suggestDailyAdjustment()` outputs as the action button — they exist, they're just not the CTA); trend arrow beside every score (trend-over-number); uncertainty framing on single-metric reds; **non-color redundancy** at the two known offenders (DayCard readiness dot :120 → add glyph/label; `ComplianceWeekRow` zone bars → pattern/text) since ~8% of men are red-green colorblind and the base skews masters; confirm `terminology.ts` plain-language defaults at every readiness render (TP renamed CTL/ATL/TSB — we already have the machinery).
- **Acceptance:** grep-level audit table in the PR: every RED/YELLOW render site lists its paired action; zero color-only encodings remain (axe/manual pass); default detail level shows no bare acronyms.
- **Testing:** **L1** n/a (audit); **L2** component tests: red banner renders an action button whose handler opens the deload program; zone bar exposes text/`title` + non-color mark; **L4** readiness directive fixtures unchanged (no regression).
- **Witchel:** ✅ massive (retention/trust; masters-skewed base) · ✅ visceral (orthosomnia — "my watch said red and now I'm anxious" — pair it with an action) · ✅ customer language ("what should I do about it?").
- **Effort:** S. **Deps:** none.

#### G9 — Flexible-consistency mechanics (not streaks)

- **User story:** *As an athlete who trains 4 days a week, I want consistency measured as sessions-completed-vs-planned with rest counting — never a streak I can lose by resting — so the app rewards following the plan, not compulsive activity.*
- **Spec:** `ComplianceWeekRow` gains a weekly header: **"N of M sessions — rest days count"** (planned rest already renders ✓ via `RestCell` :411 — promote it to the headline metric); grace framing (1 flexed session/week doesn't mark the week failed — Milkman 2021: flexibility → durable habits); 4-week consistency trend in plain language. **Explicit design rule: no streak counter, ever** (BJHP 2025: rigid streaks backfire where rest is programmed) — encoded as a test.
- **Acceptance:** a week with all sessions done + 3 planned rest days shows 100% consistency; moving Tuesday's run to Wednesday doesn't ding the week; the string "streak" appears nowhere user-facing (guard).
- **Testing:** **L1** weekly consistency math (rest counts; grace window); **L2** component renders the headline + grace case; **L2 guard (negative):** repo-level assertion that no streak-counter component/string ships.
- **Witchel:** ✅ massive (habit is the product; BCT self-monitoring is a first-class object) · ✅ visceral ("I don't want to lose my streak on a rest day" — the anti-pattern we refuse) · ✅ customer language ("did I do what I planned this week?").
- **Effort:** S. **Deps:** none (pairs with G8 in one PR).

#### G10 — Free standalone tools as acquisition funnel

- **User story:** *As a trail runner Googling "how many carbs per hour for an ultra", I want a genuinely good free calculator — and if it impresses me, a path into the full coach.*
- **Spec:** Three **pure-client** public pages (D6) as extra Vite entries at stable URLs, no login, no API: (1) **Trail fueling planner** — `carbTargetForRaceMiles` tiers + gut-training guidance from `fueling.ts`; (2) **Vert-adjusted finish predictor** — distance+vert+recent-race → Minetti/GAP-adjusted finish scenarios (`locomotion/{minetti,gap}.ts` + `predictRaceTime` from `feasibility.ts`) — deeper than Vert.run's ITRA-index scenarios; (3) **Race-day heat planner** — acclimation protocol windows from `environmentPrep.ts`. Each: shareable results, plain-language, masters-accessible (§4), and a "get the full plan — this is 1% of the engine" CTA into onboarding with a `?from=tool` referral param persisted through signup. Add URLs to the PWA scope but pre-auth shell (never mounts `LoginScreen`).
- **Acceptance:** all 3 pages load logged-out with zero network calls to `api/*` (guard); numbers match the in-app engines exactly (shared functions, not copies); CTA lands in onboarding with referral param intact.
- **Testing:** **L1** reuse existing engine tests (no logic duplication to test); **L2** page-level: renders + computes with no fetch (mock `fetch` throws — the pure-client rule as a test); referral param survives to onboarding config.
- **Witchel:** ✅ massive reach (top-of-funnel; Vert.run proves the pattern) · ✅ visceral (a real pre-purchase job done free) · ✅ customer language ("how many carbs per hour?", "what's my trail finish time?").
- **Effort:** M. **Deps:** none — fully parallelizable.

#### G2b — Today surface + morning report packaging

- **User story:** *As an athlete opening my phone at 6 AM, I want one glanceable screen — readiness verdict, today's workout, why — that IS my morning report.*
- **Spec:** Harden the Summary view (already the PWA `start_url ?view=summary`) into a true today surface: `TodayBriefing` first, today's `DayCard` + "why this workout" one-liner (from the shipped coach guidance) second, everything else below the fold. Package the existing 6 AM push (`api/coach/push.py` `DEFAULT_PERIODS` [6,13,20]) as the **Morning Report** — notification deep-links to the today surface; evening (20:00) push becomes the **evening preview** of tomorrow (the §4 few-smart-notifications doctrine: these two, not generic nudges). Add PWA `shortcuts` entries (`manifest.webmanifest`) for Today/Coach. *(Native home-screen widgets are explicitly deferred — companion-app scope, revisit with G2c learnings.)*
- **Acceptance:** cold PWA open lands on today-first layout in one paint; 6 AM notification opens directly to it; evening push contains tomorrow's session name.
- **Testing:** **L2** component order + deep-link routing tests; push-payload assertion for morning/evening content; **L4** morning-report fixture (readiness + today's slot) renders coherently.
- **Witchel:** ✅ massive (the daily habit loop; WHOOP/Oura/Garmin all converged here) · ✅ visceral (the 6 AM "what am I doing today?" glance) · ✅ customer language ("what's on today?").
- **Effort:** S/M. **Deps:** PR-2 patterns; independent of Apple.

#### G2c — Apple WorkoutKit push (the second platform)

- **User story:** *As an Apple Watch athlete, I want my structured workouts on my wrist just like Garmin users get — intervals, targets, and all — so execution never depends on memorizing my plan.*
- **Spec:** (a) First factor the **platform-neutral `structuredWorkout.ts` intermediate** out of `garminWorkout.ts` (D5) — Garmin rendering must be provably unchanged (payload snapshot tests). (b) Extend `ios/BrokenArrowHealth` with WorkoutKit (iOS 17+): compose `CustomWorkout`/`WorkoutPlan` from the intermediate, delivered through the existing `api/apple/` sync channel; scheduled to the athlete's watch calendar. Auto re-push reuses the G2a diff logic (one seam, two platforms). TestFlight-internal first; App Store posture is an explicit external dependency, not a blocker for internal athletes.
- **Acceptance:** a structured interval day renders equivalent steps on Garmin and Apple from one source (fidelity matrix: warmup/repeats/targets/cooldown); read-only HealthKit behavior untouched (guard); plan edit re-pushes on both platforms.
- **Testing:** **L1** intermediate→WorkoutKit mapper (Swift unit tests) + intermediate→Garmin snapshot equality; **L2** cross-platform fidelity matrix test; **L2 guard** HealthKit ingest regression suite green.
- **Witchel:** ✅ massive (Apple Watch is half the wrist market) · ✅ visceral ("send it to my watch" — currently answered 'only if it's a Garmin') · ✅ customer language (same).
- **Effort:** L (+ external gatekeepers). **Deps:** PR-2 (intermediate + re-push logic).

---

## 4. UX/UI conformance workstream (§6 of the analysis)

The five patterns that won 2024–2026 (§6.1) and the design-science checklist (§6.2) are **standing requirements enforced across the specs** — this section is the auditable map. Every row must hold at every PR (reviewers check touched surfaces against it), and rows with a ⚙ carry their own test.

**The five winning patterns → where they land:**

| # | Pattern (benchmark) | Lands in | Status after this plan |
|---|---|---|---|
| 1 | Verdict-first, data-underneath (WHOOP 3-tier; Garmin Morning Report; TP renames) | **G8** hardening + existing score/narrative | ● action-paired, trend-first, plain-language |
| 2 | Proactive morning narrative (WHOOP Daily Outlook; Oura Advisor) | **G2b** Morning Report packaging of the shipped 6 AM push | ● a named surface, not just a ping (persona editor already exceeds Oura's tone-picker) |
| 3 | Adaptation prompts as first-class UI (Runna realignment) | **G4** | ● at a tighter threshold than Runna, with undo + watch re-push |
| 4 | AI text adds context, never restates stats (the 2026 r/Strava study's four tensions) | **standing bar** — every new coach section (SEASON, RACE_PACING, INTENSITY) | ● L4 fixture-honesty enforces grounded, non-numeric-restating sections; keep clearing the bar Garmin Connect+ shipped beneath |
| 5 | Belief-building onboarding with value preview (Runna) | **G3** | ● live *personalized* preview beats Runna's template preview |

**Design-science checklist (§6.2) → conformance table (⚙ = has a test):**

| Checklist item | Where it lands | Enforcement |
|---|---|---|
| Ask only what changes the plan; teach in context (NN/g) | G3 reorder + deferred contextual asks | ⚙ question→plan-input coverage map test |
| Time-to-first-value: first completed workout inside week 1 | G3 preview + G2a onboarding-complete watch push + G2b today surface | preview <50% of steps ⚙; week-1 workout pushable day one |
| First-class BCT objects: goals, self-monitoring, feedback, prompts | goals (G1 race calendar) · self-monitoring (G9 consistency, G7 monitor) · feedback (G5 evidence proposals) · prompts (G4) | each carries its own L2 |
| **No rigid streaks** — weekly consistency with rest-as-compliance (BJHP 2025; Milkman 2021) | G9 | ⚙ negative guard: no streak counter ships |
| Few, smart notifications (evening preview + morning readiness only) | G2b packages the existing [6,13,20] cron; no new generic nudges anywhere in this plan | review rule + push-payload tests ⚙ |
| Readiness: traffic-light + expandable factors; orthosomnia-safe reds (action, uncertainty, trend-first) | G8 | ⚙ red-renders-action component test |
| "Why this workout" one-liner with optional depth; never silent plan changes | G2b today surface; **D3 + G4/G5 proposal-only writes** | ⚙ plan-hash guard tests in G4 and G5 |
| Masters accessibility: 16px+ body floor, generous targets, WCAG 4.5:1, non-color redundancy on all zone/status colors | G8 (two known offenders fixed) + standing rule for all new UI (G1b timeline chips, G7 bars, G10 pages) | ⚙ component tests + axe pass at G8; PR review rule after |
| Measure sessions-completed-as-prescribed, not DAU (engagement-efficacy gap) | G9 headline metric; G10 referral param measures tool→signup | the metric the product reports to itself |

---

## 5. PR rollout — 12 PRs in 3 waves

| PR | Title | Items | Effort | Deps | Why here |
|---|---|---|---|---|---|
| **PR-1** | Season data model + test-harness extensions | D1 types, lazy migration shim, sync key, `seasonAssert.ts`, 3 golden personas | M | — | Foundation; zero behavior change; unblocks 6/7/9 |
| **PR-2** | Garmin push UX: week batch + auto re-push | G2a | S/M | — | Cheapest strategic win; ship first or with PR-1 |
| **PR-3** | Realignment proposal card | G4 | M | PR-2* | Wiring job on shipped machinery; the trust moment |
| **PR-4** | Readiness hardening + flexible consistency | G8 + G9 | S | — | Two audits, one polish PR |
| **PR-5** | Free public calculators | G10 | M | — | Parallelizable; zero API surface |
| **PR-G3** | Onboarding reorder + live preview | G3 | M/L | — | Isolated (golden harness proves plan-identity) |
| **PR-6** | Season Engine: state machine + bridges | G1a | L | PR-1 | The centerpiece; engine-only |
| **PR-7** | Season UI + onboarding races + SEASON coach section | G1b | M/L | PR-6 | The centerpiece's face |
| **PR-8** | Performance-adaptive pace recalibration | G5 | M | PR-1 | Feeds PR-9; proposal-only writes |
| **PR-9** | Course-aware trail pace bands + fueling checkpoints | G6 | M/L | PR-8, PR-1 | Category-first race card (3 BA courses) |
| **PR-10** | Intensity monitor + decoupling | G7 | M | — | Parallel with PR-9 |
| **PR-11** | Today/morning surface + Apple WorkoutKit | G2b + G2c | L | PR-2 | Apple last: external gatekeepers |

**Merge order:** PR-1 → PR-2 → PR-3 → PR-4 → PR-5 ∥ PR-G3 → PR-6 → PR-7 → PR-8 → PR-9 ∥ PR-10 → PR-11.
**Wave 1** (PR-1…PR-G3): momentum + foundation — four user-visible trust wins ship while the season foundation lands quietly. **Wave 2** (PR-6…PR-8): the strategic centerpiece. **Wave 3** (PR-9…PR-11): the differentiators on top. \*PR-3's re-push chain needs PR-2; the card itself doesn't.

---

## 6. Theory → Manifestation → Test traceability matrix

| Theory / verified pattern (source) | Manifestation | Test |
|---|---|---|
| Residual training effects: aerobic 30±5 d, max strength 30±5 d, glycolytic 18±4 d, strength-endurance 15±5 d, speed 5±3 d (Issurin, Sports Med 2010) | BRIDGE content selection in `src/engines/season/` | L1 residual table pins the windows; L2 bridge-content assertions |
| Strength holds at 1×/wk once built (Bickel 2011, PMID 21131862) | Hyrox→marathon bridge keeps exactly 1 strength day/wk | L2 marathon-bridge assertion |
| Aerobic holds on 2–4 d/wk if intensity preserved (Hickson 1981, PMID 7219129) | half→Hyrox bridge keeps 1–2 intensity touches | L2 Hyrox-bridge assertion |
| Interference is run-specific, dose-dependent, emerges ~wk 8 (Wilson 2012, PMID 22002517; Hickson 1980) | bridges are short by design; concurrent-load advisory beyond 8 wk | L1 bridge-length bound |
| Friel TSB taper tiers: A +15..+25 · B −10..0 · C below | `taperTierTarget` → `projectRaceDayTSB` targets per race priority | L1 tier function; L2 taper-block TSB projection in band |
| ≥8 wk between peaks (TrainerRoad rule); A-to-A ≤32 wk (TP); 1–2 A races/season (Friel) | `season_peaks_too_close` / `season_too_many_a_races` advisories | L2 advisory scenarios |
| Post-race runway ~1 easy day/mile + reverse taper (Pfitzinger convention; shipped R5) | RECOVER blocks generated from `postRaceRecovery()` | L2 recover-length = R5 output |
| Hyrox: running dominates (~51/84 min); strength-endurance + glycolytic are the differentiators, trained last (Frontiers Physiol 2025) | Hyrox-bound bridge/build ordering | L2 bridge emphasis ordering |
| Runna realignment fires only after >3 misses (verified) | G4 fires at 1 key / 2 any | L1 trigger policy; L2 24 h card |
| Silent auto-change is the most-criticized AI pattern (r/Strava 2026 study) | D3: all writes via proposal+undo; G4/G5 plan-hash guards | ⚙ L2 guards in both specs |
| Rigid streaks backfire where rest is programmed (BJHP 2025; Milkman 2021) | G9 rest-as-compliance; no streak counter | ⚙ negative guard |
| Ask only what changes the plan (NN/g); value preview builds belief (Runna benchmark) | G3 reorder + coverage map + live preview | ⚙ coverage-map test; golden plan-identity |
| Minetti grade cost / GAP (shipped engines) | G5 trail-true recalibration inputs; G6 pace bands | L1 band math pinned to Minetti values |
| Fueling tiers 45–90 g/hr by distance (shipped R2) | G6 checkpoint schedule; G10 fueling calculator | L1 checkpoint sums = tier |
| Non-color redundancy (~8% male red-green colorblindness; masters skew) | G8 offenders fixed + standing rule | ⚙ component tests + axe |
| Orthosomnia-safe reds: concrete action + trend + uncertainty | G8 action-paired reds | ⚙ red-renders-action test |

---

## 7. Sequencing, risks & the monetization note

**Risk register:**

- **G1 is the biggest lift and the headline.** Mitigation: Wave 1 ships four user-visible trust wins first; PR-1 lands the foundation invisibly; G6/G7's coach depth doesn't hard-block on it (PR-8/PR-10 have no G1a dependency).
- **Golden-plan churn** (PR-G3, PR-6, PR-8 all regenerate `docs/onboarding-ground-truth.json`): one-in-flight rule, diff reviewed per PR.
- **Storage/sync migration:** the `season` key is additive with a lazy shim; sync-merge tested for the two-devices-one-migrated case (existing `syncMerge` invariants suite extends).
- **Monolith pressure:** `App.tsx` (1577 lines) and `Onboarding.tsx` both get touched (G1b, G3). Rule: no router introduction inside a feature PR; extract-and-wire only.
- **Apple is the only externally-gated item** (iOS 17+, TestFlight/App Store review) — scheduled last, internal-first, explicitly out of our control past submission.
- **Recalibration trust risk** (the analysis's own warning): G5 is opt-in + proposal-only, encoded as an L2 plan-hash guard — a target can never change without an applied card.
- **G10 exposes engine logic publicly** (client-side JS): accepted — the funnel value beats the scraping risk; the auth surface is not expanded (pure-client rule D6).
- **Vercel 12-function cap:** standing rule D7; any spec needing a new function is redesigned first.

**Monetization note (flag, not scope):** the market prices exactly this plan's centerpiece as premium — multi-event is TP Premium-gated and Humango's $28.99/mo tier; the analysis's pricing table (§1.1) anchors self-serve at ~$19.90/mo. **The Season Engine (G1) + execution loop (G2) are the natural premium tier when pricing lands.** No billing code is in scope in these 12 PRs; the decision this plan forces is only: don't give away G1 by default once signup opens beyond the allowlist (`docs/MULTI_USER_TODO.md` blockers apply first anyway).

**Coverage check:** G1→PR-1/6/7 · G2→PR-2/11 · G3→PR-G3 · G4→PR-3 · G5→PR-8 · G6→PR-9 · G7→PR-10 · G8/G9→PR-4 · G10→PR-5. §6.1 patterns 1–5 and every §6.2 checklist row are mapped in §4. §7's Season Engine sketch items 1–5 land in G1a/G1b (calendar, state machine, bridges, feasibility honesty, coach narration). Nothing ranked is unowned.
