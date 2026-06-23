# Competitive Analysis — iRunFar Training Methodology vs. Attune.coach Engine

**Version:** 1.0 · **Date:** 2026-06-22 · **Owner:** product/engineering
**Scope:** Read and synthesize iRunFar.com's training-guidance corpus (`/category/training` + sub-hubs), compare it to the methodology and logic in our plan-generation + coach engine, and produce a ranked list of updates.
**Method:** 5 parallel source sweeps across ~70 iRunFar articles (workouts/periodization, fueling/hydration/environment, durability/strength/form/recovery, mental/pacing/execution, house philosophy + special populations); our side ground-truthed against the codebase (`src/engines/**`, `src/data/methods/*.json`, `api/coach/_core.py`, `docs/research/**`).

---

## 0. The one-paragraph takeaway

iRunFar is not a plan generator — it is the trail/ultra world's deepest **field-tested craft library** (fueling, vert & descent execution, heat/altitude, power-hiking, form, recovery formulas, mind, special populations), written by the same coaching tradition two of our own methods come from (**Koop** and the Roches' **SWAP**). We are the opposite: an **adaptive plan + AI-coach engine** with genuinely strong physiology (VDOT pacing, distance-aware ramp, an honest advisories layer, and a research-cited **Terrain/Descent engine** — Minetti GAP, eccentric load, repeated-bout, vertical efficiency). **Our biggest competitive gap is not capability — it is that (a) the trail-specific physics we have already built is mostly not wired into the plan an athlete actually receives, and (b) we carry none of iRunFar's universally-demanded "craft" layers: fueling, heat, pacing/execution, recovery protocols, and form.** The highest-ROI moves are therefore *wire what we built* + *add fueling*, not *invent new science*.

---

## 1. What iRunFar actually teaches (synthesized, cited)

iRunFar's house consensus, across Ian Torrence, Joe Uhan (PT), David & Megan Roche (SWAP), Jason Koop (CTS), Corrine Malcolm, and editors Bryon Powell / Meghan Hicks:

### 1.1 Training structure & workouts
- **Aerobic "foundation-first," polarized.** Easy stays genuinely easy; hard is concentrated. Uhan's "Aerobic Deficiency Syndrome" warns against gray-zone drift. [steep-and-high, a-foundation-first-approach, intervals]
- **A 4-family workout taxonomy with concrete prescriptions** (Torrence): Endurance (easy <75% HRmax; carb-depleting ≤3 h fasted every 3–4 wks; fast-finish 2–3→8–10 mi; pace-changers), Stamina/LT (steady-state 83–87% HRmax; tempo 15–40 min @ 85–90%; "thirds" progressions), Speed/VO2 (1–6 min reps @ 94–98% HRmax, 10–30 min total), Sprint/Hill (6–8×15–20 s strides; short hill reps 30–90 s @ ~5K; long hill reps 90 s–3 min). [endurance-based, stamina-based, speed-based, sprint-based-hill]
- **Downhill conditioning is first-class and perishable** — short downhill reps (1–2 min on 6–10%), long descents (¼–6 mi) "at least every 10–14 days at peak"; muscle memory "fades after ~2–3 weeks"; "dead quads" cited as the #1 Western States DNF cause. [sprint-based-hill, your-ultra-training-bag-of-tricks-downhills]
- **Periodization = base (1–3 mo) → introductory (4–6 wk) → specific (8–12 wk, race-specific, taper last 1–3 wk) → recovery (1–2 mo)**, ≤10–15%/wk increases, 3-up-1-down weeks (down ≈70% of peak). **"Save the spicy work — B2B long runs, mountain climbs, quad-seasoning descents — for late."** [periodization-it-isnt-rocket-science, the-basics-of-creating-a-training-plan, eight-steps]
- **Predictor / dress-rehearsal workout**: 4–6 wk out, run ~30–60% of course distance mimicking terrain/equipment/fuel/pacing, then re-test. [sprint-based-hill]

