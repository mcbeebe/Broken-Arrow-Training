# Hyrox Methodology Evidence Audit

**Status:** living document, rendered from `src/engines/hyrox/spec.ts` and `src/engines/hyrox/heuristics.ts`. Every training-prescription constant in the Hyrox engine is listed here with its evidence tier and what it would take to upgrade it. This is the target list for expert review and for benchmarking against additional published programs.

**Expert review is now packaged:** [`hyrox-expert-review-packet.md`](./hyrox-expert-review-packet.md) turns this target list into a reviewer-ready questionnaire with three generated exhibit plans ([`hyrox-expert-review-exhibits.md`](./hyrox-expert-review-exhibits.md)). Verdicts land back here as citations.

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

## Benchmark matrix (2026-08 — six sources)

Sources: **S1** STRIDE Fitness 12-wk guide (web summary) · **S2** PureGym 8/12-wk plans (web summary) · **S3** HYROX 8-Week Formula methodology (Base→Pace→Accelerate→Prime→Race blocks; Aerobic/Express/Speed/Engine/Strong/Ultra taxonomy) · **S4** GORUCK×HYROX 8-week plan (full detail; equipment-adapted — no ergs/sleds, so silent on station volumes) · **S5** Official HYROX Manual 10/2020 (training philosophy, session formats, workout library) · **S6** 12-week Hyrox program (7-day template with a weekly simulation day).

| Dimension | Observed across sources | Ours | Disposition |
|---|---|---|---|
| Weekly session mix | Interval run + strength + station/sim + long/aerobic day: S1, S2, S4, S6 all match; S5 endorses HIIT + longer steady efforts + classic strength lifts | Same role set | **In range** |
| Run↔station alternation | Universal, and from the start: S3 Base block exists to familiarize compromised running; S6 weekly simulation from wk 1; S4 interleaves nearly every session; S1/S2 weekly | Weekly finisher (build+) + alternating compromised session; **base-phase intro added in this benchmark** | **Adjusted** — compromised intro now starts in base |
| Km-repeat rest | 90 s (S1 800s; S6 400s; v2 1km) → 2–3 min (S4 400/800/1000s @ 2 min; S5 "Santana" 3 min, "Rose" 2–4 min); sub-90 s only on ≤200 m sprints (S6: 60 s) | Was 90→60 s; **now 120→90 s** | **Adjusted** — prior late-plan 60 s sat below every source |
| Tempo dose | S6 6 km @ 85% ≈ 25–35 min; S5 core work 20–40 min | 18→30 min ramp | **In range** |
| Long endurance session | S5: longer efforts "in the range of 10k" belong in Hyrox programs; S6 long run 5–15 km weekly; S4 weekly "Ultra" 50+ min | Long day 5→8 mi (8–13 km) by level | **In range** |
| Full race simulation | v2: one, 14 d out; S2: "race simulations"; S6: weekly full-race practice @ 75–80% in final block; S3/S4: none (equipment) | One full-effort sim 10–17 d out + half sim + spec day | **In range, conservative end** — S6-style extra submax practice is a candidate enhancement |
| Station volumes | S6: some stations at full race distance from wk 1 (row 1000 m), sleds 50 m mid-plan; v2: per-station fulls from wk 4–5, all-8 by wk 8 | 50%→100% circuit ramp + full-distance spec day + sims | **In range, conservative end** |
| Periodization shape | S3/S4: named blocks 2-2-2-1-1 (Base/Pace/Accelerate/Prime/Race); S6: 4-4-4 blocks; v2: build/cutback waves | Continuous ramp with base/build/peak/taper labels | **Equivalent structure**, different framing — expert-review question |
| Race week | S4 wk 8: volume drop, build-to-sprint touches, optional 20–30 min shakeout; v2: rest D-1 + short shakeout | Volume drop, light station form work, shakeout ≤25 min | **In range** |
| Strength training | S5: classic lifts (squat/deadlift/bench) "should be included"; S6: dedicated strength day, 4×8-10 → heavier 3×6-8 → supersets | Dedicated strength day; heavy lifts in build (P3) | **In range** |
| Warm-up | S5: 10–15 min (5 general + 10 specific) | 10–15 min structured warmups on quality days | **In range** |
| Session durations | S5: 20–40 min core, longer (≤60+) regularly, race ≈ 90 min | 30–110 min (sim day longest) | **In range** (sim day exceeds class guidance by design — it rehearses the ~90-min race) |

**Changes made from this benchmark:** interval rest raised to 120→90 s; compromised-running intro added to the base phase; citations upgraded on five heuristics. **Not changed:** station ramp and single-full-sim count (both inside observed range at the conservative end — flagged as expert-review questions), block framing.

## How this audit gets better

1. **Benchmark matrix** — extend with further published plans (each new source either tightens the observed range or exposes a deviation to fix/justify).
2. **Expert review** — a certified Hyrox coach reviews generated personas (first-timer, intermediate 12-week, clamped 4-week, Pro) against exactly the open questions above.
3. **Outcome data** — full-simulation splits vs. race-day splits, once a cohort has raced.
