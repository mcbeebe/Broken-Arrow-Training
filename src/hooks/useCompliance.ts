import { useMemo } from 'react'
import type { TrainingWeek, PlannedDay, DayCompliance, ComplianceGrade, HRZone } from '../types'
import { getMilesNumber } from '../utils/format'
import { parsePlannedTargets } from '../utils/targets'
import { HR_ZONE_TOLERANCE_BPM } from '../utils/zones'
import { mapToSportType } from '../utils/trimp'

export interface WeekCompliance {
  weekNum: number
  completed: number
  missed: number
  restDays: number
  totalWorkouts: number
  plannedMiles: number
  actualMiles: number
  plannedElevation: number
  actualElevation: number
  hrCompliance: number // avg time-in-zone % across HR-checked workouts
  hrCheckedWorkouts: number // # workouts with HR measurement against a target zone
  hrInZoneTotal: number // sum of hrInZonePct across checked workouts
  days: DayCompliance[] // per-day breakdown
  // New aggregate metrics
  distanceCompliancePct: number  // avg distance % across completed days
  durationCompliancePct: number  // avg duration % across completed days
  flaggedCount: number            // # workouts with any major miss
}

export interface OverallCompliance {
  weeks: WeekCompliance[]
  totalCompleted: number
  totalMissed: number
  totalWorkouts: number
  completionRate: number
  totalPlannedMiles: number
  totalActualMiles: number
  totalActualElevation: number
  overallHRCompliance: number
  overallDistanceCompliance: number
  overallDurationCompliance: number
  totalFlagged: number
}

const REST_TYPES = new Set(['rest', 'travel'])

// ─── Grading thresholds ─────────────────────────────────────────
// "hit"   = within ±10% of target (or ≥75% HR time-in-zone)
// "close" = within ±20% (or 50-75% time-in-zone)
// "miss"  = >±20% short (or <50% time-in-zone)
// "over"  = >+20% over target (distance/duration only — can be good or bad)
// "skipped" = planned workout day, no actual logged, day is in the past
// "na"    = no target to grade (rest day, or target not parseable)
const HIT_BAND = 0.10
const CLOSE_BAND = 0.20
const HR_TIME_IN_ZONE_HIT = 75
const HR_TIME_IN_ZONE_CLOSE = 50

export function useCompliance(weeks: TrainingWeek[], userZones?: HRZone[]): OverallCompliance {
  return useMemo(() => computeCompliance(weeks, userZones), [weeks, userZones])
}