### 1.2 Ultra/trail-specific volume
- **Time-on-feet over mileage** on trail; long run = 20–30% of week, begins ~90 min; **10- and 14-day microcycles** endorsed. [endurance-based]
- **Back-to-back long runs** spaced ~4–5 wks apart, reserved for longer ultras. [endurance-based, guide-to-everything]
- **Vert managed like speedwork** ("vert-chasing alone → burnout"); three race tiers by vert: Flat <120 ft/mi · Mountainous 120–240 · "Colossal" >240, each with distinct prescriptions. [race-specific-training, steep-and-high]
- **Power-hiking is a trained skill and a winning tactic** (Laney power-hiked 46% of UTMB → 4th): build 20–30 → 90 min on >15–20% grade; "hike the ups" to keep big-vert days aerobic; walk crossover ~3–4 mph flat / >15.8° grade. [an-introduction-to-powerhiking, steep-and-high]

### 1.3 Fueling, hydration, environment (their most science-cited pillar)
- **Carbs: 150–300 cal/hr; multiple-transportable carbs (glucose:fructose ~2:1) lift the ceiling from ~60 → 75–90 g/hr; start ≤45 min; train the gut 4–6 wks out (SGLT1 upregulates in ~3 days).** Protein **1.6–2.2 g/kg/day (up to 2.5 for peak ultra; female/peri upper range); 5–10 g/hr in 3 h+ efforts.** [fuel-up, ultras-or-eating-competitions, protein-for-runners]
- **Hydration (signature contrarian stance): "drink to thirst," 400–800 ml/hr; sodium supplementation prevents neither hyponatremia nor cramps — overdrinking + ADH is the danger.** [exercise-associated-hyponatremia, waterlogged-part-ii]
- **Caffeine 3–6 mg/kg, 60 min pre, re-dose for 2 h+ efforts; habituation/abstinence is a myth.** [caffeine-and-performance]
- **Heat: 7–10 days, 50–100 min/day easy in heat (or post-run sauna 20–30 min), start ~2 wk out, maintain every 3rd day; plasma vol +4.5–13%, sweat rate +50–100%.** [handle-the-heat, heat-acclimation]
- **Altitude: full benefit 21–28 days; live-high/train-low; ferritin <35 ng/mL gates response; per-elevation arrival windows; VO2 −8–11%/1,000 m.** Cold/BAT adaptation also covered. [into-thin-air, shivering-science]

### 1.4 Durability — strength, form, injury, recovery (PT-led, Joe Uhan)
- **Strength = heavy & periodized:** maximal-strength block (70%+ 1RM, 5–12 reps, 2×/wk, 6–9 wks) off-season → power/explosive in-season → drop race week; rationale is economy + durability (RE +2–8%, ~66% injury reduction). [pumping-iron, strength-training-for-runners]
- **Form system:** cadence ~180 (faster downhill), **hip-hinge posture**, **"braking vs. center-of-mass," not foot-strike**, seven stride cues, a morning traction-based mobility flow. [keys-to-quick-cadence, hip-hinge, give-it-a-brake, seven-stride-cues, joes-running-mobility-routine]
- **Return-to-run "Stoplight" by 24-h symptom trajectory** (green = repeat; yellow = −10–20% / cross-train; red = stop); **"injury vs. dysfunction — rest doesn't fix a movement problem."** [joes-stoplight-system, when-your-chronic-running-injury-wont-heal]
- **Recovery formulas:** **1 rest day / 10 mi raced (1/10 km if high-vert); +1 h sleep/night /10 mi (≥10 days post-100); reverse-taper rebuild then re-add speed; active recovery (3–5 mi) > full rest.** [recover-better-10-rules, six-strategies, running-post-race-recovery]
- **Cross-training is training stress, and a hidden injury trap** (Uhan): in acute phases do *less* aerobic cross-training, rotate modalities, shift to mobility/strength. [cross-training-sabotage]

