# Running (Road/Trail) Plan Generator — Critical Audit & Improvement Roadmap

**Date:** 2026-08-17 · **Trigger:** Jim (age 79) created a two-5K season and received a plan with a +109% weekly-mileage cliff and a "heavy maximal strength (4–5RM)" prescription.
**Verdict up front:** the defects in Jim's plan are not edge cases. They reproduce for **every one of the 9 training methods, at every runway length, at every age** — and the plan-QA gate is structurally blind to all of them. The road path never received the fixes the Hyrox path got in P3/P5: its volume is still phase-keyed rather than continuous, its personalization inputs are largely decorative, and the safety rules the codebase *does* contain govern numbers nothing consumes.

**Method:** Jim's exact season (79M, beginner, 6 days/week, 5K on 2026-10-03 + 5K on 2026-12-05) was regenerated through the production code path (`generatePlanFromMethod` → `planSeason` → `spliceSeasonWeeks`) for all 9 methods, plus controls (16-week single race; age 30 vs 79; 3 vs 6 days; declared 8 mi/wk base). Full reproduction data in the appendix. Every claim below carries a file:line.

---

## 1. Reproduction — Jim's bug is universal

Weekly mileage for Jim's 16-week two-race season, all 5K-applicable methods (today = 2026-08-17):

| Method | Weekly miles (race weeks bolded) | Worst jump |
| --- | --- | --- |
| daniels | 10.6, 11.4, 12.4, **26.8**, 24.2, 21.7, *5.1*, 15, 12, 11.4, 12.2, 15.8, 26.5, 24.2, 21.7, *5.1* | **+116%** (wk3→4) |
| fitzgerald_8020 | 10.6, 11.3, 12.4, **25.6**, 22.1, 19.8, *9.8*, … | **+106%** |
| pfitzinger | 13.7, 14.7, 16, **26.4**, 22.1, 18.8, *6.6*, … | +65% |
| roche_swap | 20.2, 21.2, 17.9, **29.1**, 30.6, 26.5, *12*, … | +63% |
| galloway | 18.6, 19.3, 17.4, **26.1**, 27.1, 24.8, *3.5*, … | +50% |
| hansons | **28.8**, 29.1, 29.8, 42.9, **45.3**, 42.2, *16.1*, … | +44% (from a 28.8 mi week 1!) |
| higdon | 20.2, 21.2, 22.2, **30.3**, 28.4, 26.2, *5.1*, … | +36% |
| koop / trainingpeaks | 17.2, 18, 15.3, 19.2, **26.7**, 23.7, *5.1*, … | +39% |

Jim's screenshot (11.4, 12.4, 13.4, 28, 25.4, 22.2, 5.1 …) is the daniels shape almost exactly. Observations that generalize:

- **Every method cliffs at the base→build phase boundary.** This is not runway compression: the full 16-week single-race daniels plan goes 11.6 → 25.4 (**+119%**) at the Phase I→II boundary, with three more +66/+68% jumps after each cutback.
- **The "build" weeks then *descend*** (26.8 → 24.2 → 21.7 labeled Taper) — a 7-week plan spends **3 of 7 weeks tapering** for a *5K* (a distance that needs ~7–10 days of taper), because `method.taper.durationWeeks` (3, authored for marathons) is distance-blind and the phase allocator pads the taper further.
- **The second race block repeats the identical pathology** — it is a fresh, independently generated plan (`spliceSeason.ts:447`), so the athlete gets the cliff twice per season, with a +143% jump out of the post-race recovery week for hansons.
- **Hansons hands a 79-year-old beginner 45.9-mile weeks for a 5K** — and starts him at 28.8 (2.9× his estimated 10 mi/wk base) in week 1. Hansons is rated `NOT_SUITED` for 5K in its own JSON; the recommender excludes it from the top-3, but nothing blocks generation when it arrives via a stored `selectedMethodId`, and the season splicer's fallback (`safeGenerate`, `spliceSeason.ts:445`) picks `RECOMMENDABLE_METHODS[0]` with no distance-suitability check at all.
- **QA passed nearly all of it.** Zero `qa_load_spike` findings on any of the above. The two methods that did produce error-level findings (koop/trainingpeaks `qa_taper_monotonic`, higdon `qa_d1_load` ×6) shipped anyway — and the higdon errors are *false positives* from a category-mapping bug (§3.G).

