import type { PlannedDay, TrainingWeek, WorkoutType } from '../../types'
import { parsePlannedTargets } from '../../utils/targets'
import { dayIsoInWeek, isoFromLocalDate } from '../../utils/planDates'
import type { HRStream } from '../../utils/timeInZone'

/**
 * The adaptive engine's measurement spine (Phase 1, PR 1) — per-workout
 * execution scoring and the weekly advance/hold/ease verdict.
 *
 * This is where "how did training actually go" becomes typed evidence
 * the Monday Review argues from. Two design rules carried from the
 * proposal research:
 *
 *   1. TWO-DIRECTIONAL. The existing G5 recalibration only notices an
 *      athlete running FASTER than target; this module scores slower
 *      executions with equal honesty, because easing a struggling
 *      athlete's targets is the adjustment that prevents injuries.
 *   2. GRACEFUL DEGRADATION (the cross-platform safe default): no HR
 *      stream → judge by pace + completion; no pace targets → judge by
 *      completion alone; no data → no verdict, never a guess.
 *
 * Pure functions — streams and "today" are injected, nothing here reads
 * storage or the clock.
 */

// ─── Per-workout scoring ───────────────────────────────────────

export type WorkoutVerdict = 'strong' | 'ok' | 'struggled'

export interface WorkoutExecution {
  isoDate: string
  workout: string
  dayType: WorkoutType
  /** True when this was a quality/long session — the ones that decide
   *  progression. */
  keySession: boolean
  /** Fraction vs the planned pace mid: positive = slower than target
   *  (+0.05 = 5% slow), negative = faster. Undefined without targets. */
  paceDeltaFrac?: number
  /** Average HR relative to the planned band: bpm above hrHigh (positive)
   *  or below hrLow (negative); 0 inside the band. */
  hrDeltaBpm?: number
  /** Second-half vs first-half average HR across the session (%), from a
   *  cached per-second stream. The cardiac-drift proxy for "was this
   *  absorbed": <5 solid, 5–8 borderline, >8 not yet. */
  hrDriftPct?: number
  verdict: WorkoutVerdict
  reasons: string[]
}

/** Sessions whose execution gates progression decisions. */
function isKeySession(type: WorkoutType): boolean {
  return type === 'quality' || type === 'long'
}

const RUN_TYPES: ReadonlySet<WorkoutType> = new Set(['run', 'quality', 'long', 'race'])

/** Slower than target by more than this = a miss worth reacting to. */
const PACE_SLOW_FRAC = 0.04
/** At/under target pace = clean. Small tolerance for GPS noise. */
const PACE_HIT_FRAC = 0.01
/** HR this far above the band while pace was on target = bought with
 *  effort, not fitness (the repeat-don't-advance signature). */
const HR_OVER_BPM = 8
/** Ran under this share of planned distance = abandoned. */
const ABANDON_SHARE = 0.7

export function hrDriftFromStream(stream: HRStream | null | undefined): number | null {
  if (!stream || stream.heartrate.length < 60 || stream.time.length !== stream.heartrate.length) return null
  const n = stream.heartrate.length
  const half = Math.floor(n / 2)
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const first = avg(stream.heartrate.slice(0, half).filter(h => h > 0))
  const second = avg(stream.heartrate.slice(half).filter(h => h > 0))
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0) return null
  return Math.round(((second - first) / first) * 1000) / 10
}

/**
 * Score one completed run-class day. Null for non-run days, unlogged
 * days, and runs with no usable numbers (honesty over guessing).
 */
