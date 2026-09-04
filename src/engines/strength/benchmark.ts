/**
 * The strength benchmark — measuring capacity instead of guessing it.
 *
 * Until now every prescribed load came from a static string in the
 * exercise library ("20-30 lb dumbbell") scaled by ONE multiplier keyed
 * off a three-option onboarding self-report. That model cannot tell 10
 * push-ups from 100, which is exactly the complaint: the weights are
 * vague because the app has never measured anything.
 *
 * This module defines the test, stores what it measured, and turns those
 * measurements into prescriptions. Two rules run through all of it:
 *
 *  1. NEVER prescribe above what was measured. Every mapping here is a
 *     fraction of a tested maximum, not an extrapolation past it. An
 *     untested athlete keeps the old conservative self-report behaviour —
 *     absent data means careful, never optimistic.
 *  2. A measurement expires. Capacity moves under training, so a stale
 *     benchmark is a wrong benchmark; past RETEST_WEEKS the plan asks for
 *     a re-test rather than quietly trusting an old number.
 */

import { daysBetween } from '../../utils/planDates'

export type BenchmarkItemId =
  | 'push_ups'
  | 'goblet_squat'
  | 'plank'
  | 'wall_balls'      // Hyrox
  | 'sled_push'       // Hyrox
  | 'erg_500'         // Hyrox
  | 'erg_1k'          // Hyrox

export type BenchmarkUnit = 'reps' | 'lb' | 'seconds' | 'rpe'

export interface BenchmarkItem {
  id: BenchmarkItemId
  label: string
  /** What the athlete actually does. */
  protocol: string
  unit: BenchmarkUnit
  /** Why this test earns its place in a 30-minute session. */
  why: string
  /** Hyrox-only items are skipped for general-conditioning athletes. */
  hyroxOnly?: boolean
  /** Sanity bounds — a typo shouldn't become a prescription. */
  min: number
  max: number
}

/** Re-test cadence. Strength adaptations in novice/intermediate lifters
 *  are measurable inside 4–6 weeks, which is also short enough that a
 *  stale number never drives a whole block. */
export const RETEST_WEEKS = 5

export const BENCHMARK_ITEMS: BenchmarkItem[] = [
  {
    id: 'push_ups',
    label: 'Push-ups',
    protocol: 'As many clean reps as you can in one set. Stop when form breaks — not when it hurts.',
    unit: 'reps',
    why: 'Sets every pressing prescription in your plan. This is the number that decides whether "3×15" is a warm-up or impossible.',
    min: 0,
    max: 200,
  },
  {
    id: 'goblet_squat',
    label: 'Goblet squat',
    protocol: 'Work up in 5–10 lb jumps until you find the heaviest weight you can move for 8 clean reps. Rest 2 min between attempts.',
    unit: 'lb',
    why: 'Anchors every lower-body load. Found once, it replaces the library’s generic "15-25 lb" guess for good.',
    min: 0,
    max: 200,
  },
  {
    id: 'plank',
    label: 'Plank hold',
    protocol: 'One hold, timed, stopping the moment your hips drop or your back sags.',
    unit: 'seconds',
    why: 'Calibrates every core hold. A 45-second prescription means something different to a 60-second athlete than a 240-second one.',
    min: 0,
    max: 600,
  },
  {
    id: 'wall_balls',
    label: 'Wall balls (unbroken)',
    protocol: 'At your race ball weight: maximum unbroken reps. Stop at the first break, not at failure.',
    unit: 'reps',
    hyroxOnly: true,
    why: 'The station that ends Hyrox races. Your unbroken number decides how the plan breaks the 75/100 into sets.',
    min: 0,
    max: 150,
  },
  {
    id: 'sled_push',
    label: 'Sled push effort',
    protocol: 'Push the sled at race weight for 25 m. Rate the effort 1–10 immediately afterwards.',
    unit: 'rpe',
    hyroxOnly: true,
    why: 'Sled weight is fixed by your division, so the variable is what it costs YOU. That decides how much sled work the plan prescribes.',
    min: 1,
    max: 10,
  },
  {
    id: 'erg_500',
    label: '500 m erg',
    protocol: 'One hard 500 m on the rower, from a standing start. Record the time in seconds.',
    unit: 'seconds',
    hyroxOnly: true,
    why: 'A clean read on your engine under upper-body load, and the pace anchor for every erg station in the plan.',
    min: 60,
    max: 300,
  },
  {
    id: 'erg_1k',
    label: '1000 m erg',
    protocol: 'A 1 km time trial on the rower or SkiErg. Enter the time as m:ss (e.g. 3:31).',
    unit: 'seconds',
    hyroxOnly: true,
    why: "Race distance for the erg stations — the monitor's own time is the source of truth, so enter what it read.",
    min: 150,
    max: 600,
  },
]

