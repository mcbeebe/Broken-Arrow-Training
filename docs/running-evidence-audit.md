# Running Methodology Evidence Audit

**Status:** living document, rendered from `src/engines/running/heuristics.ts`, `src/engines/planGenerator/methodInvariants.ts`, `src/engines/planGenerator/volumeEnvelopes.ts`, and the volume-model constants in `src/engines/planGenerator/weekPlan.ts`. Every training-prescription constant in the road/trail engine is listed with its evidence tier and what it would take to upgrade it — the road analog of `hyrox-evidence-audit.md`.

**Expert review is packaged:** [`running-expert-review-packet.md`](./running-expert-review-packet.md) turns this list into a reviewer-ready questionnaire with three generated exhibit plans ([`running-expert-review-exhibits.md`](./running-expert-review-exhibits.md)). Verdicts land back here as citations.

**How to read tiers:** T1 peer-reviewed RCT/meta-analysis · T2 peer-reviewed observational · T3 first-principles / verifiable primary source (a published plan table counts once page-verified) · T4 coaching heuristic. The rule: a tier upgrades only with a citable source, never to make this audit look better.

## Cited constants (T1–T3)

| Constant | Value | Tier | Source |
|---|---|---|---|
| `STRENGTH_SCHEME_POLICY` | technique-first for new lifters; heavy (4–6 reps, reps-in-reserve cues) only for experienced; masters scheme at 70+ | T1 | Fragala et al. 2019 (NSCA position stand, resistance training for older adults); Borde et al. 2015 (meta-analysis, dose-response in older adults) |
| `SENIOR_INTENSITY` | at 70+: max 1 quality session/week; VO2/rep slots substitute to threshold-flavored work | T3 | Tanaka & Seals 2008 (endurance exercise performance in masters athletes — intensity of stimulus, not modality, drives retention); Reaburn & Dascombe 2008 |
| `MASTERS_RECOVERY_CADENCE` | recovery week at least every 3 weeks at 58+ | T3 | Reaburn & Dascombe 2008 (age-related recovery kinetics) |
| Method invariants registry | per-method long-run share/ceiling, quality share, hard-day spacing, low-mileage downgrade (`methodInvariants.ts`) | T3 | Transcribed from each method's own published rules (e.g. Daniels: long ≤30% of week, I ≤8%, 2 days between hard sessions; Hansons: 16 mi long-run cap) |

## Method-published volume benchmarks (T4 → T3 after page verification)

`volumeEnvelopes.ts` records the PEAK weekly-mileage band each method's published plan prescribes per distance/audience, with the base that plan assumes. The generator is CI-tested to land inside band ± 20% adaptation tolerance (`r4-method-fidelity.test.ts`). **All bands are currently T4 — transcribed from coaching knowledge of the published tables, not yet page-verified against the printed editions.** Verifying each against the book/site (page or URL citation) upgrades that row to T3; the expert packet asks for exactly this.

| Method | Distance | Audience (assumed base) | Published peak band (mi/wk) |
|---|---|---|---|
| Daniels | 5K | novice (10) / 20–40 mi/wk plans (22) / upper band (38) | 12–20 / 22–35 / 35–55 |
| Higdon | 5K | Novice (9) / Intermediate (17) / Advanced (26) | 11–17 / 20–27 / 25–35 |
| Higdon | 10K | Novice (10) / Intermediate (18) / Advanced (27) | 14–20 / 22–30 / 28–38 |
| 80/20 (Fitzgerald) | 5K | L1 (12) / L2 (22) / L3 (36) | 15–23 / 24–34 / 35–50 |
| 80/20 (Fitzgerald) | 10K | L1 (12) / L2 (22) / L3 (36) | 16–24 / 25–36 / 36–52 |
| Galloway | 5K/10K | run-walk beginner (8) / time-goal (16) | 10–17, 12–19 / 16–27, 18–29 |
| Pfitzinger (FRR) | 5K | to-30 & 30–42 schedules (26) / 42–58 (40) | 28–42 / 40–58 |
| Pfitzinger (FRR) | 10K | lower bands (27) / 44–60 (42) | 30–44 / 42–60 |

Note: Faster Road Racing publishes no true-beginner 5K plan (its floor assumes ~30 mi/wk); our beginner adaptation deliberately runs below the published floor and is not envelope-benchmarked (Pfitzinger's 5K suitability rating is OK, not BEST).

## Uncorroborated heuristics (T4 — the priority review targets)

| Constant | Value | Rationale | What would upgrade it |
|---|---|---|---|
| `MASTERS_AGE_TIERS` | masters at 58, senior at 70 | Bands chosen to put the field case (79) firmly inside the senior tier; literature describes decline as continuous, not stepped | A coach's confirmation of the thresholds, or a graded model |
| `MASTERS_RAMP_CAP` | 8%/week at 58+ (vs ~10%) | Conservative delta on the general ramp guideline | Practitioner corroboration |
| `SENIOR_LONG_RUN_CAP_MULT` | long-run time cap ×0.85 at 70+ | Single-session structural cost bounded before weekly volume | Practitioner corroboration |
| `DAYS_VOLUME_FACTOR` | 3d 0.75 · 4d 0.9 · 5d 1.0 · 6d 1.1 · 7d 1.15 | Volume follows frequency instead of cramming miles into fewer runs | Cross-check against published 3-day vs 6-day variants of the same plan (e.g. Higdon Novice vs Advanced) |
| `DISTANCE_PEAK_GAIN_MI` | one block adds ≤ +15 (5K) … +25 (marathon) … +34 (100mi) over stated base | Bounds the multiplier model; ~10%/wk compounding lands inside these over a real build | Practitioner corroboration; injury-rate literature on rate-of-load-increase (Gabbett-style ACWR work is adjacent, not direct) |
| `TAPER_WEEKS_CAP` | 5K/10K 2 wk · half 3 wk (incl. race week) | Published short-race tapers run 8–13 days in every system surveyed | Page-verified taper tables per method |
| Content ceiling | peak ≤ long-run time cap + (run days − 1) × method easy-window max × 0.9 | A target no set of day cards can express is a target the ramp must not chase | Refinement to per-phase pattern capacity |
| Recover/bridge scaling (R3) | stream durations × clamp(prior volume / 25, 0.6–1.6); ×0.85 at 70+; +1 rest day 58+ / +2 at 70+; first bridge intensity deferred a week at 58+ | Extends the shipped post-race formulas to the athlete's actual size and age | Practitioner corroboration |
| Block seam bounds | next build resumes ≤ 1.2× previous build (error), ≥ 0.45× (warn); carry-over = achieved peak ×0.85 | Detraining over a 1–2 week recover/bridge is small; fitness mostly persists | Detraining literature (Mujika & Padilla 2000) could lift the 0.85 to T2 with a proper mapping |
| `ADAPTATION_TOLERANCE` | envelope = published band ± 20% | Personalization headroom around fixed published tables | Reviewer judgment on whether ±20% is the right leash |

## Change protocol

An accepted expert verdict ships as: (1) the constant edited in its registry, (2) the tier/citation updated here, (3) the affected gate tolerances re-run (`road-persona-sweep`, `r0`, `r1`, `r3`, `r4` suites). Every constant is a single value in one file — a change propagates to every generated plan the same day.