function computeCompliance(weeks: TrainingWeek[], userZones?: HRZone[]): OverallCompliance {
  const weekStats = weeks.map(week => {
    let completed = 0
    let missed = 0
    let restDays = 0
    let actualMiles = 0
    let actualElevation = 0

    // Avg time-in-zone across HR-checked workouts (not binary pass/fail)
    let hrInZoneTotal = 0
    let hrCheckedWorkouts = 0

    // For distance/duration compliance: collect per-day % and average
    const distancePcts: number[] = []
    const durationPcts: number[] = []
    let flaggedCount = 0

    const dayComplianceList: DayCompliance[] = []

    for (const day of week.days) {
      const actualSport = day.actual
        ? mapToSportType(day.actual.type, {
            name: day.actual.name,
            avgHR: day.actual.avgHR,
            elevationGainFt: day.actual.elevationGain,
            distanceMi: day.actual.distance,
          })
        : undefined
      const targets = parsePlannedTargets(day, actualSport, userZones)

      if (REST_TYPES.has(day.type)) {
        restDays++
        // Rest/travel/limited: minimal compliance row, for display only
        dayComplianceList.push(buildRestDayCompliance(day, targets))
        continue
      }

      if (day.actual) {
        completed++
        actualMiles += day.actual.distance
        actualElevation += day.actual.elevationGain

        const rec = gradeWorkoutDay(day, targets)
        dayComplianceList.push(rec)

        if (rec.distancePct !== undefined) distancePcts.push(rec.distancePct)
        if (rec.durationPct !== undefined) durationPcts.push(rec.durationPct)
        if (rec.hrInZonePct !== undefined) {
          hrCheckedWorkouts++
          hrInZoneTotal += rec.hrInZonePct
        }
        if (rec.flagged) flaggedCount++
      } else {
        // Only count as missed if the day is in the past
        const dayDate = parseDayDate(day.day)
        const isPast = dayDate !== null && dayDate < todayStr()
        if (isPast) {
          missed++
          dayComplianceList.push(buildSkippedDayCompliance(day, targets))
        } else {
          dayComplianceList.push(buildUpcomingDayCompliance(day, targets))
        }
      }
    }

    const totalWorkouts = week.days.length - restDays
    const plannedMiles = getMilesNumber(week.miles)
    const plannedElevation = estimateElevation(week)

    const distanceCompliancePct = avgPct(distancePcts)
    const durationCompliancePct = avgPct(durationPcts)
    const hrCompliance = hrCheckedWorkouts > 0
      ? Math.round(hrInZoneTotal / hrCheckedWorkouts)
      : 0

    return {
      weekNum: week.num,
      completed,
      missed,
      restDays,
      totalWorkouts,
      plannedMiles,
      actualMiles: Math.round(actualMiles * 10) / 10,
      plannedElevation,
      actualElevation,
      hrCompliance,
      hrCheckedWorkouts,
      hrInZoneTotal,
      days: dayComplianceList,
      distanceCompliancePct,
      durationCompliancePct,
      flaggedCount,
    } satisfies WeekCompliance
  })

  const totalCompleted = weekStats.reduce((s, w) => s + w.completed, 0)
  const totalMissed = weekStats.reduce((s, w) => s + w.missed, 0)
  const totalWorkouts = weekStats.reduce((s, w) => s + w.totalWorkouts, 0)
  const totalPlannedMiles = weekStats.reduce((s, w) => s + w.plannedMiles, 0)
  const totalActualMiles = weekStats.reduce((s, w) => s + w.actualMiles, 0)
  const totalActualElevation = weekStats.reduce((s, w) => s + w.actualElevation, 0)
  const totalFlagged = weekStats.reduce((s, w) => s + w.flaggedCount, 0)

  // Aggregate across all HR-checked workouts, not mean-of-weekly-means.
  // Filtering out 0%-weeks biases the number upward; summing workout-level
  // time-in-zone keeps each workout weighted equally.
  const totalHrChecked = weekStats.reduce((s, w) => s + w.hrCheckedWorkouts, 0)
  const totalHrInZone = weekStats.reduce((s, w) => s + w.hrInZoneTotal, 0)
  const overallHRCompliance = totalHrChecked > 0
    ? Math.round(totalHrInZone / totalHrChecked)
    : 0

  const distanceWeeks = weekStats.filter(w => w.distanceCompliancePct > 0)
  const overallDistanceCompliance = distanceWeeks.length > 0
    ? Math.round(distanceWeeks.reduce((s, w) => s + w.distanceCompliancePct, 0) / distanceWeeks.length)
    : 0

  const durationWeeks = weekStats.filter(w => w.durationCompliancePct > 0)
  const overallDurationCompliance = durationWeeks.length > 0
    ? Math.round(durationWeeks.reduce((s, w) => s + w.durationCompliancePct, 0) / durationWeeks.length)
    : 0

  return {
    weeks: weekStats,
    totalCompleted,
    totalMissed,
    totalWorkouts,
    completionRate: totalCompleted + totalMissed > 0
      ? Math.round((totalCompleted / (totalCompleted + totalMissed)) * 100)
      : 0,
    totalPlannedMiles,
    totalActualMiles: Math.round(totalActualMiles * 10) / 10,
    totalActualElevation,
    overallHRCompliance,
    overallDistanceCompliance,
    overallDurationCompliance,
    totalFlagged,
  }
}

