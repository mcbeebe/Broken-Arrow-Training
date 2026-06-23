# Competitive Analysis — iRunFar Training Methodology vs. Attune.coach Engine

**Version:** 1.3 · **Date:** 2026-06-22 · **Owner:** product/engineering
**Executive HTML companion (polished, for executive reading):** `docs/research/Competitive_Analysis_iRunFar_Training_v1.3.html`
**Fact-check provenance:** every cited figure was re-checked against the source articles (verbatim quotes) and the science citations against PubMed/journals (June 2026). All science is real and correctly attributed (Hyldahl 2017 PMID 27782911 · Tanaka 2001, JACC · Mah 2011, Sleep); v1.3 applied 7 precision corrections — flagged inline with *(fact-check)*-style parentheticals.
**Scope:** Read and synthesize iRunFar.com's training-guidance corpus (`/category/training` + sub-hubs), compare it to the methodology and logic in our plan-generation + coach engine, and produce a ranked list of updates.
**Method:** 6 source sweeps across ~80 iRunFar articles (workouts/periodization, fueling/hydration/environment, durability/strength/form/recovery, mental/pacing/execution, house philosophy + special populations) — **reviewed every one of the ~55 articles linked from the "Ultramarathon Training: A Guide to Everything" pillar hub (all 15 sections), each figure fact-checked against the source; see the §7 coverage checklist**; our side ground-truthed against the codebase (`src/engines/**`, `src/data/methods/*.json`, `api/coach/_core.py`, `docs/research/**`).

---

## 0. The one-paragraph takeaway

iRunFar is not a plan generator — it is the trail/ultra world's deepest **field-tested craft library** (fueling, vert & descent execution, heat/altitude, power-hiking, form, recovery formulas, mind, special populations), written by the same coaching tradition two of our own methods come from (**Koop** and the Roches' **SWAP**). We are the opposite: an **adaptive plan + AI-coach engine** with genuinely strong physiology (VDOT pacing, distance-aware ramp, an honest advisories layer, and a research-cited **Terrain/Descent engine** — Minetti GAP, eccentric load, repeated-bout, vertical efficiency). **Our biggest competitive gap is not capability — it is that (a) the trail-specific physics we have already built is mostly not wired into the plan an athlete actually receives, and (b) we carry none of iRunFar's universally-demanded "craft" layers: fueling, heat, pacing/execution, recovery protocols, and form.** The highest-ROI moves are therefore *wire what we built* + *add fueling*, not *invent new science*.

---

## 1. What iRunFar actually teaches (synthesized, cited)

iRunFar's house consensus, across Ian Torrence, Joe Uhan (PT), David & Megan Roche (SWAP), Jason Koop (CTS), Corrine Malcolm, and editors Bryon Powell / Meghan Hicks:

### 1.1 Training structure & workouts
- **Aerobic "foundation-first," polarized.** Easy stays genuinely easy; hard is concentrated. Uhan's "Aerobic Deficiency Syndrome" warns against gray-zone drift. [steep-and-high, a-foundation-first-approach, intervals]
- **A 4-family workout taxonomy with concrete prescriptions** (Torrence): Endurance (easy <75% HRmax; carb-depleting ≤3 h fasted every 3–4 wks; fast-finish 2–3→8–10 mi; pace-changers), Stamina/LT (steady-state 83–87% HRmax; tempo 15–40 min @ 85–90%; "thirds" progressions), Speed/VO2 (1–6 min reps @ 94–98% HRmax, 10–30 min total), Sprint/Hill (6–8×15–20 s strides; short hill reps 30–90 s @ ~5K; long hill reps 90 s–3 min). [endurance-based, stamina-based, speed-based, sprint-based-hill]
- **Downhill conditioning is first-class and perishable** — short downhill reps (1–2 min on 6–10%), long descents (¼–6 mi) touched regularly through peak; "trashed quadriceps lead to many ultra DNFs." The ~14-day re-stimulus cadence is grounded in the **eccentric repeated-bout effect (Hyldahl 2017, PMID 27782911)**, which our descent engine models — not stated as a fixed interval by iRunFar. [sprint-based-hill, your-ultra-training-bag-of-tricks-downhills]
- **Periodization = base (1–3 mo) → introductory (4–6 wk) → specific (8–12 wk, race-specific, taper last 1–3 wk) → recovery (1–2 mo)**, ≤10–15%/wk increases, 3-up-1-down weeks (down ≈70% of peak). **"Save the spicy work — B2B long runs, mountain climbs, quad-seasoning descents — for late."** [periodization-it-isnt-rocket-science, the-basics-of-creating-a-training-plan, eight-steps]
- **Predictor / dress-rehearsal workout**: 4–6 wk out, run ~30–60% of course distance mimicking terrain/equipment/fuel/pacing, then re-test. [sprint-based-hill]