export function scoreWorkoutExecution(
  day: PlannedDay,
  isoDate: string,
  opts: { hrStream?: HRStream | null } = {},
): WorkoutExecution | null {
  const actual = day.actual
  if (!actual || !RUN_TYPES.has(day.type)) return null

  const targets = parsePlannedTargets(day)
  const reasons: string[] = []

  // Pace vs target mid (running-time estimate over planned distance).
  let paceDeltaFrac: number | undefined
  if (
    targets.distanceMi && targets.distanceMi > 0 &&
    targets.durationMinLow && targets.durationMinHigh &&
    actual.distance > 0 && actual.movingTime > 0
  ) {
    const targetMidSecMi = (((targets.durationMinLow + targets.durationMinHigh) / 2) * 60) / targets.distanceMi
    const actualSecMi = actual.movingTime / actual.distance
    paceDeltaFrac = Math.round((actualSecMi / targetMidSecMi - 1) * 1000) / 1000
  }

  // HR vs planned band.
  let hrDeltaBpm: number | undefined
  if (targets.hrLow != null && targets.hrHigh != null && actual.avgHR) {
    hrDeltaBpm = actual.avgHR > targets.hrHigh
      ? actual.avgHR - targets.hrHigh
      : actual.avgHR < targets.hrLow
        ? actual.avgHR - targets.hrLow
        : 0
  }

  // Cardiac drift from the cached stream (steady sessions ≥25 min only —
  // interval HR sawtooths make the halves incomparable).
  let hrDriftPct: number | undefined
  if (day.type !== 'quality' && actual.movingTime >= 25 * 60) {
    const drift = hrDriftFromStream(opts.hrStream)
    if (drift != null) hrDriftPct = drift
  }

  const abandoned = targets.distanceMi != null && targets.distanceMi > 0 &&
    actual.distance > 0 && actual.distance < targets.distanceMi * ABANDON_SHARE

  if (paceDeltaFrac === undefined && hrDeltaBpm === undefined && !abandoned) {
    // Completed, but nothing measurable to judge against.
    return {
      isoDate, workout: day.workout, dayType: day.type, keySession: isKeySession(day.type),
      verdict: 'ok', reasons: ['completed — no measurable targets'],
    }
  }

  let verdict: WorkoutVerdict = 'ok'
  if (abandoned) {
    verdict = 'struggled'
    reasons.push(`stopped at ${actual.distance.toFixed(1)} of ${targets.distanceMi} mi`)
  } else if (paceDeltaFrac !== undefined && paceDeltaFrac > PACE_SLOW_FRAC) {
    verdict = 'struggled'
    reasons.push(`${Math.round(paceDeltaFrac * 100)}% slower than target`)
    if (hrDeltaBpm != null && hrDeltaBpm > 0) reasons.push(`HR ${hrDeltaBpm} bpm above the band doing it`)
  } else if (paceDeltaFrac !== undefined && paceDeltaFrac <= PACE_HIT_FRAC && hrDeltaBpm != null && hrDeltaBpm >= HR_OVER_BPM) {
    // Hit the pace, paid for it in HR — the classic repeat signal.
    verdict = 'struggled'
    reasons.push(`hit pace only at HR +${hrDeltaBpm} bpm above the band`)
  } else if (paceDeltaFrac !== undefined && paceDeltaFrac <= PACE_HIT_FRAC && (hrDeltaBpm == null || hrDeltaBpm <= 2)) {
    verdict = 'strong'
    reasons.push(paceDeltaFrac < -0.02 ? `${Math.round(-paceDeltaFrac * 100)}% faster than target at honest HR` : 'on target at honest HR')
  } else {
    reasons.push('close to target')
  }

  if (hrDriftPct !== undefined) {
    reasons.push(`HR drift ${hrDriftPct.toFixed(1)}% across the session`)
    if (hrDriftPct > 8 && verdict !== 'struggled') verdict = 'ok'
  }

  return {
    isoDate, workout: day.workout, dayType: day.type, keySession: isKeySession(day.type),
    paceDeltaFrac, hrDeltaBpm, hrDriftPct, verdict, reasons,
  }
}

// ─── Weekly rollup — the progression decision ──────────────────

export type WeekVerdict = 'advance' | 'hold' | 'ease'

export interface WeeklyExecution {
  weekNum: number
  scored: WorkoutExecution[]
  plannedSessions: number
  completedSessions: number
  /** Quality/long sessions that came back 'strong' or 'ok'. */
  keyHit: number
  keyTotal: number
  struggledKeys: number
  /** Median pace delta across scored runs with targets (null: none). */
  medianPaceDeltaFrac: number | null
  /** The week's long-run drift, when a stream produced one. */
  longRunDriftPct: number | null
  verdict: WeekVerdict
  reasons: string[]
}

/**
 * Roll a finished week into the progress/hold/ease decision, per the
 * coaching convention the research validated: all green → advance; one
 * amber (a struggled key session, borderline drift, partial adherence)
 * → hold; two ambers or clear failure → ease.
 */
export function scoreWeekExecution(
  week: TrainingWeek,
  todayIso: string,
  opts: { hrStream?: (day: PlannedDay) => HRStream | null } = {},
): WeeklyExecution {
  const scored: WorkoutExecution[] = []
  let plannedSessions = 0
  let completedSessions = 0

  for (const day of week.days) {
    if (day.type === 'rest') continue
    plannedSessions += 1
    if (day.actual) completedSessions += 1
    const iso = dayIsoInWeek(day.day, week, todayIso) ?? ''
    const s = scoreWorkoutExecution(day, iso, { hrStream: opts.hrStream?.(day) ?? null })
    if (s) scored.push(s)
  }

  const keys = scored.filter(s => s.keySession)
  const struggledKeys = keys.filter(s => s.verdict === 'struggled').length
  const keyPlanned = week.days.filter(d => isKeySession(d.type)).length

  const paceDeltas = scored.map(s => s.paceDeltaFrac).filter((x): x is number => x != null).sort((a, b) => a - b)
  const medianPaceDeltaFrac = paceDeltas.length > 0 ? paceDeltas[Math.floor(paceDeltas.length / 2)] : null

  const longRun = scored.find(s => s.dayType === 'long')
  const longRunDriftPct = longRun?.hrDriftPct ?? null

  const completion = plannedSessions > 0 ? completedSessions / plannedSessions : 1

  const reasons: string[] = []
  let ambers = 0
  if (struggledKeys >= 1) { ambers += struggledKeys; reasons.push(`${struggledKeys} key ${struggledKeys === 1 ? 'session' : 'sessions'} struggled`) }
  if (longRunDriftPct != null && longRunDriftPct > 8) { ambers += 1; reasons.push(`long-run HR drift ${longRunDriftPct.toFixed(1)}% — distance not absorbed yet`) }
  else if (longRunDriftPct != null && longRunDriftPct >= 5) { reasons.push(`long-run HR drift ${longRunDriftPct.toFixed(1)}% — borderline`) }
  if (completion < 0.5) { ambers += 2; reasons.push(`only ${Math.round(completion * 100)}% of sessions done`) }
  else if (completion < 0.8) { ambers += 1; reasons.push(`${Math.round(completion * 100)}% of sessions done`) }
  if (medianPaceDeltaFrac != null && medianPaceDeltaFrac > PACE_SLOW_FRAC) {
    ambers += 1
    reasons.push(`runs a median ${Math.round(medianPaceDeltaFrac * 100)}% slower than target`)
  }

  const verdict: WeekVerdict = ambers >= 2 ? 'ease' : ambers === 1 ? 'hold' : 'advance'
  if (verdict === 'advance') {
    reasons.push(completion >= 1 ? 'every session done, targets held' : 'the work that mattered landed')
  }

  return {
    weekNum: week.num,
    scored,
    plannedSessions,
    completedSessions,
    keyHit: keys.filter(s => s.verdict !== 'struggled').length,
    keyTotal: Math.max(keyPlanned, keys.length),
    struggledKeys,
    medianPaceDeltaFrac,
    longRunDriftPct,
    verdict,
    reasons,
  }
}