// ─── Per-day grading ────────────────────────────────────────────

export function gradeWorkoutDay(day: PlannedDay, targets: ReturnType<typeof parsePlannedTargets>): DayCompliance {
  const actual = day.actual!
  const dayDate = parseDayDate(day.day) || ''
  const flagReasons: string[] = []

  // Distance
  let distancePct: number | undefined
  let distanceGrade: ComplianceGrade = 'na'
  if (targets.distanceMi !== undefined && targets.distanceMi > 0) {
    const pct = actual.distance / targets.distanceMi
    distancePct = pct
    distanceGrade = gradeRatio(pct)
    if (distanceGrade === 'miss' && pct < 1 - CLOSE_BAND) {
      flagReasons.push(`Distance ${actual.distance.toFixed(1)} mi vs ${targets.distanceMi} planned`)
    }
  }

  // Duration grading — two modes:
  //   1. Drills logged → grade (moving + drill) against total plan time
  //   2. Run day, no drills logged → grade moving-only against running-time range
  //   3. Otherwise → grade moving-only against total plan time
  //   Exception: cross-training skips duration grading because mobility/foam
  //   roll/Myrtl aren't captured by activity trackers — only the optional
  //   cardio portion shows up, so comparing it to total plan time is unfair.
  let durationPct: number | undefined
  let durationGrade: ComplianceGrade = 'na'
  const drillMin = actual.drills?.durationMin ?? 0
  const movingMin = actual.movingTime / 60
  const isCross = day.type === 'cross'

  if (isCross && targets.durationMin !== undefined && targets.durationMin > 0 && movingMin > 0) {
    // Cross-training: the planned time includes mobility/Myrtl/foam roll that
    // Garmin doesn't capture. Only penalize on the high side (going WAY over)
    // or on the low side if mobility items were explicitly checked off.
    const mobilityDone = actual.drills?.completed === true
      || (actual.drills?.items && actual.drills.items.filter(i => i.done).length > 0)
    const combined = mobilityDone && drillMin > 0 ? movingMin + drillMin : movingMin
    const pct = combined / targets.durationMin
    durationPct = pct
    if (pct > 1 + CLOSE_BAND) {
      // Over: 2x planned = way too much even for cross-training
      durationGrade = 'over'
      flagReasons.push(`Duration ${Math.round(combined)} min vs ${targets.durationMin} planned`)
    } else if (mobilityDone) {
      // Mobility confirmed → grade normally
      durationGrade = gradeRatio(pct)
      if (durationGrade === 'miss') {
        flagReasons.push(`Duration ${Math.round(combined)} min vs ${targets.durationMin} planned`)
      }
    } else {
      // Mobility not confirmed → accept shortfall (mobility just not logged)
      durationGrade = pct >= 0.5 ? 'hit' : 'close'
    }
  } else if (drillMin > 0 && targets.durationMin !== undefined && targets.durationMin > 0) {
    // Mode 1: drills logged — grade total time against plan total
    const combined = movingMin + drillMin
    const pct = combined / targets.durationMin
    durationPct = pct
    durationGrade = gradeRatio(pct)
    if (pct < 1 - CLOSE_BAND) {
      flagReasons.push(`Duration ${Math.round(combined)} min vs ${targets.durationMin} planned`)
    }
  } else if (movingMin > 0 && targets.durationMinLow !== undefined && targets.durationMinHigh !== undefined) {
    // Mode 2: run day, no drills — grade moving against running-time range
    const { durationMinLow: lo, durationMinHigh: hi } = targets
    const mid = (lo + hi) / 2
    durationPct = movingMin / mid
    if (movingMin >= lo && movingMin <= hi) {
      durationGrade = 'hit'
    } else if (movingMin > hi * (1 + CLOSE_BAND)) {
      durationGrade = 'over'
    } else if (movingMin >= lo * (1 - CLOSE_BAND) && movingMin <= hi * (1 + CLOSE_BAND)) {
      durationGrade = 'close'
    } else {
      durationGrade = 'miss'
    }
    if (movingMin < lo * (1 - CLOSE_BAND)) {
      flagReasons.push(`Duration ${Math.round(movingMin)} min vs ${lo}–${hi} min target`)
    }
  } else if (movingMin > 0 && targets.durationMin !== undefined && targets.durationMin > 0) {
    // Mode 3: non-run or no range — grade against total plan time
    const pct = movingMin / targets.durationMin
    durationPct = pct
    durationGrade = gradeRatio(pct)
    if (pct < 1 - CLOSE_BAND) {
      flagReasons.push(`Duration ${Math.round(movingMin)} min vs ${targets.durationMin} planned`)
    }
  }

  // HR — prefer per-second stream (against plan zones), then hrZoneSummary, then avgHR
  let hrInZonePct: number | undefined
  let hrGrade: ComplianceGrade = 'na'
  const hrAvg = actual.avgHR
  if (targets.hrLow !== undefined && targets.hrHigh !== undefined) {
    // Try cached HR stream first — matches "Time in Zone" bar in modal
    const stream = getCachedHRStreamForActual(actual)
    if (stream) {
      const hrs = stream.heartrate
      const times = stream.time
      let inSec = 0
      let totSec = 0
      for (let i = 1; i < hrs.length; i++) {
        const hr = hrs[i]
        const dt = times[i] - times[i - 1]
        if (dt <= 0 || dt > 60) continue
        totSec += dt
        if (hr >= targets.hrLow - HR_ZONE_TOLERANCE_BPM && hr <= targets.hrHigh + HR_ZONE_TOLERANCE_BPM) inSec += dt
      }
      if (totSec > 0) hrInZonePct = (inSec / totSec) * 100
    }
    if (hrInZonePct === undefined) {
      hrInZonePct = computeHRTimeInZone(actual.hrZoneSummary, targets.hrLow, targets.hrHigh, actual.avgHR)
    }
    if (hrInZonePct !== undefined) {
      if (hrInZonePct >= HR_TIME_IN_ZONE_HIT) hrGrade = 'hit'
      else if (hrInZonePct >= HR_TIME_IN_ZONE_CLOSE) hrGrade = 'close'
      else hrGrade = 'miss'
      if (hrGrade === 'miss') {
        flagReasons.push(
          `HR off-target (${Math.round(hrInZonePct)}% in ${targets.hrLow}–${targets.hrHigh} zone)`,
        )
      }
    }
  }

  return {
    date: dayDate,
    day: day.day,
    workoutType: day.type,
    hasActual: true,
    targets,
    distanceActual: actual.distance || undefined,
    distancePct,
    distanceGrade,
    durationActual: actual.movingTime > 0 ? Math.round(actual.movingTime / 60) : undefined,
    durationPct,
    durationGrade,
    hrInZonePct,
    hrAvg,
    hrGrade,
    hrZoneSummary: actual.hrZoneSummary,
    drillGrade: (() => {
      const planned = (targets.drillItems?.length ?? 0) > 0
      const items = actual.drills?.items
      const loggedItems = (items?.length ?? 0) > 0
      const completedFlag = actual.drills?.completed
      // Grade drills when EITHER the plan prescribed them OR the
      // athlete logged any drill activity in the manual log. That way
      // "partially did drills on an easy run" shows up even when the
      // plan detail didn't explicitly list drills.
      if (!planned && !loggedItems && !completedFlag) return 'na' as ComplianceGrade
      if (items && items.length > 0) {
        const done = items.filter(i => i.done).length
        const pct = done / items.length
        if (pct >= 0.8) return 'hit' as ComplianceGrade
        if (pct > 0) {
          // Any partial engagement counts as "close" (amber). User
          // at least showed up — that's categorically different from
          // skipping entirely.
          flagReasons.push(`${done}/${items.length} drills done`)
          return 'close' as ComplianceGrade
        }
        flagReasons.push(`0/${items.length} drills done`)
        return 'miss' as ComplianceGrade
      }
      if (completedFlag) return 'hit' as ComplianceGrade
      if (planned) {
        flagReasons.push('Drills planned but not completed')
        return 'miss' as ComplianceGrade
      }
      return 'na' as ComplianceGrade
    })(),
    drillsPlanned: (targets.drillItems?.length ?? 0) > 0
      || (actual.drills?.items?.length ?? 0) > 0
      || !!actual.drills?.completed,
    drillsCompleted: (() => {
      const items = actual.drills?.items
      if (items && items.length > 0) {
        return items.filter(i => i.done).length / items.length >= 0.8
      }
      return !!actual.drills?.completed
    })(),
    flagged: flagReasons.length > 0,
    flagReasons,
  }
}