### 1.2 Ultra/trail-specific volume
- **Time-on-feet over mileage** on trail; long run = 20–30% of week, begins ~90 min; **10- and 14-day microcycles** endorsed. [endurance-based]
- **Back-to-back long runs** spaced ~4–5 wks apart, reserved for longer ultras. [endurance-based, guide-to-everything]
- **Vert managed like speedwork** ("vert-chasing alone → burnout"); three race tiers by vert: Flat <120 ft/mi · Mountainous 120–240 · "Colossal" >240, each with distinct prescriptions. [race-specific-training, steep-and-high]
- **Power-hiking is a trained skill and a winning tactic** (Laney power-hiked 46% of UTMB → 4th): build 20–30 → 90 min on >15–20% grade; "hike the ups" to keep big-vert days aerobic; walk crossover ~3–4 mph flat / >15.8° grade. [an-introduction-to-powerhiking, steep-and-high]

### 1.3 Fueling, hydration, environment (their most science-cited pillar)
- **Carbs: 200–300 cal/hr (150–200 when going hard); multiple-transportable carbs (glucose + fructose) lift the ceiling from ~60 → ~90 g/hr; start ≤45 min; train the gut 4–6 wks out (SGLT1 upregulates in ~3 days).** Protein **1.6–2.2 g/kg/day (up to 2.5 for peak ultra; female/peri upper range); 5–10 g/hr in 3 h+ efforts.** [fuel-up, ultras-or-eating-competitions, protein-for-runners] *(the often-quoted 2:1 glucose:fructose ratio is standard sports-nutrition, not stated in these iRunFar pieces.)*
- **Hydration (signature contrarian stance): "drink to thirst" — the cited articles deliberately prescribe NO fixed hourly volume; sodium supplementation prevents neither hyponatremia nor cramps — overdrinking + ADH is the danger.** [exercise-associated-hyponatremia, waterlogged-part-ii] *(the 400–800 ml/hr figure is Noakes' book, not these iRunFar articles.)*
- **Caffeine 3–6 mg/kg, 60 min pre, re-dose for 2 h+ efforts; habituation/abstinence is a myth.** [caffeine-and-performance]
- **Heat: 7–10 days, 50–100 min/day easy in heat (or a post-run sauna / passive-heat block), start ~2 wk out, maintain every 3rd day; plasma vol +4.5–13%, sweat rate +50–100%.** [handle-the-heat, heat-acclimation]
- **Altitude: full benefit 21–28 days; live-high/train-low; ferritin <35 ng/mL gates response; per-elevation arrival windows; VO2 −8–11%/1,000 m.** Cold/BAT adaptation also covered. [into-thin-air, shivering-science]

### 1.4 Durability — strength, form, injury, recovery (PT-led, Joe Uhan)
- **Strength = heavy & periodized:** maximal-strength block (70%+ 1RM, 5–12 reps, 2×/wk, 6–9 wks) off-season → power/explosive in-season → drop race week; rationale is economy + durability (RE +2–8%, ~66% injury reduction). [pumping-iron, strength-training-for-runners]
- **Form system:** cadence ~180 (faster downhill), **hip-hinge posture**, **"braking vs. center-of-mass," not foot-strike**, seven stride cues, a morning traction-based mobility flow. [keys-to-quick-cadence, hip-hinge, give-it-a-brake, seven-stride-cues, joes-running-mobility-routine]
- **Return-to-run "Stoplight" by 24-h symptom trajectory** (green = repeat; yellow = −10–20% / cross-train; red = stop); **"injury vs. dysfunction — rest doesn't fix a movement problem."** [joes-stoplight-system, when-your-chronic-running-injury-wont-heal]
- **Recovery formulas:** **1 rest day / 10 mi raced (1/10 km if high-vert); +1 h sleep/night /10 mi (≥10 days post-100); reverse-taper rebuild then re-add speed; active recovery (3–5 mi) > full rest.** [recover-better-10-rules, six-strategies, running-post-race-recovery]
- **Sleep = "the missing ingredient"** — **7–9 h/night** baseline; Stanford data: **+1 h/night measurably improves reaction time, mood, accuracy, sprint speed**; extend **gradually** (shift bedtime 30 min every few days), don't cram-bank; track monthly (PSQI/Epworth) and schedule sleep alongside workouts. [sleep-the-missing-ingredient]
- **Overtraining detection (whole 3-part section):** leading indicators = **sleep disturbance** + **declining pace at the same HR** (Maffetone/MAF); treatment = **cut volume 75–100%** + eliminate intensity; prevention = **periodize life stress** + parasympathetic work; distinguish brief **overreaching** (can supercompensate) from true **overtraining** (systemic, needs full rest). [overtraining-syndrome-part-two]
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
| Downhill / eccentric conditioning | Very high (perishable) | Physics built, tracked only | **High** | **Wire existing** |
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

1. **Built-but-dormant IP — twice over.** (a) Our most differentiated, research-cited trail work (terrain GAP, eccentric/descent, vertical efficiency, repeated-bout, DOMS forecast) is largely invisible in the plan the athlete trains by — we *track* descent capacity but never *prescribe* a downhill workout; we model cost-of-gradient but the ramp is still flat mileage. (b) Our **readiness/TRIMP engine already ingests sleep, HRV, resting HR & Body Battery** (`src/utils/readiness.ts`) yet only displays scores — it never **prescribes sleep, flags overtraining, or auto-adjusts the plan**, exactly the Recovery / Sleep / Overtraining triad iRunFar devotes three sections to.
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
- *Do:* race-duration/intensity → **carb g/hr** target (ramp ~60→90 g/hr via multiple-transportable carbs, start ≤45 min, 200–300 cal/hr); a **4–6-week gut-training** progression + a tagged **long-run fueling rehearsal**; **protein** targets (1.6–2.2, up to 2.5 g/kg; female/peri upper); **hydration** "drink to thirst" + hyponatremia caution; **caffeine** 3–6 mg/kg, re-dose for 2 h+ efforts. Surface in plan + coach.
- *Why:* iRunFar's deepest pillar; the #1 athlete question; we have zero. *Effort: Medium.*
- *Witchel:* market = every endurance athlete · visceral = "I bonked / my gut shut down" · language = "bonk," "carbs per hour," "drink to thirst," "gut training."

**R3. Heat-acclimation protocol module.**
- *Do:* when the goal race is hot (or flagged), insert a **7–10 day** protocol (50–100 min/day easy in heat, or a post-run **sauna / passive-heat block**) starting **~2 weeks out**, maintain **every 3rd day**, with decay rules; advisory + coach narration + calendar blocks. Pairs with our taper/advisory machinery.
- *Why:* highest-stakes single protocol, seasonal, currently absent. *Effort: Low–Medium.*
- *Witchel:* market = every hot goal race · visceral = "I cooked and DNF'd in the heat" · language = "heat training," "sauna protocol," "acclimatize."

### TIER 2 — high value (craft layers; content/coach + light engine)

**R4. Structured trail-workout taxonomy** — replace generic "quality" with iRunFar-style sessions keyed to phase + vert tier (Flat/Mountainous/Colossal): short/long hill reps, downhill reps, gear-changing, strides, and a **4–6-week-out dress-rehearsal "predictor"** workout. *Effort: Medium* (overlaps R1 on hills/descents).

**R5. Recovery, sleep & overtraining protection** — post-race **rest-day (1/10 mi; 1/10 km high-vert)** and **sleep (+1 h/10 mi; 7–9 h baseline, gradual extension)** formulas, **reverse-taper** rebuild, **Stoplight** 24-h symptom-trajectory return-to-run, **and wire the existing readiness/TRIMP engine** into overtraining flags + light plan auto-adjustment (our *second* dormant asset). Extends our injury lead-in into the post-race, sleep, and comeback windows. *Effort: Low–Medium (part wiring existing).*

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

## 7. Guide-to-Everything coverage checklist (all ~55 linked articles) — v1.3

Direct confirmation that **every** article linked from iRunFar's "Ultramarathon Training: A Guide to Everything" is reflected, with the net-new specifics the full-link sweep surfaced. A few are *thematic* (a principle already captured, no distinct trainable protocol).

- **1 · Overviews & Principles** — training-for-your-first-ultra (§1 canon) · a-newbies-guide (4–6 h/wk; B2B every 2–3 wknds, day-2 at 50–75%) · stress-and-running (*thematic*) · balance-and-running (*thematic*) · ultrarunning-training-for-busy-people (specificity > volume, minimum effective dose) · pursuing-the-patient-path (6-mo season; recovery wks; **don't combine speedwork + long-run building**; ramp ≤5–10 mi/wk) · patience-and-the-ultramarathoner (§1 / R10).
- **2 · Goals & Motivation** — the-two-questions (*thematic*, individualization) · try-something-new (*thematic*).
- **3 · Types of Runs** — essential-elements-of-successful-ultra-training (§1, the four workout families).
- **4 · Volume & Intensity** — ultramarathon-training-volume (**base ~50 mi / 8 h-wk → ceiling 60–70 mi / 8–10 h**; long run by distance — 50K 3–4 h · 50M/100K 4–5 h · 100M 5–6 h · 200+ 5–10+ h; **B2B = cut 25–50% off day-1**; recovery wk −50%) · two-a-days (**75+ mi/wk or plateaued; 20–60 min easy; 1–2 → 3–4/wk**) · worth-the-effort (RPE; fartlek 12×1 or 6×2 min hard, equal easy) · an-inconvenient-truth + listen-to-your-heart (**MAF 180−age / 200−age AnT / 210−age VO2**; 2–3 mo to set zones) · process-to-outcome 1 (process > outcome) & 2 (*thematic*).
- **5 · Long Runs & Endurance** — endurance-based-workouts (§1) · using-races-to-prepare (**tune-up timing — 100M: a 50K/50-mile ~11–14 wk out, a 50-mile/100K ~5–7 wk; distance-matching ladder**) · group-workouts (**head-start, adventure-run, surprise-surge fartlek, bagel-run formats**).
- **6 · Speedwork** — stamina-based · taking-progression-workouts-to-trails (**out-and-back benchmark**; thirds / fast-finish / long-gradual subtypes) · speed-based · sprint-hill-predictor · gear-changing — all §1 canon.
- **7 · Recovery** — sleep-the-missing-ingredient (7–9 h; +1 h → gains; gradual extension) · sleep-and-running-performance (**circadian low 02:00–06:00, peak 17:00–20:00; bedroom 64–74°F; no screens 60 min; jet-lag ~24 h/tz; altitude 5,000 m disrupts ~4 wk**) · recovery-bag-of-tricks (**refuel 30–45 min: 0.8–1 g carb + 0.2–0.4 g protein/kg**) · DOMS (**onset 12–24 h, peak 24–72 h**) · rest-and-recovery (**HRV tracking** — validates our readiness asset) · post-ultra-downtime (by experience) · recover-better-10-rules (1 rest/10 mi; +1 h sleep/10 mi) · returning-to-normal (**wk-by-wk: days 1–7 walk → wk 2–3 ≤1 h jogs ~2 of 3 days → wk 3+ rebuild**) · on-taking-a-break (annual 1 mo+; 2 wk full + 2 mo low-volume). → **R5**.
- **8 · Specificity** — race-specific-training (vert tiers Flat<120 / Mountainous 120–240 / Colossal >240 ft/mi) · using-what-youve-got (*thematic*) · avoiding-quadraphenia (**downhill-after-uphill repeats; aid-station transition runs; form-check every 15 min**) · dont-let-downhills (eccentric / quad-seasoning) · protect-and-preserve-quadriceps (chest-over-knee alignment) · altitude-training-and-racing (**6,000 ft AMS ~6 h; 7,000 ft +20–30 s/mi; pre-altitude VO2 work 2–3 wk before**) · surviving-first-hundred-1 (**time-on-feet 20+ h; course-specific 50M training day; injury-free ≥4 wk before**) · multi-stage-1 (**24-wk cycle; Fri/Sat/Sun cluster runs spaced 2–3 wk**). → **R1 / R13 / §1**.
- **9 · Peaking & Tapering** — difficult-art-of-peaking (**2-wk window; last long run 90 min easy 1 wk out; peak-week session cuts 10–20 → 20–30 min; confidence workout 10 d–2 wk out**). → §1.
- **10 · Mental** — head-games (**Necessary / Possible / Impossible** framework) · learning-to-embrace-the-pain (**M-fit attention training**) · ultrarunning-skills-1–5 (*thematic* + forgiveness protocol, conservative early positioning) · overcoming-anxiety (**running streak; gamification; lower-barrier-entry**). → **R10**.
- **11 · Cross-Training & Lifting** — strength-training-for-runners (heavy periodized) · building-a-trail-worthy-body 1 (**core 5-min circuit ×3/wk**) & 2 (**plyometric / multi-planar / balance blocks**) · "stay-the-course" / Uhan (form, durability). → **R8 / R9**.
- **12 · Injuries** — running-injuries-explained-and-overcome (**Uhan's Three Laws; Economics model**) · injury-recognition-treatment-and-recovery (**adaptive-vs-restrictive damage; return-to-run walk 45 min → 1 mi → +1 mi/day → hills → speed → pavement → race; cadence ~180**). → **R5 / §6**.
- **13 · Overtraining** — parts 1 (**elevated morning/resting HR; 25% fiber damage / 10–12 wk repair; emotional/physical symptoms; non-functional overreaching**), 2 (cut 75–100%; periodize life stress), 3 (**Torrence Green/Yellow/Red tracking; 1–3 hard races/yr cap**). → **R5**.
- **14 · Offseason** — turning-on-to-the-off-season (**1–2 mo; "rest until hungry" +4–7 d; optional 4-month weakness-focused phase**). → §1.
- **15 · Continuing Education** — become-a-student-of-the-sport (*thematic*).

*Also folded in (not Guide-linked, but completing the picture): the Fueling/Hydration, Heat/Altitude, Form (Uhan), Pacing (Rule of Thirds), and Masters / Women's-cycle sub-hubs → §1, R2/R3/R6/R9/R11/R12.*

## Appendix — primary sources (all iRunFar.com)
Workouts/periodization: endurance-based · stamina-based · speed-based · sprint-based-hill-and-predictor · gear-changing · periodization-it-isnt-rocket-science · the-basics-of-creating-a-training-plan · race-specific-training · on-peaking-for-an-ultramarathon · eight-steps-for-your-best-trail-running-off-season · ultramarathon-training-a-guide-to-everything · your-ultra-training-bag-of-tricks-downhills.
Fuel/environment: fuel-up · ultras-or-eating-competitions · eat-on-the-run · protein-for-runners · caffeine-and-performance · exercise-associated-hyponatremia · waterlogged-part-ii · handle-the-heat · heat-acclimation · into-thin-air · shivering-science.
Durability: pumping-iron · strength-training-for-runners · joes-stoplight-system · when-your-chronic-running-injury-wont-heal · hip-hinge · keys-to-quick-cadence · seven-stride-cues · give-it-a-brake · joes-running-mobility-routine · cross-training-sabotage · recover-better-10-rules · six-strategies-for-mid-season-recovery · running-post-race-recovery · sprained-ankle-rehab-balance-boards · early-range-hip-flexor-strength · where-the-rubber-meets-the-road · an-open-letter-to-masters-runners.
Pillar hub + recovery/overtraining (v1.1): ultramarathon-training-a-guide-to-everything · sleep-the-missing-ingredient · sleep-and-running-performance · overtraining-syndrome (parts 1–3) · post-ultra-downtime-how-much-is-enough · returning-to-normal · rest-and-recovery · turning-on-to-the-off-season.
Mind/pacing/execution: the-rule-of-thirds · rethinking-the-aid-station · an-introduction-to-powerhiking · mantras-for-your-mental-game · imagery-for-performance-enhancement · surviving-your-first-hundred-part-2 · process-to-outcome-part-1 · emergent-methods-for-determining-ultramarathon-race-day-pacing · psychological-factors-in-multi-day-ultramarathons · patience-and-the-ultramarathoner.
Philosophy/populations: steep-and-high · a-foundation-first-approach · intervals · the-masters-athlete · what-we-know-about-menstruation · women-rule · dr-stacy-sims-profile · equations-for-running-a-conversation-with-david-roche.

*Our side ground-truthed against:* `src/engines/planGenerator/**`, `src/engines/terrain/**`, `src/engines/descent/**`, `src/engines/{altitude,readiness,mim,cycling}/**`, `src/data/methods/*.json`, `src/types/index.ts`, `api/coach/_core.py`, `docs/research/{Hill_Running_Load_*,Menopause_Training_Evidence_*,General_Fitness_*}`.
