import type { HRZone, TrainingWeek } from '../../types'
import { dayIsoInWeek } from '../../utils/planDates'
import { parseZoneRange } from '../../utils/zones'

/**
 * 4.1 completion — close the benchmark loop.
 *
 * Both generators schedule a week-1/2 benchmark when zones are
 * estimate-grade (method: 20-min time trial, `benchmark_20min_tt`;
 * Hyrox: 1 km TT + erg baseline, `hyrox_benchmark_1km`) and the
 * zones_estimated advisory promises the plan will update from the
 * result. Until now nothing read the result back.
 *
 * This module ASSESSES the most recent completed benchmark and derives:
 *  - a suggested LTHR from the 20-min TT (Friel field-test convention:
 *    LTHR ≈ 95% of the TT's average HR) — the anchor method plans are
 *    built on;
 *  - a suggested maxHR when the session's observed max exceeds the
 *    configured one (an observed max is a hard floor on true max) —
 *    the anchor the Hyrox %maxHR ladder is built on.
 *
 * Delivery follows the locked G5 contract (see recalibration.ts): this
 * module only assesses. Changes land exclusively through the athlete
 * tapping Apply on BenchmarkResultCard — zone-table save + undoable
 * plan-edit ops (rezoneByAnchor.ts), never silently.
 *
 * The 1 km TT is deliberately NOT used for LTHR — a ~4-minute all-out
 * effort sits above threshold, so its avg HR would inflate the anchor.
 * It still contributes the observed-max floor.
 */

export type BenchmarkSource = 'method_20min_tt' | 'hyrox_1km_tt'

export interface BenchmarkResultAssessment {
  qualifies: boolean
  source: BenchmarkSource | null
  isoDate: string | null
  workout: string | null
  /** Average HR over the test effort (fastest splits when available —
   *  whole-session avg includes warm-up and under-reads). */
  ttAvgHR: number | null
  observedMaxHR: number | null
  /** Friel 95%-of-20-min-TT estimate; null when the source can't
   *  support an LTHR read or the delta isn't worth an update. */
  suggestedLthr: number | null
  /** Observed session max when it exceeds the configured maxHR. */
  suggestedMaxHR: number | null
  currentMaxHR: number
  currentLthr: number
  evidence: string[]
}

const BENCHMARK_WORKOUT_IDS: Record<string, BenchmarkSource> = {
  benchmark_20min_tt: 'method_20min_tt',
  hyrox_benchmark_1km: 'hyrox_1km_tt',
}

/** Friel 20-min field test: LTHR ≈ 95% of the TT's average HR. */
const LTHR_FROM_20MIN_TT = 0.95
/** Deltas below these aren't worth re-anchoring over. */
const MIN_LTHR_DELTA_BPM = 3
const MIN_MAXHR_DELTA_BPM = 2
/** Physiological sanity window — outside it, assume a bad strap. */
const MIN_PLAUSIBLE_TT_HR = 120
const MAX_PLAUSIBLE_HR = 230

