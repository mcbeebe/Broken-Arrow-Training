# Competitive Analysis — Coaching Apps vs. Attune.coach

**Version:** 1.0 · **Date:** 2026-07-06 · **Owner:** product/engineering
**Executive HTML companion (polished, for executive reading):** `docs/research/Competitive_Analysis_Coaching_Apps_v1.0.html`
**Scope:** Market gap analysis of Attune.coach against the leading endurance-coaching apps — with and without AI — plus two cross-cutting lenses requested by product: (a) leading UX/UI practice for coaching apps, and (b) intelligent periodization across **multiple training events** (e.g., half marathon → Hyrox → marathon).
**Method:** Three multi-agent research passes (≈120 subagents): (1) a five-angle competitor sweep with 3-vote adversarial verification of every load-bearing claim (25 claims verified, 22 confirmed, 3 refuted-and-corrected — all pricing live-fetched July 2026); (2) a four-angle UX + multi-event sweep with per-angle adversarial fact-checks; (3) targeted gap-fills for Runna, Garmin, and the rest-of-field where the first pass's verifier honestly reported "nothing survived." Attune's side ground-truthed against the codebase (verified absences by grep — no false gap-flagging). Vendor-page claims describe what vendors *market*, not how well features work; user-sentiment rows cite review/forum evidence. Pricing is promo-cycle volatile — re-verify before external use.

---

## 0. The one-paragraph takeaway

The market splits into four camps — the **analytics incumbent** (TrainingPeaks: human coaching at $149–359/mo, plain-language redesign in 2025), the **consumer champion** (Runna, Strava-owned: best-in-class onboarding/watch handoff, but adaptivity is *pace-targets-only* from speed sessions, no biometrics, ultras capped at 50K), the **free device-native substitute** (Garmin: readiness-driven daily workouts, periodized strength, PacePro — free with the watch; COROS/NRC below it), and the **AI-native cohort** (Athletica, Vert.run, TriDot, Humango, AI Endurance: $15–29/mo, season-planning grammar, advisory AI). Against all of them, Attune's verified differentiators are real and rare: **methodology depth (9 cited methods vs. one house algorithm), trail/ultra physics wired into prescription, a readiness engine that biometrics actually *drive* (vs. Athletica's advisory-only readiness and Runna's none), an LLM coach that can propose one-tap plan edits with honest advisories, and midlife/masters depth nobody else has.** The two verified open lanes are (1) **multi-event season periodization** — a premium-monetized feature across the market (TrainingPeaks ATP, Humango $28.99/mo tier) that Runna and Garmin conspicuously lack, and where **no app on the market periodizes a running race and a Hyrox in one season** (Runna, the official Hyrox partner, resolves it with *advice*, not product — Attune already owns both engines); and (2) **the execution loop** — Runna's watch handoff and Garmin's on-wrist surfaces are where consumer trust is won, and Attune's web-first delivery (with an already-built, underleveraged Garmin workout push) is its largest structural exposure.

---

## 1. Market landscape (verified July 2026)

### 1.1 Pricing norms
| Tier | Price anchor | Examples |
|---|---|---|
| Free floor | $0 | Nike Run Club (~300 audio runs, static plans); Garmin DSW + Coach + PacePro (free with watch); COROS plans + Training Hub (intensity-adaptive only) |
| Self-serve algorithmic | **$19.90–19.95/mo monthly · ~$119–189/yr annual ($9.90–15.75/mo effective)** | Runna $17.99/$109.99 · TrainingPeaks Premium $19.95/$134.99 · Athletica $19.90/$189 · Vert.run PRO $19.90/$118.80 · AI Endurance ~$20/~$200 · Humango Essential $16.99/$155.99 · JOIN €16.99/€119.99 · TriDot from $14.99 |
| Multi-goal / premium AI | **$28.99–99/mo** | Humango Premium $28.99 (multi-goal gate) · TriDot Complete $99 |
| Human hybrid | **$33–45/mo** | Vert.run COACHING (24h human review + chat) |
| Full human coaching | **$149–359/mo** | TrainingPeaks Coach Match Bronze/Silver/Gold |

