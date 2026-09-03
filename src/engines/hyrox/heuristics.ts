/**
 * The Hyrox engine's training-prescription constants, tiered (P4 follow-up:
 * methodology audit).
 *
 * Everything here is a JUDGMENT CALL, not physics: the race spec next door
 * (spec.ts) is verifiable against the rulebook, but progression rates,
 * simulation timing, and session doses have no peer-reviewed Hyrox
 * literature behind them — the sport is too young. What exists is
 * practitioner consensus, sampled so far from two published guides
 * (STRIDE Fitness's 12-week HYROX guide; PureGym's 8/12-week plans) plus
 * general periodization principles.
 *
 * Routing the numbers through TieredValue does two things:
 *  1. The generator READS its constants from here, so behavior can never
 *     drift from the documented value silently.
 *  2. The unverified surface is enumerable — docs/hyrox-evidence-audit.md
 *     renders from this registry, and it is the target list for expert
 *     review and for benchmarking against further published programs.
 *
 * Tier meanings here: T3 = derived from the verified race format;
 * T4 = coaching heuristic awaiting corroboration. Upgrade a tier only
 * with a citable source, never to make an audit look better.
 */
import { tier, type TieredValue } from '../evidence'

/** Station-volume ramp across the build: fraction of race volume at plan
 *  start → at the final pre-taper week; recovery weeks train at a
 *  fraction of the ramp. */
export const STATION_RAMP: TieredValue<{ startPct: number; endPct: number; recoveryMult: number; recoveryFloorPct: number }> = tier(
  { startPct: 0.5, endPct: 1.0, recoveryMult: 0.6, recoveryFloorPct: 0.3 },
  'T4',
  'Progressive overload to race spec. Benchmarked spread is wide: the v2 rebuild opened ~40-75% of spec per station and reached all-8 by week 8; the 12-week program puts SOME stations at full race distance from week 1 (row 1000m) and sleds at 50m from mid-plan. Our 50% opening sits at the conservative edge of the observed range — defensible for volume-managed circuits since the spec day and simulations guarantee full-distance exposure. Expert-review target: per-level opening fractions.',
)

/** Full 8+8 race simulation: days before race day. The validator floor
 *  (min) is the recovery window a full sim demands; the max keeps it
 *  close enough to predict race day. */
export const FULL_SIM_DAYS_OUT: TieredValue<{ min: number; max: number }> = tier(
  { min: 10, max: 17 },
  'T4',
  'Practitioner consensus centers on ~14 days out for the race-effort simulation (v2 rebuild: exactly 14; PureGym includes race sims). The 12-week program goes further — weekly FULL race practice at 75-80% effort through its final block — so our single full-effort sim is the conservative end of observed practice; its submax weekly practice is partially covered by our half sim + compromised sessions. Min 10 days = recovery window for a race-effort simulation.',
)

/** Half simulation (4 runs + 4 stations): days before race day. */
export const HALF_SIM_DAYS_OUT: TieredValue<{ min: number; max: number }> = tier(
  { min: 18, max: 27 },
  'T4',
  'Coaching convention: a rehearsal one runway step before the full simulation, spaced ~1 week apart. The v2 rebuild placed its half sim 21 days out.',
)

/** All-stations-at-full-spec technique day: days before race day. */
export const SPEC_DAY_DAYS_OUT: TieredValue<{ min: number; max: number }> = tier(
  { min: 24, max: 42 },
  'T4',
  'Coaching convention: meet full race volumes with generous rest BEFORE they appear under fatigue in the simulations. The v2 rebuild hit all-8-at-spec in its final build week (~4 weeks out).',
)

/** Compromised running (run→station→run): rounds per session and weekly
 *  cadence (alternating with the station circuit); introduced from the
 *  base phase at conversational effort. */
export const COMPROMISED_DOSE: TieredValue<{ rounds: number; cadenceWeeks: number; introRounds: number }> = tier(
  { rounds: 3, cadenceWeeks: 2, introRounds: 2 },
  'T4',
  'The single best-corroborated element — every benchmarked source interleaves running with station work: STRIDE (combo work 1×/wk), PureGym (weekly "Compromised run"), the HYROX 8-Week Formula (Base block exists to familiarize "strength movements and compromised running"), the GORUCK×HYROX plan (run+work in nearly every session), the 12-week program (weekly "Hyrox Simulation" day from week 1), and the official HYROX Manual\'s workout library (run↔movement alternation throughout). Base-phase intro at reduced rounds follows the Formula; the 3-round dose is convention.',
)