function gradeRatio(ratio: number): ComplianceGrade {
  if (ratio >= 1 - HIT_BAND && ratio <= 1 + HIT_BAND) return 'hit'
  if (ratio > 1 + CLOSE_BAND) return 'over'
  if (ratio > 1 + HIT_BAND) return 'close'
  if (ratio >= 1 - CLOSE_BAND) return 'close'
  return 'miss'
}

/**
 * Compute HR time-in-zone %.
 * Prefers granular hrZoneSummary (seconds per zone); maps Garmin/Strava zones
 * 1..5 to approximate HR bands and sums the overlap with [targetLow, targetHigh].
 * Falls back to binary avgHR-in-range when zone summary is missing.
 */
/**
 * Read cached HR stream (Strava or Garmin, scoped or unscoped) from localStorage.
 */
function getCachedHRStreamForActual(actual: { stravaId?: number; garminId?: number }): { time: number[]; heartrate: number[] } | null {
  const ids = [actual.stravaId, actual.garminId].filter(Boolean)
  if (ids.length === 0) return null
  // Scan all localStorage keys for matching streams
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    if (!(k.includes('strava_streams') || k.includes('garmin_streams'))) continue
    const matchesId = ids.some(id => k.endsWith(String(id)))
    if (!matchesId) continue
    try {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const stream = JSON.parse(raw)
      if (stream?.heartrate?.length && stream?.time?.length) {
        return { time: stream.time, heartrate: stream.heartrate }
      }
    } catch {
      // Skip
    }
  }
  return null
}