export interface StrengthCapacity {
  /** ISO date the benchmark was performed. */
  measuredAt: string
  pushUps?: number
  gobletSquatLb?: number
  plankSec?: number
  wallBallsUnbroken?: number
  sledRpe?: number
  erg500Sec?: number
  /** 1 km erg time — stored exactly as entered/recorded, never derived
   *  from the 500m split (monitor readings are the source of truth). */
  erg1kSec?: number
  /** True when the erg numbers were typed in by the athlete. Manual
   *  entry is athlete truth: auto-capture must never re-suggest over it. */
  ergManual?: boolean
}

export function itemsFor(kind: 'hyrox' | 'general'): BenchmarkItem[] {
  return BENCHMARK_ITEMS.filter(i => kind === 'hyrox' || !i.hyroxOnly)
}

/** Weeks since the benchmark, or null when never measured. */
export function weeksSince(capacity: StrengthCapacity | null | undefined, todayIso: string): number | null {
  if (!capacity?.measuredAt) return null
  // Whole DAYS first, then weeks. Dividing raw milliseconds by a week loses a
  // week whenever a DST spring-forward falls in the interval: local noon to
  // local noon across it is 35 days MINUS an hour, which floors to 4 weeks
  // and quietly makes a stale benchmark look fresh. `daysBetween` rounds, so
  // the missing hour cannot move the day count.
  const days = daysBetween(capacity.measuredAt, todayIso)
  if (!Number.isFinite(days)) return null
  return Math.max(0, Math.floor(days / 7))
}

export function isStale(capacity: StrengthCapacity | null | undefined, todayIso: string): boolean {
  const w = weeksSince(capacity, todayIso)
  return w !== null && w >= RETEST_WEEKS
}

/** True when the benchmark has at least one usable measurement. */
export function hasAnyMeasurement(c: StrengthCapacity | null | undefined): boolean {
  if (!c) return false
  return [c.pushUps, c.gobletSquatLb, c.plankSec, c.wallBallsUnbroken, c.sledRpe, c.erg500Sec]
    .some(v => typeof v === 'number' && Number.isFinite(v))
}

// ── Measurement → prescription ────────────────────────────────────────
//
// Working sets sit at a fraction of a tested maximum so multiple sets are
// repeatable. The fractions below are deliberately conservative; the
// progression layer moves them up from evidence, which is the whole point
// of measuring in the first place.

/** Fraction of a single-set max used for repeated working sets. */
const WORKING_FRACTION = 0.6
/** Fraction of an 8-rep max used as the working load. */
const LOAD_FRACTION = 0.9