// ─── Gap detection + resumption tiers ──────────────────────────

export type GapTier = 'none' | 'resume' | 'ease75' | 'rebuild50' | 'restart'

export interface TrainingGap {
  /** Days since the last recorded activity (any type). */
  days: number
  lastActivityIso: string | null
  tier: GapTier
  /** The science-backed resumption rule, human-readable. */
  guidance: string
  /** Volume multiplier for the resumption weeks (1 = unchanged). */
  volumeFactor: number
}

/**
 * Detraining-aware resumption tiers (Mujika & Padilla timelines + the
 * coaching convention): under a week is life, not detraining; 1–2 weeks
 * resumes with one easy re-entry; 2–4 weeks restarts at 75% volume;
 * 1–2 months at 50%; beyond that the plan itself needs rebuilding.
 * Strength is deliberately spared — it holds for months.
 */
export function detectTrainingGap(weeks: TrainingWeek[], todayIso: string): TrainingGap {
  let last: string | null = null
  for (const week of weeks) {
    for (const day of week.days) {
      const iso = day.actual?.startDate?.slice(0, 10)
      if (iso && iso <= todayIso && (!last || iso > last)) last = iso
    }
  }
  const days = last
    ? Math.max(0, Math.round((Date.parse(`${todayIso}T12:00:00`) - Date.parse(`${last}T12:00:00`)) / 86_400_000))
    : Infinity

  if (days < 7) {
    return { days, lastActivityIso: last, tier: 'none', volumeFactor: 1, guidance: '' }
  }
  if (days < 14) {
    return {
      days, lastActivityIso: last, tier: 'resume', volumeFactor: 1,
      guidance: 'Resume the plan — one easy re-entry day first, and no two hard days back-to-back this week. Expect paces to feel harder for a few days; that is blood volume, not lost fitness.',
    }
  }
  if (days < 28) {
    return {
      days, lastActivityIso: last, tier: 'ease75', volumeFactor: 0.75,
      guidance: 'Rebuild the next two weeks at 75% volume with one quality session in week one. Aerobic fitness dipped ~5%; strength held. Back to plan in two weeks.',
    }
  }
  if (days < 60) {
    return {
      days, lastActivityIso: last, tier: 'rebuild50', volumeFactor: 0.5,
      guidance: 'Restart at 50% of your prior volume and rebuild frequency first, then duration, then intensity. Strength sessions can resume at prior loads sooner than the runs.',
    }
  }
  return {
    days: Number.isFinite(days) ? days : 0, lastActivityIso: last, tier: 'restart', volumeFactor: 0,
    guidance: 'This long away means the plan itself should be rebuilt from where you are now, not resumed.',
  }
}

/**
 * Nielsen single-session spike guard: no run should exceed the longest
 * run of the trailing 30 days by more than 10%. Returns the cap in
 * miles (null: no recent runs to anchor on).
 */
export function longestRunCapMi(weeks: TrainingWeek[], todayIso: string): number | null {
  const windowStart = new Date(`${todayIso}T12:00:00`)
  windowStart.setDate(windowStart.getDate() - 30)
  const startIso = isoFromLocalDate(windowStart)
  let longest = 0
  for (const week of weeks) {
    for (const day of week.days) {
      const iso = day.actual?.startDate?.slice(0, 10)
      if (!iso || iso < startIso || iso > todayIso) continue
      if ((day.actual?.distance ?? 0) > longest) longest = day.actual!.distance
    }
  }
  return longest > 0 ? Math.round(longest * 1.1 * 10) / 10 : null
}
