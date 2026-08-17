# Hyrox Methodology Evidence Audit

**Status:** living document, rendered from `src/engines/hyrox/spec.ts` and `src/engines/hyrox/heuristics.ts`. Every training-prescription constant in the Hyrox engine is listed here with its evidence tier and what it would take to upgrade it. This is the target list for expert review and for benchmarking against additional published programs.

**How to read tiers:** T1 peer-reviewed RCT/meta-analysis · T2 peer-reviewed observational · T3 first-principles / verifiable primary source · T4 coaching heuristic. There is essentially **no peer-reviewed Hyrox-specific training literature** (the sport dates to 2017), so T4 with practitioner corroboration is the realistic ceiling for most prescriptions today. The rule: a tier upgrades only with a citable source, never to make this audit look better.

## Verified (T3) — checkable against primary sources

| Constant | Value | Source |
|---|---|---|
| Race format | 8 × 1 km runs, each followed by one station, ends on wall balls | HYROX Singles rulebook (hyrox.com/rulebook) |
| Station order & volumes | SkiErg 1000 m · Sled push 50 m · Sled pull 50 m · Burpee broad jump 80 m · Row 1000 m · Farmers carry 200 m · Sandbag lunges 100 m · Wall balls 100 reps | HYROX Singles rulebook 25/26–26/27 |
| Division/sex loads | Open M: push 152 kg, pull 103 kg, carry 2×24 kg, sandbag 20 kg, ball 6 kg/3.0 m. Open W: 102/78/2×16/10/4 kg/2.7 m. Pro M: 202/153/2×32/30/9 kg. Pro W: 152/103/2×24/20/6 kg | HYROX Singles rulebook. **Action:** re-verify women's Open/Pro rows against the current-season rulebook — encoded from widely published values, not independently re-checked |
| ~50% of race time is running | drives run/station training parity | PureGym Hyrox guide; consistent with published race-split analyses |

## Corroborated heuristics (T4, direction supported by ≥1 practitioner source)

| Constant | Value | Corroboration | Open question for expert review |
|---|---|---|---|
| Weekly session template | interval run · strength+stations · compromised run · easy/long | STRIDE Fitness and PureGym independently prescribe this exact mix | Session ordering within the week |
| Compromised running dose (`COMPROMISED_DOSE`) | 3×[1 km + station], alternating weeks with the circuit | STRIDE: combo work 1×/wk ("leg-burn-into-strength transition"); PureGym: weekly "Compromised run" | Is alternating enough, or should it be weekly at lower volume? |
| Full simulation timing (`FULL_SIM_DAYS_OUT`) | 10–17 days pre-race (validator floor 10) | v2 rebuild used 14 days; PureGym includes race simulations | Should first-timers sim at reduced load? |
| Interval rest (`INTERVAL_REST`) | 90 s early → 60 s late (past 70% of plan) | STRIDE: 800 m repeats @ race pace, 90 s rest; 1 km/60–90 s is community standard | Rest tightening rate |

## Uncorroborated heuristics (T4, convention only — the priority review targets)

| Constant | Value | Rationale | What would upgrade it |
|---|---|---|---|
| Station ramp (`STATION_RAMP`) | 50% → 100% of race volume across the build; deloads at 60% of ramp (floor 30%) | Progressive overload toward spec | A published ramp from ≥2 reputable programs, or expert sign-off per level |
| Half-sim timing (`HALF_SIM_DAYS_OUT`) | 18–27 days pre-race | One runway step before the full sim; v2 used 21 d | Same |
| Spec-day timing (`SPEC_DAY_DAYS_OUT`) | 24–42 days pre-race | Meet race volumes fresh before meeting them fatigued | Same |
| Tempo dose (`TEMPO_MINUTES`) | 18 → 30 min across the plan | Standard endurance threshold practice | Hyrox-specific corroboration |
| Layered-track ramp (`LAYERED_RAMP`) | 35% → 75% of spec, ≤2 doses/wk inside another race's build | Compromise-session doctrine + Issurin residual sequencing | Expert review of the dual-race case specifically |
| Level templates (`LevelParams`) | run mileages, rep counts, wall-ball weights per experience level | Pre-date this audit; hand-authored | Benchmark against published beginner/advanced plans |
| Recovery-week cadence | every 4th week; none in plans ≤6 weeks; never in final 2 pre-race weeks | Standard periodization + the field inversion bug fix | Low priority — matches broad convention |

## Not yet in scope

Erg pacing prescriptions · above-race-weight sled work (currently Advanced/Elite templates only) · heat/venue acclimation for convention-center racing · Doubles/Relay formats.

## How this audit gets better

1. **Benchmark matrix** — as additional published plans are collected (in progress), each heuristic row gains a "observed range across N programs" column; constants outside the range get fixed or explicitly justified.
2. **Expert review** — a certified Hyrox coach reviews generated personas (first-timer, intermediate 12-week, clamped 4-week, Pro) against exactly the open questions above.
3. **Outcome data** — full-simulation splits vs. race-day splits, once a cohort has raced.