export function computeHRTimeInZone(
  zoneSummary: { zone: number; seconds: number; lowHR?: number; highHR?: number }[] | undefined,
  targetLow: number,
  targetHigh: number,
  avgHR?: number,
): number | undefined {
  if (zoneSummary && zoneSummary.length > 0) {
    const total = zoneSummary.reduce((s, z) => s + z.seconds, 0)
    if (total <= 0) return undefined

    // Preferred path: Garmin provides per-zone lowHR/highHR boundaries.
    // Compute fractional overlap between each zone's HR band and the
    // plan's target band. This is accurate regardless of whether the
    // device's zone definitions match the plan's zones.
    const hasBoundaries = zoneSummary.some(z => z.lowHR !== undefined)
    if (hasBoundaries) {
      let inZone = 0
      // Sort by lowHR so we can infer highHR from the next zone's lowHR
      const sorted = [...zoneSummary].sort((a, b) => (a.lowHR ?? 0) - (b.lowHR ?? 0))
      for (let i = 0; i < sorted.length; i++) {
        const z = sorted[i]
        const low = z.lowHR
        if (low === undefined) continue
        // highHR from the record, else infer from next zone's low, else +20 bpm span
        const high = z.highHR ?? (sorted[i + 1]?.lowHR !== undefined ? sorted[i + 1].lowHR! - 1 : low + 20)
        const overlapLow = Math.max(low, targetLow)
        const overlapHigh = Math.min(high, targetHigh)
        if (overlapHigh >= overlapLow) {
          const overlap = overlapHigh - overlapLow + 1
          const span = high - low + 1
          const fraction = span > 0 ? overlap / span : 0
          inZone += z.seconds * fraction
        }
      }
      return (inZone / total) * 100
    }

    // Fallback: no boundaries — use canonical zone midpoints
    // (zones 1-5 ≈ 118/138/158/172/187). Less accurate but usable.
    const ZONE_MID: Record<number, number> = { 1: 118, 2: 138, 3: 158, 4: 172, 5: 187 }
    let inZone = 0
    for (const z of zoneSummary) {
      const mid = ZONE_MID[z.zone]
      if (mid !== undefined && mid >= targetLow && mid <= targetHigh) {
        inZone += z.seconds
      }
    }
    return (inZone / total) * 100
  }
  // Final fallback: binary check on avgHR
  if (avgHR !== undefined) {
    return avgHR >= targetLow && avgHR <= targetHigh ? 100 : 0
  }
  return undefined
}