### 1.5 Mind, pacing, race execution
- **Effort over pace, always** (HR/RPE/breath govern, not GPS). [the-rule-of-thirds, an-introduction-to-powerhiking]
- **Rule of Thirds**: Restrain (HR cap first third) → Maintain (catch problems, +≤5 bpm) → Attain (accelerate into the finish). [the-rule-of-thirds]
- **Mantras** (≤8 words, positive/present), **aid-station segmenting**, **multisensory imagery + breath cue**, **process > outcome goals** — all **rehearsed in training**, not improvised. [mantras-for-your-mental-game, imagery-for-performance-enhancement, process-to-outcome-part-1]
- **Aid-station execution pre-planned** (per-segment fuel on a notecard, vest swaps, "never trust your race-day brain"); pacer = "second brain"; never quit alone. [rethinking-the-aid-station, surviving-your-first-hundred-part-2]

### 1.6 Special populations
- **Masters:** LT stays trainable (keep intensity), fight sarcopenia with **strength**, recover more (often **1 hard day/wk**), protein ≥20 g post / ~1 g/lb/day 40+. [the-masters-athlete, an-open-letter-to-masters-runners]
- **Women's cycle / RED-S:** follicular favors strength, luteal reduces recovery/heat tolerance; **amenorrhea ≥3 mo = screen RED-S**; evidence-humble, track-your-own. Peri/menopausal women 45+ are the **fastest-growing ultra cohort.** [what-we-know-about-menstruation, women-rule, dr-stacy-sims-profile]

---

## 2. What our engine actually delivers (ground-truthed)

| Capability | Status in our product |
|---|---|
| Method-based running plans (9 methods incl. **Koop**, **SWAP**, Daniels, Pfitz, Hansons, Hudson-ish, Galloway, 80/20, Higdon) | ✅ Shipped — `generatePlanFromMethod` |
| VDOT pace zones, distance-aware mileage ramp, taper, goal-pace blend (+8% cap) | ✅ Shipped |
| **Honesty advisories** (feasibility, runway, goal-vs-fitness, experience-mismatch, cross-distance) + AI-coach narration | ✅ Shipped — genuine differentiator |
| Injury policy (day cap, gentler start, ramp cap, easy lead-in) | ✅ Shipped |
| Menopause/bone overlay; Tanaka maxHR; HR zones | ✅ Shipped |
| Hyrox + General-Fitness (4-pillar) engines | ✅ Shipped |
| Back-to-back long runs | ✅ In 4 methods (daniels, higdon, koop, trainingpeaks JSON) |
| Long-run **time cap** (partial time-on-feet awareness) | ✅ `LONG_TIME_CAP_MIN` |
| **Readiness + TRIMP** analytics; **descent-capacity** Dashboard metric | ✅ Surfaced on Dashboard |
| **Terrain engine** — Minetti cost-of-gradient GAP, hiking locomotion, **Vertical Efficiency** | ⚠️ **Built, research-cited, NOT wired into plan prescription** (`src/engines/terrain/**`; no plan workout emits a vert target) |
| **Descent engine** — eccentric TRIMP, **repeated-bout** (Hyldahl 2017), DOMS forecast, descent capacity | ⚠️ **Built**; only the *capacity metric* is surfaced — it does **not drive downhill prescription** (`src/engines/descent/**`, PR-07→11) |
| Altitude engine | ❌ Empty stub (`src/engines/altitude/index.ts` = `export {}`) |
| **Fueling / hydration / caffeine** prescription | ❌ None |
| **Heat acclimation** protocol | ❌ None |
| **Structured trail-workout taxonomy** (hill/downhill reps, predictor, gear-changing) | ❌ Generic quality only |
| **Pacing / race-execution** plan (effort caps, aid-station, power-hike thresholds) | ❌ None |
| **Power-hiking** prescription | ❌ None (hiking *physics* exists, no sessions) |
| **Strength periodization** for runners (heavy → power → taper) | ❌ Only menopause bone finisher + GF strength pillar |
| **Form / cadence** coaching | ❌ None |
| **Recovery protocols** (post-race rest/sleep formulas, reverse taper, return-to-run trajectory) | ❌ Only cutback/taper/injury lead-in |
| **Mental-training** curriculum (mantras, segmenting, imagery, process goals) | ❌ Ad-hoc coach narration only |
| **Women's menstrual-cycle** awareness | ❌ Menopause only, not cycle phases |
| **Masters-specific** load logic (1 hard day/wk, recovery, protein) | ❌ Only Tanaka maxHR |

