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
  'Coaching convention (progressive overload to race spec). Corroborated in direction, not magnitude: STRIDE and PureGym both build station volume toward race distances; neither publishes a ramp curve. Expert-review target: is 50% the right opening fraction for each level?',
)

/** Full 8+8 race simulation: days before race day. The validator floor
 *  (min) is the recovery window a full sim demands; the max keeps it
 *  close enough to predict race day. */
export const FULL_SIM_DAYS_OUT: TieredValue<{ min: number; max: number }> = tier(
  { min: 10, max: 17 },
  'T4',
  'Practitioner consensus centers on ~14 days out (the v2 rebuild used exactly 14; PureGym includes race simulations; STRIDE prescribes race-pace combo work through the build). Min 10 days = recovery window for a race-effort simulation.',
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
 *  cadence (alternating with the station circuit). */
export const COMPROMISED_DOSE: TieredValue<{ rounds: number; cadenceWeeks: number }> = tier(
  { rounds: 3, cadenceWeeks: 2 },
  'T4',
  'The weekly run→station structure is the strongest-corroborated element: STRIDE prescribes combo work 1×/wk ("run 1km then complete a station immediately"); PureGym\'s weekly template includes a "Compromised run". The 3-round dose is convention; alternating with the circuit keeps total station volume in budget.',
)

/** 1km-repeat rest interval: seconds early in the plan → late (past
 *  `lateAt` progress). Short rests simulate running off a station. */
export const INTERVAL_REST: TieredValue<{ earlySec: number; lateSec: number; lateAt: number }> = tier(
  { earlySec: 90, lateSec: 60, lateAt: 0.7 },
  'T4',
  'STRIDE prescribes 4-6×800m at race pace with 90s rest; 1km repeats with 60-90s jog are the Hyrox-community standard for run-leg specificity. Tightening rest as race day nears mimics the shrinking recovery a fatigued Roxzone allows.',
)

/** Tempo-block minutes at plan start → final pre-taper week. */
export const TEMPO_MINUTES: TieredValue<{ start: number; end: number }> = tier(
  { start: 18, end: 30 },
  'T4',
  'Threshold work at 20-30 min per session is standard endurance practice (and ~50% of Hyrox race time is running — PureGym). The 18→30 ramp is convention; no Hyrox-specific dose study exists.',
)

/** Layered season track (Hyrox prep inside another race\'s build):
 *  station-volume fraction at the first eligible week → the last, and
 *  the mid-point dose escalation (sessions/week). */
export const LAYERED_RAMP: TieredValue<{ startPct: number; endPct: number; maxDosesPerWeek: number }> = tier(
  { startPct: 0.35, endPct: 0.75, maxDosesPerWeek: 2 },
  'T4',
  'Compromise-session doctrine: the anchor race owns the plan, so layered station work stays submaximal (35-75% of spec) and ≤2 doses/week. Direction follows Issurin residuals (short-residual qualities trained closer to their race); magnitudes are convention.',
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
}