function paceStrToSec(pace: string): number | null {
  const m = pace.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/**
 * Best-available HR for the test effort itself: the average HR of the 3
 * fastest recorded splits (the TT miles) when the activity carries
 * per-split HR, else the whole-session average (conservative — includes
 * warm-up/cool-down).
 */
function testEffortHR(actual: NonNullable<TrainingWeek['days'][number]['actual']>): { hr: number | null; fromSplits: boolean } {
  const splits = (actual.splits ?? []).filter(s => s.hr && s.hr > 0 && paceStrToSec(s.pace) != null)
  if (splits.length >= 3) {
    const fastest = [...splits].sort((a, b) => paceStrToSec(a.pace)! - paceStrToSec(b.pace)!).slice(0, 3)
    const avg = Math.round(fastest.reduce((s, x) => s + x.hr!, 0) / fastest.length)
    return { hr: avg, fromSplits: true }
  }
  return { hr: actual.avgHR && actual.avgHR > 0 ? Math.round(actual.avgHR) : null, fromSplits: false }
}

export function assessBenchmarkResult(
  weeks: TrainingWeek[],
  todayIso: string,
  currentMaxHR: number,
  currentLthr: number,
): BenchmarkResultAssessment {
  const none: BenchmarkResultAssessment = {
    qualifies: false, source: null, isoDate: null, workout: null,
    ttAvgHR: null, observedMaxHR: null, suggestedLthr: null,
    suggestedMaxHR: null, currentMaxHR, currentLthr, evidence: [],
  }

  // Most recent completed benchmark day on/before today. (Plain loops, not
  // forEach — tsc's build-mode control-flow analysis can't see assignments
  // made inside callbacks and types `best` as never after the null check.)
  let best: { source: BenchmarkSource; isoDate: string; workout: string; actual: NonNullable<TrainingWeek['days'][number]['actual']> } | null = null
  for (const week of weeks) {
    for (const day of week.days) {
      const byId = day.plannedWorkout?.workoutId ? BENCHMARK_WORKOUT_IDS[day.plannedWorkout.workoutId] : undefined
      const byText = /\bBENCHMARK\b/i.test(day.workout ?? '')
        ? (/1\s*km/i.test(day.workout) ? 'hyrox_1km_tt' as const : 'method_20min_tt' as const)
        : undefined
      const source = byId ?? byText
      if (!source) continue
      const actual = day.actual
      if (!actual || !(actual.movingTime > 0)) continue
      const isoDate = dayIsoInWeek(day.day, week, todayIso)
      if (!isoDate || isoDate > todayIso) continue
      if (!best || isoDate > best.isoDate) best = { source, isoDate, workout: day.workout, actual }
    }
  }
  if (!best) return none
  const { source, isoDate, workout, actual } = best

  const { hr: ttAvgHR, fromSplits } = testEffortHR(actual)
  const observedMaxHR =
    actual.maxHR && actual.maxHR > 0 && actual.maxHR <= MAX_PLAUSIBLE_HR
      ? Math.round(actual.maxHR)
      : null

  const evidence: string[] = []

  let suggestedLthr: number | null = null
  if (source === 'method_20min_tt' && ttAvgHR != null && ttAvgHR >= MIN_PLAUSIBLE_TT_HR) {
    const lthr = Math.round(ttAvgHR * LTHR_FROM_20MIN_TT)
    if (Math.abs(lthr - currentLthr) >= MIN_LTHR_DELTA_BPM) {
      suggestedLthr = lthr
      evidence.push(
        `20-min time trial (${isoDate}): avg ${ttAvgHR} bpm${fromSplits ? ' over the fastest splits' : ''} ` +
        `→ LTHR ≈ ${lthr} bpm (95% of test avg, Friel field-test convention) vs ${currentLthr} estimated`,
      )
    }
  }

  let suggestedMaxHR: number | null = null
  if (observedMaxHR != null && observedMaxHR >= currentMaxHR + MIN_MAXHR_DELTA_BPM) {
    suggestedMaxHR = observedMaxHR
    evidence.push(
      `Session max ${observedMaxHR} bpm exceeds your configured max HR (${currentMaxHR}) — ` +
      `an observed max is a floor on your true max`,
    )
  }

  return {
    qualifies: suggestedLthr != null || suggestedMaxHR != null,
    source,
    isoDate,
    workout,
    ttAvgHR,
    observedMaxHR,
    suggestedLthr,
    suggestedMaxHR,
    currentMaxHR,
    currentLthr,
    evidence,
  }
}

/**
 * Scale an HRZone table's bpm ranges by newMaxHR/oldMaxHR, preserving
 * zone labels, % strings, and descriptions. Used when a benchmark raises
 * maxHR so the Settings zone table follows the same anchor the plan
 * strings are being rewritten to.
 */
export function scaleZoneTable(zones: HRZone[], oldMaxHR: number, newMaxHR: number): HRZone[] {
  if (!(oldMaxHR > 0) || !(newMaxHR > 0) || oldMaxHR === newMaxHR) return zones
  const ratio = newMaxHR / oldMaxHR
  return zones.map(z => {
    const r = parseZoneRange(z.hr)
    if (!r) return z
    return { ...z, hr: `${Math.round(r.low * ratio)}–${Math.round(r.high * ratio)}` }
  })
}