---

## 3. Competitive comparison & gap severity

| Dimension | iRunFar depth | Our coverage | Gap | Leverage |
|---|---|---|---|---|
| Vert specificity & periodization | Very high | Physics built, **not prescribed** | **High** | **Wire existing** |
| Downhill / eccentric conditioning | Very high (perishable, #1 DNF) | Physics built, tracked only | **High** | **Wire existing** |
| Fueling / hydration / caffeine | Very high (signature) | None | **Critical** | Build new (rules) |
| Heat acclimation | High (best single protocol) | None | **High** | Build new (small) |
| Structured trail workouts | High | Generic | Medium-High | Build content |
| Pacing & race execution | High (Rule of Thirds, aid stations) | None | **High** | Build content/coach |
| Power-hiking | High | None (physics exists) | Medium-High | Wire + content |
| Strength periodization | High | Partial | Medium | Build content |
| Form / cadence | High (Uhan) | None | Medium | Coach knowledge |
| Recovery / return-to-run | High (formulas, stoplight) | Partial | Medium-High | Build content |
| Mental training | High | Ad-hoc | Medium | Build content/coach |
| Masters / women's cycle | High, evidence-humble | Menopause only | Medium | Build content |
| Altitude / cold | High | Stub / none | Low-Medium | Build new |
| **Adaptive plan generation** | **None (editorial)** | **✅ Strong** | *(our moat)* | Protect |
| **Honesty / feasibility advisories** | None | **✅ Strong** | *(our moat)* | Protect |
| **Pace/VDOT precision & method pluralism** | Philosophy only | **✅ Strong** | *(our moat)* | Protect |

---

## 4. Gaps & weaknesses (honest)

1. **Built-but-dormant trail IP.** Our most differentiated, research-cited work (terrain GAP, eccentric/descent, vertical efficiency, repeated-bout, DOMS forecast) is largely invisible in the plan the athlete trains by. We *track* descent capacity but never *prescribe* a downhill workout; we model cost-of-gradient but the ramp is still flat mileage.
2. **No fuel/hydration layer at all** — the single most-asked endurance question, and iRunFar's deepest content, is absent from our plans and coach.
3. **No environmental prep** — heat (high-stakes, seasonal) is missing; altitude is a stub.
4. **The "execution" half of the sport is missing** — pacing discipline, aid-station/fuel-per-segment planning, power-hiking, and the mental curriculum that iRunFar argues *is the differentiator* in ultras.
5. **Durability is thin** — no periodized runner strength, no form/cadence layer, no post-race recovery formulas or symptom-trajectory return-to-run (we de-load and lead-in, but stop there).
6. **Special-population depth** — strong on menopause, but no menstrual-cycle awareness and no masters-specific load logic, despite peri/menopausal women 45+ being the fastest-growing ultra cohort.
7. **Metric framing** — iRunFar leads with effort/time-on-feet for trail; we lead with pace/mileage. We have the pieces (time cap, GAP) but not the trail-first framing.

---

## 5. Ranked updates to our training approach

Ranked by **impact × leverage**, with the CLAUDE.md **Witchel 3-rule check** (massive market · visceral solve · customer language) applied. "Wire existing" items are ranked up because the science is already built and tested.

### TIER 1 — do first (highest impact, strongest leverage)

**R1. Wire the Terrain + Descent engine into plan *prescription* (vert periodization + downhill/eccentric conditioning).**
- *Do:* generate weekly **vert targets** and scheduled **downhill-repeat / mountain-climb** sessions from the race elevation profile, driven by the descent engine's **repeated-bout / DOMS forecast** (re-stimulate every 10–14 days; "spicy work late"). Turn `descentCapacity` from a passive metric into a programmed progression.
- *Why:* highest leverage in the audit — best-in-class IP already built (`src/engines/terrain/**`, `src/engines/descent/**`), and vert/descent is the defining trail/ultra lever. *Effort: Medium (wiring).* 
- *Witchel:* market = trail/ultra is our core · visceral = "my plan never trained climbing or descending and my quads blew up" · language = "vert," "climbing legs," "blown quads," "downhill reps."

**R2. Add a Fueling & Hydration engine.**
- *Do:* race-duration/intensity → **carb g/hr** target (ramp 60→90 g/hr, 2:1 glucose:fructose, start ≤45 min, 150–300 cal/hr); a **4–6-week gut-training** progression + a tagged **long-run fueling rehearsal**; **protein** targets (1.6–2.2, up to 2.5 g/kg; female/peri upper); **hydration** "drink to thirst" 400–800 ml/hr + hyponatremia caution; **caffeine** 3–6 mg/kg, re-dose 2 h+. Surface in plan + coach.
- *Why:* iRunFar's deepest pillar; the #1 athlete question; we have zero. *Effort: Medium.*
- *Witchel:* market = every endurance athlete · visceral = "I bonked / my gut shut down" · language = "bonk," "carbs per hour," "drink to thirst," "gut training."

**R3. Heat-acclimation protocol module.**
- *Do:* when the goal race is hot (or flagged), insert a **7–10 day** protocol (50–100 min/day easy in heat, or post-run **sauna 20–30 min**) starting **~2 weeks out**, maintain **every 3rd day**, with decay rules; advisory + coach narration + calendar blocks. Pairs with our taper/advisory machinery.
- *Why:* highest-stakes single protocol, seasonal, currently absent. *Effort: Low–Medium.*
- *Witchel:* market = every hot goal race · visceral = "I cooked and DNF'd in the heat" · language = "heat training," "sauna protocol," "acclimatize."

### TIER 2 — high value (craft layers; content/coach + light engine)

**R4. Structured trail-workout taxonomy** — replace generic "quality" with iRunFar-style sessions keyed to phase + vert tier (Flat/Mountainous/Colossal): short/long hill reps, downhill reps, gear-changing, strides, and a **4–6-week-out dress-rehearsal "predictor"** workout. *Effort: Medium* (overlaps R1 on hills/descents).

**R5. Recovery & return-to-run protocols** — post-race **rest-day (1/10 mi; 1/10 km high-vert)** and **sleep (+1 h/10 mi)** formulas, **reverse-taper** rebuild, and a **Stoplight** 24-h symptom-trajectory return-to-run. Extends our injury lead-in into the post-race and comeback windows. *Effort: Low–Medium.*

**R6. Pacing & race-execution plan** — an effort-based **Rule-of-Thirds** pacing card (HR/RPE cap first third → even → finish), **power-hike grade thresholds** (>15–20%), and an **aid-station / fuel-per-segment** plan generated from the course. *Effort: Medium.*

**R7. Power-hiking as a prescribed skill** — schedule power-hike sessions (20–30 → 90 min, >15–20% grade) and **hike-up/run-down** to keep big-vert days aerobic; uses the hiking-locomotion engine already built. *Effort: Low once R1 lands.*

**R8. Runner strength periodization** — off-season **heavy maximal block** (70%+ 1RM, 2×/wk, 6–9 wks) → in-season power → drop race week, with masters/menopause variants we partly have. *Effort: Medium.*

**R9. Form & cadence coaching layer** — cadence target (~170–180, + on descents), hip-hinge / braking-vs-COM / seven-stride-cues knowledge in the coach, optional cadence target on workouts, a morning mobility flow. *Effort: Low (coach content).*

### TIER 3 — differentiation & special populations

**R10. Mental-training curriculum** — mantras (≤8 words), aid-station segmenting, multisensory imagery + breath cue, **process > outcome** goals, rehearsed in training and narrated by the coach. *Effort: Low–Medium.*

**R11. Women's menstrual-cycle awareness** (distinct from menopause) — follicular/luteal training-fuel-recovery nuance, **RED-S screen** (amenorrhea ≥3 mo), evidence-humble + self-tracking framing; reuse our menopause-research house style. *Effort: Medium (sensitive).*

**R12. Masters load logic** — beyond Tanaka maxHR: optional **1 hard session/week**, longer recovery, protein emphasis, strength priority 40+. *Effort: Low–Medium.*

**R13. Build out the altitude module** (from stub) — per-elevation arrival windows, ferritin caution, live-high/train-low, VO2 penalty; advisory + coach. *Effort: Medium.*

**R14. Trail-first framing** — offer **time-on-feet** as the primary long-run/volume metric (we already have a time cap + GAP) and make periodization **intent visible** ("specificity timed late," off-season base). *Effort: Low–Medium.*

---

## 6. What to protect (our moat vs. iRunFar)

iRunFar **cannot generate or adapt a plan, can't personalize to your data, contradicts itself across authors, and has no feasibility/honesty layer.** Keep leaning into: **adaptive multi-method generation**, the **honesty advisories** (feasibility/runway/goal/experience), **VDOT pace precision**, **readiness/TRIMP + (once wired) terrain/descent analytics**, and **multi-modal** coverage (Hyrox/GF). The strategy is to **absorb iRunFar's craft into our engine as rules, content, and coach knowledge** — pairing their field wisdom with our automation and our physics.

---

## Appendix — primary sources (all iRunFar.com)
Workouts/periodization: endurance-based · stamina-based · speed-based · sprint-based-hill-and-predictor · gear-changing · periodization-it-isnt-rocket-science · the-basics-of-creating-a-training-plan · race-specific-training · on-peaking-for-an-ultramarathon · eight-steps-for-your-best-trail-running-off-season · ultramarathon-training-a-guide-to-everything · your-ultra-training-bag-of-tricks-downhills.
Fuel/environment: fuel-up · ultras-or-eating-competitions · eat-on-the-run · protein-for-runners · caffeine-and-performance · exercise-associated-hyponatremia · waterlogged-part-ii · handle-the-heat · heat-acclimation · into-thin-air · shivering-science.
Durability: pumping-iron · strength-training-for-runners · joes-stoplight-system · when-your-chronic-running-injury-wont-heal · hip-hinge · keys-to-quick-cadence · seven-stride-cues · give-it-a-brake · joes-running-mobility-routine · cross-training-sabotage · recover-better-10-rules · six-strategies-for-mid-season-recovery · running-post-race-recovery · sprained-ankle-rehab-balance-boards · early-range-hip-flexor-strength · where-the-rubber-meets-the-road · an-open-letter-to-masters-runners.
Mind/pacing/execution: the-rule-of-thirds · rethinking-the-aid-station · an-introduction-to-powerhiking · mantras-for-your-mental-game · imagery-for-performance-enhancement · surviving-your-first-hundred-part-2 · process-to-outcome-part-1 · emergent-methods-for-determining-ultramarathon-race-day-pacing · psychological-factors-in-multi-day-ultramarathons · patience-and-the-ultramarathoner.
Philosophy/populations: steep-and-high · a-foundation-first-approach · intervals · the-masters-athlete · what-we-know-about-menstruation · women-rule · dr-stacy-sims-profile · equations-for-running-a-conversation-with-david-roche.

*Our side ground-truthed against:* `src/engines/planGenerator/**`, `src/engines/terrain/**`, `src/engines/descent/**`, `src/engines/{altitude,readiness,mim,cycling}/**`, `src/data/methods/*.json`, `src/types/index.ts`, `api/coach/_core.py`, `docs/research/{Hill_Running_Load_*,Menopause_Training_Evidence_*,General_Fitness_*}`.