Two structural facts: **adaptive personalization at TrainingPeaks costs 10–30× the algorithmic products** (its personalization is human coaches, not an engine), and **multi-event support is consistently a paid differentiator** (TP ATP is Premium-gated; Humango gates multiple goals to its top tier).

### 1.2 The Strava–Runna axis
Strava closed its Runna acquisition **May 22, 2025** and is keeping the apps separate "for the foreseeable future" (still true 14 months later). The **$149.99/yr bundle** (annual-only, sold exclusively through Strava) is the de facto anchor for "social platform + AI training plans." Strava's own coaching UX was weak enough that it *bought* rather than built — a signal about how hard the coaching product muscle is.

### 1.3 The free substitute problem
Garmin gives away, with the watch: readiness-driven Daily Suggested Workouts (VO2max, Training Status, acute/chronic load, Recovery Time, Training Readiness = sleep+HRV+stress), race-periodized phases toward one primary race, five adaptive Coach lines (run incl. marathon since Sept 2024, cycling, **periodized strength** with accumulation/intensification/deload, triathlon, fitness), PacePro grade-adjusted course pacing, and ClimbPro. Connect+ ($6.99/mo) paywalls only AI insights — which were mocked as "woefully basic" — and the CEO has confirmed future AI features will land behind it. **The strategy read:** Garmin anchors adaptive coaching at $0 for watch owners; a paid app wins only on what Garmin doesn't do — **run/ultra fueling (none anywhere on the platform), injury accommodation (no input exists), multi-race planning (one primary race, documented post-race "stuck in recovery" failures), methodology choice, and human-legible plan rationale.** Those are, almost line for line, Attune's strengths.

---

## 2. Competitor profiles