### Controls — the personalization inputs are largely decorative

| Control | Result |
| --- | --- |
| Age 30 vs age 79, same config | **Byte-identical plan content.** Only the HR zone table differs (Tanaka max-HR). Age changes *nothing* about volume, ramp, recovery cadence, intensity, or strength. |
| 3 vs 6 training days/week | Peak week 24.8 vs 25.4 mi — a **2% difference**. The same weekly volume is crammed into fewer, longer runs: the *less* available athlete gets *harder* individual sessions. |
| Declared `currentWeeklyMileage: 8` | daniels still peaks at 24.8 (3.1× declared base, reached in week 6 at +129%); higdon opens week 1 at 19.4 — **2.4× the volume the athlete just said they run**. |

---

## 2. Root cause — the ramp cap governs a number nothing consumes

The engine *has* a well-designed volume model. `buildWeeklyMileage` (`weekPlan.ts:366+`) starts from the athlete's current mileage, ramps linearly to a distance-floored peak, **caps week-over-week growth at the method's `maxWeeklyIncreasePct`** (10–15%), inserts cutback weeks, and anchors the taper to the last achieved build volume. For Jim on daniels the *target* curve is: start 10, peak 14 (1.4× current), never +10%/week. Sane.

That target is then consumed by almost nothing:

1. **Long runs** are sized from it (`weekMi.longRunMi`) ✔
2. **Easy/recovery runs** split `totalMi − longRunMi` across easy days (`computeEasyRunTime`, `generatePlan.ts:341-376`) — note: the *full* remainder, with **no deduction for quality volume** ✔/✘
3. **Quality workouts keep the method's fixed template size** — explicitly: *"Quality workouts keep the method's range (their structure sets the time)"* (`generatePlan.ts:545-560`). A Daniels Tuesday I-pace session is ~6–8 mi (reps + recoveries + warm-up/cool-down) regardless of whether the weekly budget is 12 or 40.

So actual weekly volume = **target + whatever the phase's quality templates happen to add**. Base phases have no quality → weeks ≈ target (10–12 mi, gentle). Build phases have 2–3 quality days → weeks ≈ target + 12–14 mi. The mileage curve the athlete experiences is a **step function of phase quality-density**, and the ramp cap, the cutback rhythm, and the injury-policy ramp adjustments (`maxWeeklyIncreasePctCap` — carefully engineered at `generatePlan.ts:646-676`) all modulate only the sliver of volume that easy days carry.

This is the *same disease class* the Hyrox rebuild fixed in P3 (phase-keyed constants → continuous `progress = w/(totalWeeks-1)` interpolation). The road path was never converted.

**P0.2 made this honest, not safe.** The original product-plan defect 2b ("weekly mileage is a top-down target that only easy/long runs consume — '24.2 mi' peak weeks really carried ~38 mi") was closed by making the *displayed* total the sum of day prescriptions. The display now truthfully reports a cliff that the planning layer still generates. `qa_totals_reconcile` compares the displayed sum against… an estimate of the same prescriptions (`validatePlan.ts:210-219`), so it can never see the target-vs-actual divergence; nothing compares `week.miles` to `week.targetMi`.

---

## 3. The full defect register

### A. Volume & progression
- **A1 — Quality volume unbudgeted** (root cause above). `generatePlan.ts:545-560`, `generatePlan.ts:358` (easy split ignores quality), `weekPlan.ts` (correct-but-unconsumed target).
- **A2 — No week-over-week ramp rule exists anywhere.** Not in generation (the cap only binds the target), not in QA (§F). The "10% rule" — the single most-taught injury-prevention heuristic in running — is absent from the product.
- **A3 — Taper length is distance-blind.** `method.taper.durationWeeks` was authored per-method for marathons (daniels: 3 weeks, "Daniels' classic 3-week *marathon* taper" per its own JSON note) and applies unchanged to a 5K. Compressed runways then allocate *additional* taper weeks (`weekPlan.ts:410-419` extends the pct ladder). Jim: 43% of his 7-week block was taper.
- **A4 — `trainingDaysPerWeek` doesn't scale volume** (2% effect). Volume should scale with available days; instead per-run length balloons for low-frequency athletes.
- **A5 — Start volume can exceed declared fitness by >2×** (higdon at 19.4 off a declared 8). The `start = max(peak × startPct, current)` floor (`weekPlan.ts:396-403`) is correct for the *target*; the pattern's day content ignores it (A1) — and hansons' base pattern is so dense that week 1 lands at 2.9× base.