/** Race-pace km-repeat rest interval: seconds early in the plan → late
 *  (past `lateAt` progress). */
export const INTERVAL_REST: TieredValue<{ earlySec: number; lateSec: number; lateAt: number }> = tier(
  { earlySec: 120, lateSec: 90, lateAt: 0.6 },
  'T4',
  'Benchmarked range for ~km race-pace repeats: 90s (STRIDE 800s; v2 rebuild 1km; 12-week program 400s) to 2-3 min (GORUCK 400s/1000s/800s at 2 min; HYROX Manual "Santana" 400s at 3 min, "Rose" 800s at 4 min). Sub-90s rests appear only on ≤200m sprints (12-week program: 200s at 60s). We progress 120s → 90s, finishing at the observed floor for km reps — the prior 60s late-plan value sat below every benchmarked source and was raised in the 2026-08 benchmark.',
)

/** Tempo-block minutes at plan start → final pre-taper week. */
export const TEMPO_MINUTES: TieredValue<{ start: number; end: number }> = tier(
  { start: 18, end: 30 },
  'T4',
  'Threshold work at 20-30 min per session is standard endurance practice (~50% of race time is running — PureGym), and the 12-week program\'s mid-block 6km tempo at 85% lands at ~25-35 min — our 18→30 ramp sits inside it. The official Manual\'s session-duration guidance (20-40 min core work, longer sessions regularly because the race averages ~90 min) also brackets this dose.',
)

/** Layered season track (Hyrox prep inside another race\'s build):
 *  station-volume fraction at the first eligible week → the last, and
 *  the mid-point dose escalation (sessions/week). */
export const LAYERED_RAMP: TieredValue<{ startPct: number; endPct: number; maxDosesPerWeek: number }> = tier(
  { startPct: 0.35, endPct: 0.75, maxDosesPerWeek: 2 },
  'T4',
  'Compromise-session doctrine: the anchor race owns the plan, so layered station work stays submaximal (35-75% of spec) and ≤2 doses/week. Direction follows Issurin residuals (short-residual qualities trained closer to their race); magnitudes are convention.',
)

/** Layered session eased beside a hard run: the multiplier applied to
 *  station volume and strength-endurance reps when the only slot the
 *  transform can reach sits the day before or after a quality or long run. */
export const LAYERED_EASED_MULT: TieredValue<number> = tier(
  0.7,
  'T4',
  'Compromise-session doctrine applied to placement: the anchor race owns the plan, so a layered session adjacent to that week\'s quality or long run is eased rather than moved or dropped. A veto was measured to zero layering out entirely for half the tested configurations (every reachable strength/cross slot in a 5-day week is adjacent to something hard), which silently re-creates the "we said we would layer it and did not" defect. Magnitude is convention.',
)

/** Taper week (the final full week before race week): volume multiplier
 *  on runs/stations and rep multiplier on intervals — volume drops,
 *  intensity stays. */
export const TAPER_WEEK: TieredValue<{ volumeMult: number; repsMult: number; stationPct: number }> = tier(
  { volumeMult: 0.65, repsMult: 0.5, stationPct: 0.5 },
  'T4',
  'Cut volume ~35%, preserve intensity (Hickson et al. 1985 — reduced intensity, not volume, causes fitness loss). Corroborated in shape by the GORUCK plan (light race week after a full Prime block) and the v2 rebuild (taper weeks at 65-70% with quality kept). The 2026-08 persona sweep found the pre-P5 generator had NO taper week — the final full week was the biggest.',
)

/** Masters recovery cadence: athletes at/above the age threshold get a
 *  recovery week every `cadenceWeeks` instead of the default 4. */
export const MASTERS_RECOVERY: TieredValue<{ ageThreshold: number; cadenceWeeks: number }> = tier(
  { ageThreshold: 58, cadenceWeeks: 3 },
  'T4',
  'Masters-athlete coaching convention: recovery need rises with age and none of the benchmarked sources age-adjust at all — this is a deliberate improvement past the observed sources, flagged for expert review (threshold and cadence are both judgment calls).',
)

/** Everything above, enumerable for the audit doc and tests. */
export const HYROX_HEURISTICS: Record<string, TieredValue<unknown>> = {
  STATION_RAMP,
  FULL_SIM_DAYS_OUT,
  HALF_SIM_DAYS_OUT,
  SPEC_DAY_DAYS_OUT,
  COMPROMISED_DOSE,
  INTERVAL_REST,
  TEMPO_MINUTES,
  LAYERED_RAMP,
  LAYERED_EASED_MULT,
  TAPER_WEEK,
  MASTERS_RECOVERY,
}
