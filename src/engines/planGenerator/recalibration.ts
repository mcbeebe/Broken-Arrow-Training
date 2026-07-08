import type { TrainingWeek } from '../../types'
import { parsePlannedTargets } from '../../utils/targets'
import { parseDayToDate } from '../../utils/planDates'

/**
 * G5 — performance-adaptive pace targets (the Runna "Pace Insights"
 * analog, trail-true).
 *
 * Scans the trailing window of COMPLETED sessions and asks one question:
 * is the athlete consistently running meaningfully faster than their
 * targets at compliant heart rate? Three honest data points make the
 * case; the suggestion applies HALF the observed speedup, capped at 3% —
 * conservative by design, because target inflation is how apps burn
 * trust (the analysis's Runna complaint profile).
 *
 * Trail-true (the input Runna doesn't have): an injectable `gapFactor`
 * resolves each session's grade-adjusted-pace multiplier (from the cached
 * Minetti GAP-MIM), so a hilly run's EQUIVALENT FLAT pace is what gets
 * compared — a 9:40/mi mountain run can be an 8:20/mi effort.
 *
 * Delivery contract (locked D3/D4): this module only ASSESSES. Targets
 * change exclusively through an applied proposal (repace.ts builds the
 * ops) — opt-in, targets-only, undoable, never silent.
 */

export interface RecalSession {
  isoDate: string
  workout: string
  /** Equivalent flat pace actually run (sec/mi, GAP-corrected when known). */
  actualPaceSecMi: number
  /** The fast end of the session's planned pace (sec/mi). */
  targetPaceSecMi: number
  /** How much faster than target, as a fraction (0.03 = 3% faster). */
  speedupFrac: number
  gapCorrected: boolean
}

export interface RecalibrationAssessment {
  qualifies: boolean
  sessions: RecalSession[]
  /** Median observed speedup across qualifying sessions. */
  medianSpeedupFrac: number
  /** Multiplier to apply to pace targets (<1 = faster). Half the observed
   *  speedup, floored at 0.97 (max 3% faster targets per recalibration). */
  suggestedFactor: number
  evidence: string[]
}

const WINDOW_DAYS = 28
const MIN_SESSIONS = 3
const MIN_SPEEDUP = 0.02       // ≥2% faster than the FAST end of the target
const MIN_DISTANCE_MI = 3      // ignore shakeouts
const FACTOR_FLOOR = 0.97      // never propose more than 3% faster at once

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60)
  const s = Math.round(secPerMi % 60)
  return `${m}:${String(s).padStart(2, '0')}/mi`
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function assessRecalibration(
  weeks: TrainingWeek[],
  todayIso: string,
  opts: {
    /** Grade-adjustment multiplier for a completed session (≥1 on hills);
     *  null/1 = flat or unknown. Wire from the cached GAP-MIM. */
    gapFactor?: (isoDate: string, activityName: string) => number | null
  } = {},
): RecalibrationAssessment {
  const windowStart = shiftIso(todayIso, -WINDOW_DAYS)
  const sessions: RecalSession[] = []

  for (const week of weeks) {
    for (const day of week.days) {
      const actual = day.actual
      if (!actual || !actual.distance || !actual.movingTime) continue
      if (day.type !== 'run' && day.type !== 'quality' && day.type !== 'long' && day.type !== 'race') continue
      const isoDate = parseDayToDate(day.day, week.dates)
      if (!isoDate || isoDate < windowStart || isoDate > todayIso) continue

      const targets = parsePlannedTargets(day)
      if (!targets.distanceMi || targets.distanceMi < MIN_DISTANCE_MI) continue
      if (!targets.durationMinLow) continue
      // Ran meaningfully short of the session? Not comparable.
      if (actual.distance < targets.distanceMi * 0.9) continue
      // HR honesty: a faster time bought with a blown HR cap is effort
      // inflation, not fitness — exclude it.
      if (targets.hrHigh && actual.avgHR && actual.avgHR > targets.hrHigh + 2) continue

      const rawPace = actual.movingTime / actual.distance
      const gap = opts.gapFactor?.(isoDate, actual.name ?? '') ?? null
      const gapCorrected = typeof gap === 'number' && gap > 1
      const actualPaceSecMi = gapCorrected ? rawPace / gap : rawPace
      const targetPaceSecMi = (targets.durationMinLow * 60) / targets.distanceMi

      const speedupFrac = 1 - actualPaceSecMi / targetPaceSecMi
      if (speedupFrac < MIN_SPEEDUP) continue

      sessions.push({
        isoDate,
        workout: day.workout,
        actualPaceSecMi,
        targetPaceSecMi,
        speedupFrac,
        gapCorrected,
      })
    }
  }

  sessions.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  const qualifies = sessions.length >= MIN_SESSIONS
  const speedups = sessions.map(s => s.speedupFrac).sort((a, b) => a - b)
  const medianSpeedupFrac = qualifies ? speedups[Math.floor(speedups.length / 2)] : 0
  const suggestedFactor = qualifies
    ? Math.max(FACTOR_FLOOR, 1 - medianSpeedupFrac / 2)
    : 1

  const evidence = sessions.map(s =>
    `${s.workout} (${s.isoDate}): ${fmtPace(s.actualPaceSecMi)}${s.gapCorrected ? ' grade-adjusted' : ''} ` +
    `vs ${fmtPace(s.targetPaceSecMi)} target at compliant HR (${(s.speedupFrac * 100).toFixed(1)}% faster)`,
  )

  return { qualifies, sessions, medianSpeedupFrac, suggestedFactor, evidence }
}