### B. Age & masters (Jim's headline complaint)
- **B1 — Age is a no-op in the road path.** Proven byte-identical at 30 vs 79. No recovery-cadence adjustment (Hyrox has `MASTERS_RECOVERY` at 58+ → recovery week every 3rd instead of 4th; road has nothing), no ramp-cap tightening, no intensity substitution, no strength modification, no advisory. `grep -rn age src/engines/planGenerator/` hits only max-HR fallback (220−age) and the algorithm doc.
- **B2 — `strengthExperience` is collected and never read.** Its own type comment promises: *"Drives how aggressively we prescribe default strength loads — a brand-new lifter should not see the same numbers as a seasoned one"* (`useOnboarding.ts:66-69`). No code consumes it.

### C. Strength prescription
- **C1 — The emphasis header and the routine are two unconnected systems.** `strengthPhaseEmphasis` (`extraDays.ts:108-118`) returns phase-keyed *prose* — base → "heavy maximal strength (4–6 reps, build toward a 4–5RM)", peak → "explosive power (box jumps, med-ball…)". The routine below it is a **fixed list** (`BASE_STRENGTH_ROUTINE`, `extraDays.ts:60-68`: Goblet Squat 3×12 … Dead Bug 3×10/side) that never changes with phase (taper swaps to a lighter fixed list). So the header tells Jim to build toward a 4–5RM while every exercise prescribes 10–12 reps, and the "power" phase promises box jumps that appear in no list. R8 "periodization" is a label, not a program.
- **C2 — "Build toward a 4–5RM" with zero load guidance, progression, or gating** is the single most dangerous sentence to hand an untrained 79-year-old. There is no %1RM/RPE anywhere, no age or experience regression, no on-ramp. (Personalization today: gym-vs-bodyweight swap + a menopause bone-loading finisher — both good, both insufficient.)
- **C3 — Readiness guidance is not day-type-aware:** "Keep the run but stay strictly in Z1-2. No tempo efforts." (`readiness.ts:1055`) rendered under Jim's *strength* day.

### D. Season splicing
- **D1 — No fitness carry-over between blocks.** Block 2 is a fresh `generatePlanFromMethod` off the original onboarding config (`spliceSeason.ts:415-447`): the athlete's block-1 build, race, and recovery change nothing. Same start, same cliff, twice a season.
- **D2 — Recover/bridge content is athlete-independent** (`blockWeeks.ts:96-125`): fixed reverse-taper minutes (20→35 min) regardless of age, fitness, or race distance; bridge is a fixed 7-slot pattern.
- **D3 — The spliced season is never re-validated.** `validatePlan` runs once, inside `generatePlanFromMethod`, on the anchor block only (`generatePlan.ts:1149`). Splicing happens later in `App.tsx:538`. Season-level pathologies (the +143% recover→build jump, cross-block duplicate shapes) are structurally invisible. When we ran the validator on Jim's spliced season manually it flagged `qa_duplicate_weeks` — nobody in production ever runs it there.