### 2.1 TrainingPeaks — the analytics incumbent (no plan-generation AI)
- **Positioning/pricing:** serious self-coached athletes + the coach B2B platform. Premium $19.95/mo · $134.99/yr; Coach Match $149/$229/$359/mo (human).
- **Plans:** marketplace of static plans + human coaches; **ATP** (Annual Training Plan) is the season-planning reference: forced A/B/C tags, only A races peak/taper, auto weekly load (duration/TSS/Event CTL), A races ≤32 weeks apart, ≥9-month plan; **load-level chaining, not workout-level**.
- **Adaptivity:** none native at daily-workout level (that's what the human tiers are for).
- **UX:** 2025 "Athlete Home" renamed CTL/ATL/TSB → Fitness/Fatigue/Form with plain states ("Fresh", "Optimal", "Overloading") — the data-first incumbent retrofitting the readiness-narrative pattern; legacy calendar-grid UX documented as cluttered/dated by independent redesign case studies.
- **vs Attune:** TP's moat is the coach ecosystem + ATP. Attune's CTL/ATL/TSB engine is comparable; Attune has no season layer (yet) and no coach marketplace — but generates adaptive plans TP simply doesn't.

### 2.2 Runna — the consumer champion (Strava-owned)
- **Positioning/pricing:** mass-market race training; $17.99/mo · $109.99/yr · $149.99/yr Strava bundle.
- **Plans:** human-coach-designed templates parameterized by the "Runna Engine" ("coach-led programming and AI" — A/B-tested at population scale, no LLM in plan structure). Key input: Estimated Race Time.
- **Adaptivity (verified narrow):** **one signal** — achieved-vs-prescribed paces in speed sessions ("Pace Insights"), opt-in, changes pace targets only, never structure. 2026 added Adapt-for-Heat (per-session weather pace adjust) and Mileage Insights (adherence→volume suggestions). **Verified absent: HR influence (display-only), RPE input, HRV, sleep, any readiness** — founders named HRV/sleep/cycle as roadmap years ago; unshipped.
- **AI:** no AI chat (24/7 chat is human); "Workout Insights"/"Briefings" are unbranded generated text.
- **Scope:** 5K→marathon strong; **ultra capped at 50K**; no trail plan type, no vert targets (race library knows a race is trail; reviewer-inferred hill-rep scaling). 8-wk Hyrox plans (official partner) but **a Hyrox cannot be a B-race in a marathon plan** — dual-goal athletes get advice to self-rebalance. B-race feature (mini-taper, enforced rest, Training Disruption indicator) exists **inside** one A-plan; between blocks, users hand-assemble bridge plans.
- **Fueling:** editorial guides ("1 gel per 30–45 min"), no computed per-athlete plan. **Race execution:** avg-pace target + km-split audio cues; explicitly no split-by-split pace plans.
- **UX (the benchmark):** ~30-screen belief-building onboarding with "with/without Runna" value preview; plan realignment as a first-class prompt (after >3 missed workouts); watch handoff = 2 weeks of structured workouts to Garmin/Apple/COROS/Suunto/Amazfit, auto-updated. Complaint profile is coaching-logic: too-aggressive paces, workout-heavy weeks, weak mid-plan recalibration (injury anecdotes) — *"polished UX buys trust that harsh training logic then burns."*
- **vs Attune:** Runna wins the first hour (onboarding) and the execution loop (watch); Attune wins everything physiological: readiness, biometrics, trail/ultra, fueling, honesty, coach intelligence, masters/menopause.

### 2.3 Garmin — the free device-native substitute
Profiled in §1.3. Additional user-sentiment texture: praised for enforcing genuinely easy days; criticized for monotone intervals, VO2max-inflated paces, phase resets after watch updates, and the **documented post-race DSW "stuck in recovery" seam** — evidence that even a good adaptive daily engine fails without explicit inter-event state transitions.

### 2.4 Athletica.ai — the AI-native scientist
- **Positioning/pricing:** cross-sport AI coaching (Paul Laursen); $19.90/mo single tier, "no tiers."
- **Plans/adaptivity:** algorithmic, recalculates around missed sessions/schedule; **unlimited A races** with B/C in any sport; edge case confirmed by founder in-forum: a B race too close to the A race gets no sport-specific taper (~2-week proximity threshold).
- **Biometrics (the nuance that matters):** ingests nocturnal HRV/RHR/wellness (Garmin/Oura/Whoop) into a Recovery Profile with push/caution/rest flags — **but by its own words the AI "does not change your training load (yet). It advises."** Its Workout Reserve engine (EJSS 2026) runs on ~6 weeks of maximal-mean power/pace only — zero biometric inputs. **Readiness is displayed, not wired into prescription.**
- **AI:** advisory-only chat (verbatim FAQ: "explain, analyze, and suggest, not act"); users manually apply suggestions; Feb 2026 forum request to let it edit plans confirms the ceiling.
- **Integrations:** Garmin/Strava/COROS/Wahoo/Concept2/Intervals.icu; **no native Apple Watch** (third-party Watchletic bridge only).
- **vs Attune:** closest philosophical peer (science-first, honest AI). Attune's edges: readiness *drives* prescription (coach intensity ceiling, DOMS descent dampening, deload program), coach *can* propose one-tap-apply edits, native HealthKit, trail physics, methodology choice. Athletica's edge: the season layer (unlimited A races) and cross-sport breadth.

### 2.5 Vert.run — the trail/ultra niche analog
- **Positioning/pricing:** exclusively trail/ultra ("more personal than Strava, less complicated than TrainingPeaks, a fraction of the cost of a private coach"). PRO $9.90/mo annual · $19.90 monthly; COACHING (human) $33/$45; 1:1 $99.
- **Model (corrected by verification — earlier "no AI" characterizations refuted 0-3):** hybrid — coach-built plans with elite athletes, every PRO plan human-reviewed within 24 h, shipped "AI Coach & Chat" agent (July 2026 App Store), 5 free human-chat messages.
- **Trail structure:** elevation gain AND descent, time-on-feet, power-hiking, technical terrain, durability strength; proprietary **Mountain Index** progress metric.
- **Fueling/pacing (the depth gap):** Nutrition Planner and Race Time Predictor are **free standalone web calculators** (hourly cal/carb from load+weight+distance; ITRA-index → optimistic/realistic/conservative finish scenarios) — not integrated per-workout prescription, and not checkpoint pace plans. Sentiment: "programs feel generic," slow Android app.
- **vs Attune:** Vert validates the category (trail-specific coaching is a real market with a human-hybrid price ladder). Attune's engine is deeper on every physiological axis (integrated fueling/heat/altitude, descent-DOMS readiness, compliance grading); Vert's edges are the human-review trust layer, native mobile apps, and community/marketing reach. Its free calculators are a customer-acquisition funnel worth copying.

### 2.6 Rest of field (one line each, verified)
**TriDot** $14.99–249/mo, tri-only, "FitLogic" AI branding, env-aware claims, Season Planner with what-if race staging (unique) · **Humango** $16.99/$28.99, multi-goal at Premium, Hugo AI recalibration · **AI Endurance** ~$20/mo, DFA-alpha-1 HRV thresholds + durability, LLM chat that CAN edit workouts, LLM meal plans · **JOIN** €16.99, cycling; JOIN Running is a cross-training feature, "not a standalone running app" · **COROS** free, intensity-adaptive only (zones rescale; no readiness-driven restructuring) · **NRC** free floor, ~300 audio runs, static plans, zero adaptivity · **TrainerRoad** (cycling) Plan Builder: the most explicit auto-chaining (A≥8wk apart, B=race-week taper, C=no change) and a complaint thread that doubles as a requirements list.

---

## 3. Feature-gap matrix

**Attune baseline (ground truth, 2026-07-06):** web-first responsive app + iOS HealthKit-sync companion (no native training UI, no Android); 9 cited methods with fit-based selection; generated plans carrying vert/downhill, fueling, heat/altitude, trail-session, drill and phase-aware strength prescriptions + honest feasibility advisories + day/week editing + Garmin structured-workout push; HRV/RHR/sleep/Body-Battery readiness with ACWR guardrails, A–D states, deload generator, injury risk flags, descent-DOMS load dampening; LLM coach (6 surfaces, 20+ grounded context sections, personas, memory, one-tap plan-edit proposals, weather doctrine, web-search citations); Strava+Garmin+Apple sync; multi-metric compliance grading; race-readiness %; 3 course profiles w/ 3D scenes; Hyrox + general-fitness paths; menopause/masters/cycle tailoring. **Verified absent (by grep):** multi-event/season support (single `raceDate`), intensity-distribution monitoring, aerobic-decoupling metric, native mobile app, social, route planning, shoe tracking, nutrition diary, audio runs, video analysis.

Legend: ● full · ◐ partial · ○ none. (Attune column ground-truthed against code; competitor columns verified as cited above.)

| Capability | Attune | TrainingPeaks | Runna | Garmin (free) | Athletica | Vert.run |
|---|---|---|---|---|---|---|
| Named, cited methodologies (choice of system) | ● 9 methods | ◐ marketplace | ○ house engine | ○ house engine | ○ house engine | ◐ coach-built |
| Generated, personalized race plan | ● | ○ (buy/coach) | ● | ● | ● | ● |
| Day-to-day adaptivity from performance | ◐ compliance→coach; paces static | ○ | ◐ pace targets only | ● daily recalc | ● | ◐ AI adjust (unverified depth) |
| **Biometric readiness (HRV/sleep/RHR) exists** | ● | ◐ display (Health Insights) | ○ **verified none** | ● | ◐ advisory only | ○ |
| **Readiness DRIVES prescription** | ● ceiling+dampening+deload | ○ | ○ | ● | ○ "advises, not acts" | ○ |
| Descent/eccentric DOMS modeling | ● unique | ○ | ○ | ○ | ○ | ○ |
| Trail/ultra plan structure (vert, hiking, ToF) | ● | ◐ plan-dependent | ○ 50K cap, no vert targets | ◐ ClimbPro exec only | ◐ | ● |
| Integrated fueling prescription | ● per-race g/hr + gut training | ○ | ◐ editorial | ○ (cycling-only alerts) | ○ | ◐ free calculator |
| Heat/altitude prep blocks | ● | ○ | ◐ heat pace-adjust | ○ | ○ | ○ |
| Strength: periodized + integrated | ● phase-aware + menopause bone | ◐ plans exist | ◐ add-on sessions | ● acc/int/deload | ◐ | ◐ durability work |
| LLM coach chat | ● grounded, 20+ context sections | ○ | ○ (human chat) | ◐ Connect+ insights (panned) | ◐ advisory-only | ◐ AI chat (new) |
| Coach can change the plan | ● propose + one-tap apply | ○ | ○ | n/a (engine owns plan) | ○ confirmed no | ? unverified |
| Honest advisories / feasibility | ● | ○ | ○ | ○ | ◐ | ◐ human review |
| **Multi-event season (A/B/C, chaining)** | ○ **single race** | ● ATP (load-level) | ◐ B-race only | ◐ 1 primary race | ● unlimited A | ◐ |
| **Running + Hyrox in one season** | ○ (owns both engines!) | ○ | ○ advice only | ○ | ○ | ○ |
| Watch execution loop (structured push) | ◐ Garmin push built; no Apple push, web-first | ● | ● 5 brands | ● native | ● | ◐ |
| Native mobile apps | ○ web + iOS health-sync companion | ● | ● | ● | ● | ● |
| Computed race pacing (course-aware splits) | ◐ segments+guidance, no pace bands | ◐ plan-dependent | ○ explicit no | ● PacePro | ○ | ○ finish scenarios |
| Menopause/masters tailoring | ● unique depth | ○ | ◐ post-natal only | ○ | ○ | ○ |
| Injury accommodation (input + adaptation) | ● onboarding + coach + risk flags | ◐ human coach | ◐ manual flow | ○ no input exists | ◐ | ◐ human |
| Compliance grading (multi-metric) | ● dist/dur/elev/HR/drills | ◐ compliance bar | ◐ insights text | ◐ | ◐ | ◐ |
| Social/community | ○ | ◐ | ◐ leaderboards | ◐ | ◐ forum | ◐ |
| Price | TBD | $0–359/mo | $9.17–18/mo | $0 + watch | $15.75–19.90/mo | $9.90–99/mo |

**Reading the matrix:** Attune's column is the strongest in the *physiology rows* — and the weakest in the three *delivery rows* (multi-event, watch loop, native mobile). That is the whole strategic picture in one table.

---

## 4. Where Attune wins today (verified differentiators)

1. **Readiness that acts.** Only Garmin's engine and Attune's wire biometrics into what the athlete is told to do — and Garmin's can't take an injury input, explain itself, or hold a conversation. Athletica *displays* readiness and "advises, not acts"; Runna has none (HR is display-only, verified).
2. **Descent/DOMS science.** Eccentric dose → kinetic curve → repeated-bout protection → load dampening. No competitor has an analog (Vert's Mountain Index is a progress tracker, not a recovery model).
3. **Integrated trail craft.** Per-race fueling (g/hr + gut training), heat/altitude blocks, vert prescription with downhill repeats, power-hiking, dress rehearsal — vs. Vert's standalone calculators, Runna's 50K cap, and Garmin's total fueling absence.
4. **The honest LLM coach.** Market-validated by counterexample: Strava/Garmin AI text is mocked precisely for restating numbers without context, fixed tone, and no training narrative (the 2026 r/Strava study's four tensions). Attune's architecture — grounded context sections, personas, detail levels, PR-claim integrity, plan-edit proposals with rationale — is the published antidote pattern.
5. **Methodology pluralism.** Nine cited methods with fit-based selection vs. one house algorithm everywhere else. (TrainingPeaks sells this as a *marketplace*; nobody generates from named methods.)
6. **Midlife/masters depth.** Menopause status + symptoms + bone-loading finishers + masters recovery doctrine + evidence-humble cycle awareness. Runna's post-natal plans are the only comparable gesture in the set.

---

## 5. Ranked gaps & opportunities (Witchel check inline)

**G1 — Multi-event season engine (A/B/C races, recovery→bridge→build chaining).** The market's premium feature (TP ATP, Humango $28.99 tier), absent in Runna/Garmin, and *nobody* chains running + Hyrox. Attune already owns both engines, post-race recovery formulas (R5), phase-aware strength (R8), and a real TSB engine (Friel's tier targets are directly implementable). ✅ *Massive:* every racer books multiple events/yr; hybrid segment is the fastest-growing. ✅ *Visceral:* the post-race "now what?" void + fear of losing fitness between events; Garmin's stuck-in-recovery threads show the pain live. ✅ *Customer language:* "plan my season," "my next race," "A race." → **Build. Design sketch in §7.**
**G2 — Close the execution loop (watch-first delivery).** Runna's moat; the industry's trust surface. Attune already pushes structured workouts to Garmin (underleveraged: surface it, extend windows, auto-resync on edit) — Apple Watch workout push (WorkoutKit) and a today-view/PWA/widget surface are the gaps. ✅ Massive (execution happens on-wrist) ✅ Visceral (nobody wants to memorize intervals) ✅ Customer language ("send it to my watch"). → **Build incrementally: Garmin-push UX first (cheap), Apple push next.**
**G3 — Onboarding as belief-building + time-to-first-value.** Runna's ~30-screen flow with a value preview is the category benchmark; fitness apps lose ~75%+ of users in 3 days; NN/g: ask only what changes the plan, teach in context. Attune's onboarding is information-rich but form-like; the welcome letter is a strong asset arriving late. ✅✅✅ ("show me my plan before you ask me to believe"). → **Redesign flow: goal-first, live plan preview mid-flow, defer nice-to-have questions into contextual asks.**
**G4 — Plan realignment as first-class UI.** Runna's trust moment (readapt-or-keep prompt after misses; theirs fires only after >3 missed workouts — beatable). Attune's coach can restructure conversationally but nothing *prompts*. Silent drift is the failure mode; silent auto-change is the *other* failure mode (most-criticized AI pattern) — prompt + explain + one-tap is the verified sweet spot, and Attune's plan-edit proposal machinery already exists. ✅✅✅. → **Build: missed-workout detector → coach-authored realignment proposal card.**
**G5 — Performance-adaptive pace targets ("Pace Insights" analog).** Runna's one true adaptive signal; Attune has richer inputs (compliance grades, GAP, time-in-zone) and a VDOT engine but never recalibrates targets from actuals. Opt-in, targets-only, explained — per the verified trust pattern. ✅✅✅ ("my paces got stale"). → **Build on existing compliance pipeline.**
**G6 — Course-aware race pacing (PacePro-for-trail).** Garmin computes grade-adjusted split bands (free, road-strong); Vert offers only finish scenarios; Runna explicitly declines. Attune has course segment data + Minetti GAP + vert physics — a *trail* pace-band generator (with fueling checkpoints overlaid) would be category-first. ✅ Massive (race-day is the whole point) ✅ Visceral (blowing up from bad pacing) ✅ ("what pace on the climbs?"). → **Build after G1/G2 (needs course data breadth; start with the 3 BA courses).**
**G7 — Intensity-distribution monitor ("gray-zone guard") + durability metric.** TP's redesign and the whole readiness-narrative convergence say: plain-language load truth wins. We have per-session time-in-zone + method targets; nobody in the set computes polarization compliance or aerobic decoupling for athletes (AI Endurance markets DFA-a1, different mechanism). ✅✅✅ ("your easy days are too hard" is the most-quoted coaching truth in the category — Garmin's DSW praise centers on exactly this). → **Build: weekly easy/hard split vs method target + advisory; pace:HR decoupling on long runs.**
**G8 — Readiness UX hardening.** Orthosomnia-safe framing (pair every red with a concrete action — deload program exists, surface it), trend-over-number, non-color redundant encoding (~8% of men are red-green colorblind; masters-skewed), plain-language metric names at default detail level (TP renamed CTL/ATL/TSB — we can too, we already have detail levels). ✅✅ (retention/trust more than acquisition) ✅. → **Audit + polish pass; cheap.**
**G9 — Flexible-consistency mechanics (not streaks).** Evidence: rigid streaks backfire where rest is programmed (BJHP 2025; Milkman 2021 flexibility→durable habits). "Sessions completed vs planned this week — rest counts" view + grace framing. ✅ Massive (habit is the product) ✅ ("I don't want to lose my streak on a rest day" — the anti-pattern we avoid) ✅. → **Small feature, aligns with compliance engine.**
**G10 — Free standalone tools as acquisition funnel.** Vert's nutrition/race-predictor calculators run free at standalone URLs. Attune's fueling + vert + readiness content is deeper; publishing 2–3 free calculators (trail fueling planner, vert-adjusted finish predictor, race-day heat planner) converts research assets into top-of-funnel. ✅ Massive reach ✅ solves a real pre-purchase job ✅ customer words. → **Marketing/engineering lite.**

Deliberately **not** ranked: social feed (different product muscle; Strava owns it), human-coach marketplace (TP owns it), audio-guided runs (NRC gives them away), triathlon depth (TriDot/Athletica lane; swim prescription absent by choice).

---

## 6. UX/UI — leading practice vs. Attune (verified patterns)

### 6.1 The five patterns that won (2024–2026 convergence)
1. **Verdict-first, data-underneath.** One large score/state + short narrative + progressive disclosure (WHOOP's 72-pt score & 3-tier hierarchy; Garmin Morning Report; TP's Fresh/Optimal/Overloading renames). *Attune: has score+narrative; polish per G8.*
2. **Proactive morning narrative.** WHOOP Daily Outlook, Oura Advisor (user-selectable tone — Attune's persona editor already exceeds this), Garmin Morning Report. *Attune: proactive pings exist; package as a true "morning report" surface.*
3. **Adaptation prompts as first-class UI** (Runna realignment). *Attune: G4.*
4. **AI text that adds context, never restates stats** — the 2026 r/Strava study's four tensions (numerical-vs-contextual, isolated-vs-narrative, fixed-tone, one-voice) are design requirements; Garmin Connect+ shows the cost of shipping beneath the bar, *and* of paywalling AI before it clears it. *Attune: architecture already aligned; keep the bar.*
5. **Belief-building onboarding with value preview** (Runna). *Attune: G3.*

### 6.2 Design-science checklist (evidence-based, applied to Attune)
- Ask only what changes the plan; contextual teaching over tutorial decks (NN/g).
- Time-to-first-value: first completed workout inside week one is the retention hinge (~75%+ 3-day DAU loss; day-30 ~5–12%, top apps ~25%).
- First-class BCT objects: goals, self-monitoring, feedback, prompts, social support (PMC10545861).
- **No rigid streaks** — weekly consistency with rest-as-compliance (BJHP 2025; Milkman 2021).
- Few, smart notifications (evening preview + morning readiness; generic nudges verifiably don't move behavior).
- Readiness: traffic-light + expandable factors; orthosomnia-safe red states (concrete action, uncertainty, trend-first).
- "Why this workout" one-liner with optional depth (more explanation ≠ more trust); never silent plan changes.
- Masters accessibility: 16px+ body floor, generous targets, WCAG 4.5:1, **non-color redundancy on all zone/status colors**.
- Measure sessions-completed-as-prescribed, not DAU (engagement-efficacy gap).

---

## 7. Multi-event periodization — market grammar, science, and the Attune design sketch

### 7.1 The converged product grammar (verified across TP/TrainerRoad/Athletica/Runna/Garmin/TriDot/Humango)
- Only **A races** get a full peak + taper; **B races** get a race-week mini-taper + enforced post-race recovery; **C races** are trained through.
- **Minimum ~8 weeks between peaks** (TrainerRoad hard rule; TriDot guidance); A-to-A within ~32 weeks (TP).
- **Proximity threshold** below which a secondary race is trained through: ~7–10 days (Runna) to ~2 weeks (Athletica founder-confirmed).
- **Post-race state machine is where engines break in production** (Garmin stuck-in-recovery; TrainerRoad VO2-after-race complaints). Explicit inter-event transitions are a requirement, not a nicety.

### 7.2 The science layer (verified, science vs. convention labeled)
- **Residual training effects (Issurin, Sports Med 2010):** aerobic endurance **30±5 d**, maximal strength **30±5 d**, anaerobic glycolytic **18±4 d**, strength-endurance **15±5 d**, speed **5±3 d** — the quantitative basis for bridging events of different types. *(science)*
- **Interference:** running (not cycling) depresses strength/power, dose-dependent (Wilson 2012 meta, PMID 22002517); interference emerges only ~week 8 of concurrent overload (Hickson 1980) → short bridges are low-risk. *(science)*
- **Maintenance doses:** strength holds at **1×/week** once built (Bickel 2011, PMID 21131862; older adults need more — masters-relevant); aerobic holds on 2–4 d/wk **if intensity is preserved** (Hickson 1981, PMID 7219129). *(science)*
- **Doctrine:** 1–2 A races/season (Friel; 3+ "wastes the season"); taper depth by tier via TSB — A: +15..+25, B: −10..0, C: below (Friel/TP); post-race runway ~1 easy day/mile raced + reverse taper (Pfitzinger convention, matches Attune's shipped R5); second peak = 1–2 wk recovery + ~8-wk compressed rebuild (TP "The Double"); tune-ups at ~6/4/2 wk feeding race-equivalency predictors. *(convention)*
- **Hyrox specifics:** ~51 of ~84 total minutes is running; VO2max + endurance volume are the strongest finish-time correlates (Frontiers Physiol 2025) — a runner's aerobic base is the Hyrox asset, the differentiating qualities are strength-endurance + glycolytic capacity, whose residuals (15–18 d) mean they must be trained **last**. *(science)*

### 7.3 Design sketch — the Attune Season Engine (half → Hyrox → marathon)
1. **Race calendar with A/B/C priorities** (onboarding + Journal-adjacent UI). A races get full blocks; B races get Runna-style mini-taper inside the active block (+ tune-up placement 4–6 wk out feeding the existing predictor rehearsal + goal-pace advisory); C races get a day-type stamp.
2. **Inter-event state machine** (the thing Garmin lacks): `RACE → RECOVER (1 d/mi, reverse taper — shipped R5 logic) → BRIDGE (residual-aware) → BUILD (compressed, ≥8 wk to next peak) → TAPER (TSB tier targets — computable today from the shipped performance engine)`.
3. **Residual-aware bridge blocks** — the category-first piece: half→Hyrox bridge holds aerobic with 1–2 intensity touches (Hickson '81) while concentrating strength-endurance/glycolytic (Issurin residuals); Hyrox→marathon bridge holds strength at 1×/wk (Bickel) while rebuilding run volume (Wilson: acceptable — strength is maintenance-only). Every component engine already exists in Attune (methods, Hyrox path, R8 strength phases, R5 recovery, readiness/TSB).
4. **Feasibility honesty at season level** — extend the shipped advisory layer: "two A races 5 weeks apart — the second gets a compressed build; consider B-tagging one" (the exact failure TrainerRoad/Athletica users hit).
5. **Coach narration** — season context becomes a SEASON prompt section: where the athlete is in the chain, what quality this block protects, why today serves the *next* race. (No competitor's AI can explain a season; ours narrates advisories already.)
- **Monetization note:** the market prices this as premium ($28.99/mo Humango; TP Premium). Witchel-checked in G1.

---

## 8. Provenance
Three workflow passes + three gap-fill agents, ~120 subagents total; every load-bearing claim either 3-vote adversarially verified against live fetches (July 5–6, 2026) or attributed to named support docs/forums/peer-reviewed sources inline above. Three claims were refuted in verification and corrected (all had *underestimated* Vert.run). Known limits: vendor-marketing basis for capability rows (execution quality unverified); Athletica biometric scoping resolved at product level via its own engineering posts; runnersworld.com excluded (crawler-blocked). Key primary sources: trainingpeaks.com/pricing + help center, press.strava.com, support.runna.com (12+ articles), Garmin manuals/FAQ + the5krunner teardowns + Garmin forums, athletica.ai + news/forum posts, vert.run + standalone tools, Issurin Sports Med 2010, Wilson 2012 (PMID 22002517), Hickson 1980/1981, Bickel 2011 (PMID 21131862), Frontiers Physiol 2025 Hyrox studies, NN/g, Milkman Management Science 2021, BJHP 2025, arxiv 2604.23830 (r/Strava AI study).