// ─── Builders for non-completed days ────────────────────────────

function buildRestDayCompliance(day: PlannedDay, targets: ReturnType<typeof parsePlannedTargets>): DayCompliance {
  return {
    date: parseDayDate(day.day) || '',
    day: day.day,
    workoutType: day.type,
    hasActual: !!day.actual,
    targets,
    distanceGrade: 'na',
    durationGrade: 'na',
    hrGrade: 'na',
    drillGrade: 'na',
    drillsPlanned: false,
    drillsCompleted: false,
    flagged: false,
    flagReasons: [],
  }
}

function buildSkippedDayCompliance(day: PlannedDay, targets: ReturnType<typeof parsePlannedTargets>): DayCompliance {
  const drillsPlanned = (targets.drillItems?.length ?? 0) > 0
  return {
    date: parseDayDate(day.day) || '',
    day: day.day,
    workoutType: day.type,
    hasActual: false,
    targets,
    distanceGrade: 'skipped',
    durationGrade: 'skipped',
    hrGrade: 'skipped',
    drillGrade: drillsPlanned ? 'skipped' : 'na',
    drillsPlanned,
    drillsCompleted: false,
    flagged: true,
    flagReasons: ['Workout not logged'],
  }
}

function buildUpcomingDayCompliance(day: PlannedDay, targets: ReturnType<typeof parsePlannedTargets>): DayCompliance {
  return {
    date: parseDayDate(day.day) || '',
    day: day.day,
    workoutType: day.type,
    hasActual: false,
    targets,
    distanceGrade: 'na',
    durationGrade: 'na',
    hrGrade: 'na',
    drillGrade: 'na',
    drillsPlanned: (targets.drillItems?.length ?? 0) > 0,
    drillsCompleted: false,
    flagged: false,
    flagReasons: [],
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function avgPct(values: number[]): number {
  if (values.length === 0) return 0
  // Convert ratios to percentages, clamp to 200% to avoid outliers skewing
  const clamped = values.map(v => Math.min(v, 2))
  const avg = clamped.reduce((s, v) => s + v, 0) / clamped.length
  return Math.round(avg * 100)
}

function parseDayDate(dayLabel: string): string | null {
  const match = dayLabel.match(/(\d+)\/(\d+)/)
  if (!match) return null
  const month = parseInt(match[1], 10)
  const date = parseInt(match[2], 10)
  return `2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function estimateElevation(week: TrainingWeek): number {
  let total = 0
  for (const day of week.days) {
    const match = day.detail.match(/([\d,]+)\s*(?:\+\s*)?ft/i)
    if (match) {
      total += parseInt(match[1].replace(',', ''), 10)
    }
  }
  return total
}
