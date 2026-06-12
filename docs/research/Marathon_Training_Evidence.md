# Evidence base — distance-aware volume, long runs, and goal-pace personalization

This note documents the research the plan engine's volume, long-run, and
goal-pace logic is built on. It backs the changes in
`src/engines/planGenerator/weekPlan.ts` (distance-aware peak + long-run caps)
and `src/engines/planGenerator/paceTargets.ts` + `generatePlan.ts` (current →
goal pace progression).

## Weekly volume & ramp

- **Build by ~10%/week with periodic cutbacks.** The widely-taught guideline is
  to increase weekly volume gradually (~10%/wk) and insert a recovery/cutback
  week roughly every 3–4 weeks (a 3:1 build:cutback rhythm). The engine already
  caps week-over-week growth via `maxWeeklyIncreasePct` and inserts cutbacks via
  `cutbackEveryNWeeks`; the distance-aware peak feeds a higher (but still
  ramp-limited) ceiling.
- **Peak volume scales with goal distance.** A committed marathoner building off
  a modest base should trend toward meaningfully higher peak mileage than a 5K
  athlete off the same base. Established marathon plans peak in the ~40–55
  mi/wk range for intermediate runners (e.g. Pfitzinger "18/55" peaks at 55).
  The engine encodes this as `DISTANCE_PEAK_MULT` — a floor on the
  multiplier-of-current that the method value can still exceed, with the ramp
  cap and plan runway keeping it safe.
  - Pfitzinger plan structure: https://fellrnr.com/wiki/Pfitzinger

## The long run

- **20–30% of weekly volume, capped by time/distance.** The RRCA guidance is
  that the long run should be roughly 20–30% of weekly mileage. Daniels caps the
  long run at ~2.5–3 hours regardless of pace, and for lower-mileage runners the
  binding constraint is **time on feet**, not a percentage. The engine therefore
  takes the *min* of: a distance-appropriate share of weekly volume (`LONG_PCT`,
  raised to ~0.40 for the marathon so low-mileage athletes still accumulate real
  long-run volume), an absolute distance ceiling (`LONG_MAX_MI`, ~20–22 mi for
  the marathon), and a time ceiling (`LONG_TIME_CAP_MIN`, ~180 min for the
  marathon) translated into miles via the athlete's easy pace.
  - https://runnersconnect.net/running-questions/how-long-should-the-marathon-long-run-be/
  - https://www.rogueruncoaching.com/blog/the-long-run-solved-how-long-should-your-longest-run-be-half-amp-full-the-why

This is what fixes the reported "marathon long run is 4.6 mi" defect: a flat
30%-of-a-tiny-base long run is replaced by a distance-aware target that scales
to ~18–20 mi at peak for a marathon build, while never overrunning the ~22 mi /
3 h ceilings.

## VDOT, equivalent performances, and goal pace

- **Training paces derive from VDOT.** Daniels' VDOT maps a recent race
  performance to a fitness number and to per-zone training paces (Easy /
  Marathon / Threshold / Interval / Repetition). The engine implements this in
  `vdot.ts` and uses it for both current-fitness and goal-fitness paces.
- **Equivalent-performance / Riegel.** Race times across distances relate by
  Riegel's `T₂ = T₁ × (D₂/D₁)^1.06`. A goal time implies a goal VDOT; comparing
  it to the athlete's current VDOT tells us how big a stretch the goal is.
  - https://runnersconnect.net/race-calculators/
- **Goal-pace personalization (current → goal).** Marathon-pace and race-pace
  workouts are run at goal effort by definition, so the engine shows them at goal
  pace immediately. Threshold/VO₂/rep paces progress from current fitness toward
  goal fitness across the build; easy/recovery paces stay anchored to current
  fitness (you recover at the ability you have today). A **realism cap** limits
  the goal to ~8% VDOT above current fitness — roughly the most a single focused
  block yields — so the plan never prescribes paces the athlete has no path to.

## Adaptivity (next phase)

The follow-up adaptive layer re-baselines volume and paces from logged training
and readiness (ACWR/TSB), surfaced as one-tap proposals. Supporting literature
on autoregulation and readiness-based adjustment:

- https://link.springer.com/article/10.1186/s13102-025-01495-7
- https://www.biorxiv.org/content/10.1101/2023.10.06.561160.full.pdf