### E. Method fidelity
- **E1 — Method invariants are dead data.** `PLAN_GENERATOR_ALGORITHM.md` Stage 5 claims *"Invariants check — enforce every rule in `generationRules.invariants`"*. No code reads `invariants` (sole grep hit is the JSON itself). Daniels ships 8 of them — including *"I-pace volume must not exceed 8% of weekly mileage"* (Jim's week 4: ~25%) and *"If currentWeeklyMileage < 20, downgrade to 'recreational' routing"* (Jim: 10, not downgraded) — that would each have caught this plan.
- **E2 — Real-program fidelity is off by ~2× for short distances.** Hal Higdon's actual Novice 5K starts ≈9–11 mi/wk; ours opens at 20.2. Hansons is generable for a distance its own JSON marks NOT_SUITED (via stored `selectedMethodId` or the splice fallback).
- **E3 — `DISTANCE_PEAK_MULT` is floor-only** (`weekPlan.ts:210-221`) and `DISTANCE_PEAK_CAP_MI['5k'] = 80` is an elite ceiling — there is no *athlete-appropriate* 5K volume shaping between "floor" and "elite cap".

### F. Plan-QA gate (why nothing was caught)
- **F1 — `qa_load_spike` cannot fire on road plans.** It requires time AND ≥500 ft prior vert to spike *together* (`validatePlan.ts:398-409`); a flat 5K plan never accumulates 500 ft, so the only volume rule in the gate is vert-gated shut. It's also warn-only.
- **F2 — No mileage-ramp rule, no target-reconciliation rule** (§A2, §2).
- **F3 — Error findings don't block and aren't tracked.** By design the gate is observe-only ("ships; findings surface as advisories", `generatePlan.ts:1144-1150`) — defensible only while the rules themselves are trustworthy; today road plans ship carrying both real errors and false-positive errors, which trains everyone to ignore the channel.
- **F4 — There is no road persona sweep.** The Hyrox path has a permanent 40-plan CI gate (`p5-persona-sweep.test.ts`, zero validator errors). The road path — 9 methods × distances × runways, vastly more surface — has nothing equivalent, which is exactly why Jim found this in production.

### G. Structural/typing bugs found along the way
- **G1 — `categoryToType('race_pace') → 'race'`** (`generatePlan.ts:72`): every weekly race-pace *workout* is typed as an actual race day. Consequences: `qa_d1_load` fires errors on the long run before a Sunday pace workout (higdon ×6 — false positives that ship in `advisories`); the plan PDF highlights mid-plan Thursdays as `*** RACE DAY ***`; anything keying off `type === 'race'` (countdown, grading, race-week remap) is poisoned.
- **G2 — pfitzinger emits duplicate days:** Jim's week 4 contains two `Sat 9/12` long-run entries (7 entries, Mon rest, two Saturdays). Scheduling bug in the pattern→calendar mapping.
- **G3 — `PLAN_GENERATOR_ALGORITHM.md` describes a pipeline that doesn't exist** (stages/files like `normalize.ts`). The doc is aspirational fiction presented as architecture — dangerous for anyone (human or agent) using it as ground truth.

### What the road path gets right (credit where due)
`buildWeeklyMileage` itself (start-from-current, ramp cap, cutbacks, taper anchored to achieved volume, distance-aware long-run caps with time/duration adequacy) is genuinely good design — it just needs to be *obeyed*. The injury policy (day caps, ramp caps, easy lead-ins) is real and works. P0–P2 fixes hold: durations reconcile, shakeouts are short, race-week proximity is guarded, prehab/descent caution fire from injury area, totals are honest, benchmark scheduling + zone re-anchoring work. The QA gate exists and its non-volume rules are sound. The problems are concentrated in: **volume budgeting, age/strength personalization, season continuity, and QA coverage of exactly those three.**

---

## 4. Requirements & claims vs. reality

| Claim (source) | Reality |
| --- | --- |
| "Volume — start from startMileagePctOfPeak × peak; **ramp by maxWeeklyIncreasePct**" (PLAN_GENERATOR_ALGORITHM.md:108) | True for the internal target; false for the plan the athlete receives (§2) |
| "**Invariants check — enforce every rule** in generationRules.invariants" (same doc:109) | Not implemented anywhere (§E1) |
| "strengthExperience … **drives how aggressively we prescribe default strength loads**" (useOnboarding.ts:66) | Never read (§B2) |
| "R8 — strength periodization … **heavy → power → drop race week**, matches the iRunFar/CSCS model" (extraDays.ts:102-107) | Only the *label* periodizes; sets/reps/exercises are fixed (§C1) |
| Product plan P0.2: "weekly totals = sum of days" ✔ **and** the implied safety of the ramp | Display fixed; generation still cliffs (§2) |
| Product plan P1: "no plan ships with [QA-caught defects]" | Gate is observe-only, and volume rules can't fire on road (§F) |
| Hyrox parity: continuous progression, masters recovery, persona-sweep gate (P3/P5, shipped) | None of the three exists in the road path (§A1, §B1, §F4) |
| Method JSON promises (daniels: gradual VDOT-based progression; higdon: novice-friendly) | Contradicted by generated output (§E) |

---

## 5. Improvement roadmap — phased development

Sequencing mirrors the Hyrox program (fix correctness → make the gate real → personalize → deepen fidelity → calibrate), sized in the same PR-shaped increments. Each phase lists its acceptance gate.

### R0 — Volume-safety hotfixes (the Jim fixes) — *1 PR, highest urgency*
1. **Budget quality into the week (the root fix).** Give every quality workout an estimated mileage cost (the `estimateWorkoutMiles` function already exists — it's what makes the display honest) and make the week solve to its ramp-capped target: `easyMiTotal = targetMi − longRunMi − Σ qualityMi`, floored at a minimal easy dose; when quality alone exceeds the target for low-volume athletes, *scale the quality workout down* (fewer reps — `scaleWorkoutToTime` generalized to reps) rather than overflowing the week. The step function becomes a ramp because the budget is already a ramp.
2. **Distance-aware taper length:** 5K/10K → 1 week (race week included), HM → 2, marathon+ → method value. Cap the phase allocator's taper padding at the same number.
3. **Fix `categoryToType('race_pace')` → `'quality'`** except on actual race day (G1), and fix the pfitzinger duplicate-day bug (G2).
4. **QA: make volume visible.** New `qa_weekly_ramp` (error at >30% week-over-week for full non-cutback weeks, warn at >20%, cutback-rebound aware); split `qa_load_spike`'s time/vert conjunction (each alone warns; road plans get the time leg); new `qa_target_adherence` (summed vs `targetMi` divergence >25% = error — this is the regression test for fix #1).
5. **Run the validator on spliced seasons** in `spliceSeasonWeeks`' output (attach season-level advisories), not just the anchor.

*Gate:* Jim's exact season, all 9 methods: zero weeks with >20% week-over-week increase; taper ≤ 2 weeks for 5K; zero validator errors.

### R1 — Masters & personalization (the age fixes) — *1 PR*
1. **Age-graded adjustments, tiered like Hyrox's `MASTERS_RECOVERY`:** ≥58 → recovery week every 3rd (parity with Hyrox), ramp cap tightened (e.g. 8%); ≥70 → additionally cap quality at 1/week, substitute VO2 intervals with short hills/strides, long-run cap tightened, and an advisory explaining the changes. Constants land in a tiered evidence registry (`engines/running/heuristics.ts`) like the Hyrox one — masters exercise-science literature actually exists (Tanaka, WMA age-grading, Reaburn & Dascombe) so several constants can enter at T2/T3, better than Hyrox could do.
2. **Strength coherence + personalization:** per-phase *schemes* (sets×reps×load cue) that match the emphasis — base = 3×5 "heavy, leave 2 in reserve" / build = power scheme *with the promised exercises* / taper = current maintenance list; scheme selection modulated by `strengthExperience` (new → machine/goblet variants, RPE≤6, no RM language ever) and age (≥70 → no maximal loading, replace with 2×8 controlled tempo + balance work). Delete "build toward a 4–5RM" for every novice and masters athlete.
3. **`trainingDaysPerWeek` scales volume:** weekly target multiplied by a days factor (e.g. 3d ≈ 0.75× of 5d baseline), so low-frequency athletes get proportionally less total volume, not longer runs.
4. **Day-type-aware readiness guidance** (strength days get strength wording).

*Gate:* age-30 vs age-79 plans measurably differ (recovery cadence, quality density, strength scheme); no RM-based copy for novice/masters; extended controls in the persona sweep (below).

### R2 — QA gate hardening + road persona sweep — *1 PR*
1. **Road persona sweep as permanent CI**, mirroring P5: ~12 personas (ages 25–80, first-timer→elite, 3–7 days, with/without anchors and declared mileage) × 4 distances (5K/10K/HM/M) × representative methods × 2 runways, plus 2 two-race seasons — zero validator errors required. This is the single highest-leverage item in the roadmap: it converts every rule above from "fixed once" to "can never regress", exactly as it did for Hyrox.
2. **Enforce method invariants:** parse the machine-checkable subset of `generationRules.invariants` (long-run %, quality-volume %, hard-day spacing, low-mileage downgrade) into validator rules parameterized per method; delete or implement the algorithm doc's fictional claims (also: rewrite `PLAN_GENERATOR_ALGORITHM.md` to describe reality).
3. **Suitability gate at generation:** generating a NOT_SUITED method×distance emits a critical advisory + auto-substitutes the top recommended method (user-visible, never silent); `safeGenerate`'s fallback picks the best-scored method for the block's distance instead of `RECOMMENDABLE_METHODS[0]`.

*Gate:* sweep green in CI; every daniels invariant listed above holds on generated output.

### R3 — Season continuity — *1 PR*
1. **Fitness carry-over:** block 2's `currentWeeklyMileage` = block 1's achieved pre-taper volume (decayed through recover/bridge, e.g. ×0.85), so the second build starts where the athlete actually is and its cliff-prevention budget is anchored correctly.
2. **Athlete-scaled recover/bridge:** reverse-taper minutes scaled by age + prior-block volume; race-distance-aware rest-day count already exists — extend to intensity resumption timing.
3. **Cross-block QA:** ramp rule runs across block boundaries (recover→build is the observed +143% seam); duplicate-shape detection across blocks.

*Gate:* two-race season sweep shows no >20% seam jumps; block 2 starts within 15% of block 1's post-recovery volume.

### R4 — Method fidelity & evidence calibration — *1–2 PRs, can trail*
1. **Distance-scaled method volume tables:** per-method, per-distance start/peak envelopes benchmarked against the published programs (Higdon Novice 5K ≈ 9–11→15 mi/wk; Daniels 5K plans; Hansons Beginner *marathon*-only reality) — the road analog of the Hyrox six-source benchmark matrix, recorded in a `running-evidence-audit.md` with tiers and citations.
2. **Expert-review packet** for the new running heuristics registry (masters constants, days-factor, taper lengths), reusing the Hyrox packet format and exhibit generator.
3. **Structural 5K/10K specificity:** short-race builds should trend *intensity-forward* (strides→reps→race-pace) with modest volume, not miniaturized marathon blocks — per-distance weekly-pattern variants in the method JSONs, starting with the two or three methods rated BEST for 5K.

*Gate:* generated 5K plans fall inside the benchmarked envelope per method; audit doc + packet published.

**Suggested order:** R0 → R2 → R1 → R3 → R4. R2 before R1 is deliberate: land the sweep first so the personalization work in R1 is born with its regression gate (the lesson from P5, where the sweep found five defect classes the targeted tests had missed).

---

## Appendix — reproduction detail

- Harness: scratch vitest (`generatePlanFromMethod` per method → `planSeason` → `spliceSeasonWeeks` → `validatePlan`), today = 2026-08-17, config: 79M beginner, 6 d/wk, 5K anchor 2026-10-03 + 5K 2026-12-05 (priority A, primary).
- Season blocks produced: `BUILD(r1 08-17→09-25) | TAPER | RACE | RECOVER(3d) | BRIDGE(r2 10-07→10-15) | BUILD(r2 10-16→11-20) | TAPER | RACE`.
- Validator results, spliced season: daniels/fitzgerald warn `qa_totals_reconcile` + `qa_duplicate_weeks`; pfitzinger warn `qa_duplicate_weeks` ×5; higdon **error `qa_d1_load` ×12** (all false positives via G1); koop/trainingpeaks **error `qa_taper_monotonic`** + warns; galloway/roche clean. **No volume finding of any kind on any method.**
- Controls (daniels 16-week single race): weekly miles `10.6, 10.8, 11.1, 8.7, 11.6, 25.4, 25.4, 15.8, 26.2, 26.3, 26.8, 16.4, 27.5, 24.8, 22.1, 5.1`; identical at age 30 and 79; 3 d/wk variant `…, 24.8, …` (−2%); declared-8-mi/wk variant peaks 24.8.
- Strength day (all methods, gym): header emphasis by phase from `strengthPhaseEmphasis`; routine fixed `BASE_STRENGTH_ROUTINE`; observed contradiction identical to Jim's screenshot.