export interface Prescription {
  /** Rendered prescription, e.g. "18 reps" or "35 lb". */
  text: string
  /** True when this came from a measurement rather than a self-report. */
  measured: boolean
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

export function prescribePushUps(c: StrengthCapacity | null | undefined): Prescription | null {
  if (typeof c?.pushUps !== 'number') return null
  // Below ~5 reps, sets of full push-ups aren't the right exercise yet.
  if (c.pushUps < 5) {
    return { text: 'incline push-ups (hands on a bench) — build to 5 clean floor reps first', measured: true }
  }
  return { text: `${Math.max(3, Math.round(c.pushUps * WORKING_FRACTION))} reps`, measured: true }
}

export function prescribeGobletSquat(c: StrengthCapacity | null | undefined): Prescription | null {
  if (typeof c?.gobletSquatLb !== 'number' || c.gobletSquatLb <= 0) return null
  return { text: `${round5(c.gobletSquatLb * LOAD_FRACTION)} lb`, measured: true }
}

export function prescribePlank(c: StrengthCapacity | null | undefined): Prescription | null {
  if (typeof c?.plankSec !== 'number' || c.plankSec <= 0) return null
  return { text: `${Math.max(15, Math.round((c.plankSec * WORKING_FRACTION) / 5) * 5)}s`, measured: true }
}

export function prescribeWallBalls(c: StrengthCapacity | null | undefined, totalReps: number): Prescription | null {
  if (typeof c?.wallBallsUnbroken !== 'number' || c.wallBallsUnbroken <= 0) return null
  const perSet = Math.max(5, Math.round(c.wallBallsUnbroken * WORKING_FRACTION))
  const sets = Math.max(1, Math.ceil(totalReps / perSet))
  return { text: `${sets}×${perSet} (your unbroken set is ${c.wallBallsUnbroken})`, measured: true }
}

/**
 * The line the plan shows when a benchmark exists — what was measured and
 * how old it is. Null when there's nothing to say.
 */
export function capacitySummary(c: StrengthCapacity | null | undefined, todayIso: string): string | null {
  if (!hasAnyMeasurement(c)) return null
  const parts: string[] = []
  if (typeof c!.pushUps === 'number') parts.push(`${c!.pushUps} push-ups`)
  if (typeof c!.gobletSquatLb === 'number') parts.push(`${c!.gobletSquatLb} lb goblet squat`)
  if (typeof c!.plankSec === 'number') parts.push(`${c!.plankSec}s plank`)
  if (typeof c!.wallBallsUnbroken === 'number') parts.push(`${c!.wallBallsUnbroken} unbroken wall balls`)
  if (typeof c!.erg500Sec === 'number') parts.push(`${c!.erg500Sec}s / 500 m`)
  const weeks = weeksSince(c, todayIso)
  const age = weeks === null ? '' : weeks === 0 ? ' (this week)' : ` (${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago)`
  return `Loads set from your benchmark${age}: ${parts.join(' · ')}.`
}

// ── The session itself ────────────────────────────────────────────────

export function benchmarkDetail(kind: 'hyrox' | 'general', retest: boolean): string {
  const items = itemsFor(kind)
  const head = retest
    ? 'RE-TEST — same protocol as your first benchmark, so the numbers are comparable. Expect them to have moved.'
    : 'BENCHMARK — this replaces today’s strength session. Nothing here is scored; it just tells the plan what your loads should actually be.'
  const body = items.map(i => `${i.label}: ${i.protocol}`).join(' · ')
  return `${head} Warm up 10 min easy, then: ${body} · Rest fully between tests — this is a measurement, not a workout. Log your numbers when you're done and every load in your plan re-prescribes from them.`
}

export function benchmarkWorkoutName(retest: boolean): string {
  return retest ? 'STRENGTH BENCHMARK: re-test' : 'STRENGTH BENCHMARK: baseline'
}

/** Which plan weeks host the benchmark: week 1, then every RETEST_WEEKS. */
export function isBenchmarkWeek(weekNum: number, totalWeeks: number): boolean {
  if (weekNum === 1) return true
  // Never in the last two weeks — taper and race week are not for testing.
  if (weekNum > totalWeeks - 2) return false
  return (weekNum - 1) % RETEST_WEEKS === 0
}
