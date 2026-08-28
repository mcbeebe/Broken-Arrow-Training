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
  /** 500m split from the erg half of a Hyrox benchmark — the "erg
   *  baseline" the zones_estimated advisory asks for, read straight
   *  from the recording instead of a Settings form. */
  suggestedErg500Sec: number | null
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

type DayActual = NonNullable<TrainingWeek['days'][number]['actual']>

/**
 * The recording that best represents the test effort on a benchmark
 * day. A short standalone TT often fails the duration-share matching
 * gate and lands in secondaryActuals — the benchmark loop must still
 * see it, so: the primary actual when present, else the hardest
 * secondary (highest avg HR, then longest).
 */
function pickTestActual(day: TrainingWeek['days'][number]): DayActual | null {
  if (day.actual && day.actual.movingTime > 0) return day.actual
  const secondaries = (day.secondaryActuals ?? []).filter(a => a.movingTime > 0)
  if (secondaries.length === 0) return null
  return [...secondaries].sort((a, b) =>
    (b.avgHR ?? 0) - (a.avgHR ?? 0) || b.movingTime - a.movingTime,
  )[0]
}

function benchmarkSourceOf(day: TrainingWeek['days'][number]): BenchmarkSource | undefined {
  const byId = day.plannedWorkout?.workoutId ? BENCHMARK_WORKOUT_IDS[day.plannedWorkout.workoutId] : undefined
  const byText = /\bBENCHMARK\b/i.test(day.workout ?? '')
    ? (/1\s*km/i.test(day.workout) ? 'hyrox_1km_tt' as const : 'method_20min_tt' as const)
    : undefined
  return byId ?? byText
}

/**
 * ISO date of the most recent benchmark day (on/before today) with ANY
 * recording — primary or secondary. Null when no benchmark has been
 * done. Drives retiring the zones_estimated advisory: once the athlete
 * has actually tested, "estimated until you test" is stale.
 */
export function benchmarkCompletedIso(weeks: TrainingWeek[], todayIso: string): string | null {
  let latest: string | null = null
  for (const week of weeks) {
    for (const day of week.days) {
      if (!benchmarkSourceOf(day)) continue
      if (!pickTestActual(day)) continue
      const isoDate = dayIsoInWeek(day.day, week, todayIso)
      if (!isoDate || isoDate > todayIso) continue
      if (!latest || isoDate > latest) latest = isoDate
    }
  }
  return latest
}

const ERG_TYPE = /row|ski|erg/i
const MILE_M = 1609.344

/**
 * 500m split from the erg recording on a Hyrox benchmark day. Trusts
 * only a recording that plausibly IS the ~1000m baseline piece: erg-
 * typed, with either a distance near 1 km or (distance unrecorded) a
 * duration in the 2.5–7 min band.
 */
function ergSplitFrom(day: TrainingWeek['days'][number]): { sec: number; iso500: number } | null {
  const candidates = [day.actual, ...(day.secondaryActuals ?? [])]
    .filter((a): a is DayActual => a != null && a.movingTime > 0 && ERG_TYPE.test(a.type ?? ''))
  for (const a of candidates) {
    // A TT's true time is the piece's ELAPSED time — Garmin's "moving"
    // duration drops pauses between strokes and under-reads an erg
    // effort (field case: 3:34 piece reported as ~3:00 moving → a
    // fictitious 1:30/500m).
    const sec = Math.max(a.movingTime, a.elapsedTime ?? 0)
    const meters = a.distance > 0 ? a.distance * MILE_M : null
    if (meters != null && meters >= 630 && meters <= 1500) {
      return { sec, iso500: Math.round((sec / meters) * 500) }
    }
    if (meters == null && sec >= 150 && sec <= 420) {
      return { sec, iso500: Math.round(sec / 2) }
    }
  }
  return null
}

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
  currentErg500Sec: number | null = null,
): BenchmarkResultAssessment {
  const none: BenchmarkResultAssessment = {
    qualifies: false, source: null, isoDate: null, workout: null,
    ttAvgHR: null, observedMaxHR: null, suggestedLthr: null,
    suggestedMaxHR: null, suggestedErg500Sec: null, currentMaxHR, currentLthr, evidence: [],
  }

  // Most recent completed benchmark day on/before today — primary OR
  // secondary recording (a short standalone TT recording routinely
  // fails the duration-share matching gate). (Plain loops, not
  // forEach — tsc's build-mode control-flow analysis can't see assignments
  // made inside callbacks and types `best` as never after the null check.)
  let best: { source: BenchmarkSource; isoDate: string; workout: string; day: TrainingWeek['days'][number]; actual: DayActual } | null = null
  for (const week of weeks) {
    for (const day of week.days) {
      const source = benchmarkSourceOf(day)
      if (!source) continue
      const actual = pickTestActual(day)
      if (!actual) continue
      const isoDate = dayIsoInWeek(day.day, week, todayIso)
      if (!isoDate || isoDate > todayIso) continue
      if (!best || isoDate > best.isoDate) best = { source, isoDate, workout: day.workout, day, actual }
    }
  }
  if (!best) return none
  const { source, isoDate, workout, day, actual } = best

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

  // The erg half of a Hyrox benchmark: read the 500m split straight
  // from the erg recording — the "erg baseline" the advisory asks the
  // athlete to type into a Settings form that never existed.
  let suggestedErg500Sec: number | null = null
  if (source === 'hyrox_1km_tt') {
    const erg = ergSplitFrom(day)
    if (erg && (currentErg500Sec == null || Math.abs(erg.iso500 - currentErg500Sec) >= 2)) {
      suggestedErg500Sec = erg.iso500
      const m = Math.floor(erg.iso500 / 60)
      const s = String(erg.iso500 % 60).padStart(2, '0')
      evidence.push(
        `Erg baseline (${isoDate}): ${m}:${s} /500m read from the recording — saved to your measured benchmarks on Apply`,
      )
    }
  }

  return {
    qualifies: suggestedLthr != null || suggestedMaxHR != null || suggestedErg500Sec != null,
    source,
    isoDate,
    workout,
    ttAvgHR,
    observedMaxHR,
    suggestedLthr,
    suggestedMaxHR,
    suggestedErg500Sec,
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
