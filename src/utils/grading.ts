import type { PlannedDay } from '../types'
import { parseZoneRange } from './zones'
import { getMilesNumber } from './format'
import { getPlannedDrills } from './drills'
import { computeZoneCompliance, isIntervalSession } from './timeInZone'

function hasPlannedDrills(day: PlannedDay): boolean {
  return getPlannedDrills(day).length > 0 || !!day.actual?.drills?.items?.length
}

/**
 * Read cached HR stream (Strava or Garmin) from localStorage for the activity.
 * Returns null if no stream cached.
 */
function getCachedHRStream(activityId: number | string | undefined): { time: number[]; heartrate: number[] } | null {
  if (!activityId) return null
  const keys = [
    `ba_strava_streams_${activityId}`,
    `ba_garmin_streams_${activityId}`,
  ]
  // Also scan for scoped athlete keys
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.includes(`strava_streams`) || k.includes(`garmin_streams`)) && k.endsWith(String(activityId))) {
      keys.push(k)
    }
  }
  for (const k of keys) {
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

export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'N/A'

export interface GradeResult {
  grade: Grade
  score: number        // 0-100 underlying numeric score
  color: string        // Tailwind text color class
  bgColor: string      // Tailwind bg color class
  reason: string       // Short explanation
}

const REST_TYPES = new Set(['rest', 'travel'])

/**
 * Calculate a letter grade for a workout based on completion and execution quality.
 * Uses existing palette: emerald/teal (A's), amber (B/C), rose/red (D), slate (N/A).
 */
export function calculateGrade(day: PlannedDay, dayIso?: string): GradeResult | null {
  // Rest/travel/limited days don't get graded
  if (REST_TYPES.has(day.type)) return null

  const actual = day.actual
  if (!actual) {
    // Check if day is in the past — if so, it was skipped (N/A).
    // Callers with the week in hand pass the exact `dayIso` (labels carry
    // no year; the legacy parser guesses 2026 and marked NEXT YEAR's days
    // "Skipped" in a season spanning a year boundary).
    const dayDate = dayIso ?? parseDayDate(day.day)
    if (dayDate && dayDate < todayStr()) {
      return {
        grade: 'N/A',
        score: 0,
        color: 'text-slate-400',
        bgColor: 'bg-slate-100',
        reason: 'Skipped',
      }
    }
    return null  // Future day — no grade yet
  }

  // Score components (each worth up to 1.0)
  const completionScore = 1.0  // We have an actual workout = showed up
  let effortScore = 0.5      // Default neutral if we can't measure
  let hrScore = 0.5          // Default neutral
  let structureScore = 0.5   // Default neutral
  let drillScore = 1.0       // Default neutral (only penalized if drills planned + missed)
  let drillWeighted = false  // Only factor drills in when relevant

  const reasons: string[] = []

  // --- RUN WORKOUTS (run, quality, long, race) ---
  if (['run', 'quality', 'long', 'race'].includes(day.type)) {
    const plannedMiles = extractMilesFromZone(day.zone)

    // Distance match (40% weight)
    if (plannedMiles && actual.distance > 0) {
      const ratio = actual.distance / plannedMiles
      if (ratio >= 0.95 && ratio <= 1.15) {
        effortScore = 1.0
        reasons.push('distance on target')
      } else if (ratio >= 0.85 && ratio < 0.95) {
        effortScore = 0.85
        reasons.push('slightly short')
      } else if (ratio >= 0.7) {
        effortScore = 0.65
        reasons.push(`${Math.round(ratio * 100)}% of planned distance`)
      } else if (ratio > 1.15) {
        effortScore = 0.9  // Going over is fine, slight penalty for undisciplined
        reasons.push('exceeded planned distance')
      } else {
        effortScore = 0.4
        reasons.push('well short of plan')
      }
    }

    // HR zone compliance (30% weight) — always uses PLAN zones (Uphill Athlete).
    // Preferred: per-second HR stream, warm-up/cool-down excluded. Fallback:
    // avgHR vs plan zone band. We deliberately IGNORE Garmin's hrZoneSummary
    // since those use Garmin's default zones (% of max HR), not the plan's
    // Uphill Athlete zones.
    //
    // Interval/sharpener days are graded on time AT OR ABOVE the target (the
    // hard reps are the point — spiking into Z4/Z5 is success, not a miss).
    // Steady runs are graded on strict in-band time. Either way the leading
    // easy warm-up and trailing cool-down are trimmed out so they don't drag
    // the number down — the athlete shouldn't be penalized for warming up.
    if (day.zone !== '—') {
      const range = parseZoneRange(day.zone)

      if (range) {
        const interval = isIntervalSession(day.type, day.detail)
        const stream = getCachedHRStream(actual.stravaId || actual.garminId)
        if (stream) {
          const c = computeZoneCompliance(stream, range)
          const pct = interval ? c.workingPct : c.inZonePct
          const label = interval ? 'working' : 'HR in zone'
          const note = c.warmupSec >= 60 ? ', warm-up excluded' : ''
          if (pct >= 80) {
            hrScore = 1.0
          } else if (pct >= 65) {
            hrScore = 0.9
          } else if (pct >= 50) {
            hrScore = 0.75
          } else {
            hrScore = 0.6
          }
          reasons.push(`${Math.round(pct)}% ${label}${note}`)
        } else if (actual.avgHR) {
          // Fallback: no per-second stream, so we can't see warm-up shape.
          // For interval/quality days a whole-session average naturally lands
          // BELOW the work zone (warm-up + recoveries pull it down) — a low
          // average is expected, not a failure, so don't penalize it.
          const expandedLow = range.low - 5
          const expandedHigh = range.high + 5
          if (interval) {
            if (actual.avgHR > expandedHigh + 10) {
              hrScore = 0.85
              reasons.push('avg HR above target (no stream)')
            } else {
              hrScore = 0.9
              reasons.push('intervals logged (avg HR only)')
            }
          } else if (actual.avgHR >= expandedLow && actual.avgHR <= expandedHigh) {
            hrScore = 1.0
            reasons.push('HR in zone (avg)')
          } else if (actual.avgHR < expandedLow) {
            hrScore = 0.9
            reasons.push('HR below zone (easy)')
          } else {
            const overBy = actual.avgHR - expandedHigh
            if (overBy <= 10) {
              hrScore = 0.8
              reasons.push('HR slightly above zone')
            } else {
              hrScore = 0.6
              reasons.push('HR above zone')
            }
          }
        } else {
          // No HR data — neutral score, don't penalize
          hrScore = 0.9
        }
      }
    }

    // Duration match — structure score (15% weight)
    const plannedMin = parseTimeToMinutes(day.time)
    if (plannedMin && actual.movingTime > 0) {
      const actualMin = actual.movingTime / 60
      const ratio = actualMin / plannedMin
      if (ratio >= 0.9 && ratio <= 1.15) {
        structureScore = 1.0
      } else if (ratio >= 0.75) {
        structureScore = 0.8
      } else {
        structureScore = 0.6
      }
    }
  }

  // --- STRENGTH WORKOUTS ---
  else if (day.type === 'strength') {
    // Effort: Did they log exercises? (50% weight). An exercise whose
    // every set is explicitly done:false is a skipped prescription (the
    // set editor persists ghosts honestly) — it must not earn credit.
    const performedExercises = (actual.strengthLog ?? []).filter(ex =>
      ex.sets.some(s => s.done !== false),
    )
    if (performedExercises.length > 0) {
      effortScore = 1.0
      structureScore = 1.0
      reasons.push(`${performedExercises.length} exercises logged`)
    } else if (actual.movingTime > 0) {
      effortScore = 0.7
      structureScore = 0.6
      reasons.push('time logged, no exercise detail')
    } else {
      effortScore = 0.5
      structureScore = 0.5
      reasons.push('workout noted')
    }

    // Duration match
    const plannedMin = parseTimeToMinutes(day.time)
    if (plannedMin && actual.movingTime > 0) {
      const actualMin = actual.movingTime / 60
      const ratio = actualMin / plannedMin
      if (ratio >= 0.9 && ratio <= 1.15) {
        hrScore = 1.0
      } else if (ratio >= 0.75) {
        hrScore = 0.85
      } else if (ratio >= 0.5) {
        hrScore = 0.65
      } else {
        hrScore = 0.4
      }
    } else {
      hrScore = 0.8  // No penalty if we can't measure
    }
  }

  // --- CROSS-TRAIN ---
  else if (day.type === 'cross') {
    if (actual.movingTime > 0) {
      effortScore = 1.0
      const plannedMin = parseTimeToMinutes(day.time)
      // Mobility/Myrtl/foam roll aren't captured by Garmin — only the
      // cardio portion shows up. Grade accordingly:
      //   • Way over (2x+): penalize (2hr bike when plan says 30min)
      //   • Mobility checked off: credit drill time + cardio
      //   • Otherwise: accept shortfall (mobility just not logged)
      const drillItems = actual.drills?.items
      const drillsDone = drillItems?.filter(i => i.done).length ?? 0
      const totalItems = drillItems?.length ?? 0
      const drillMin = actual.drills?.durationMin ?? 0
      const mobilityConfirmed = actual.drills?.completed === true || drillsDone > 0
      // Estimate mobility time when user checked items but didn't enter drill time
      const estimatedMobilityMin = mobilityConfirmed && drillMin === 0 ? Math.max(10, drillsDone * 3) : drillMin

      if (plannedMin) {
        const actualMin = actual.movingTime / 60
        const combinedMin = mobilityConfirmed ? actualMin + estimatedMobilityMin : actualMin
        const ratio = combinedMin / plannedMin

        if (ratio > 1.5) {
          // Way over — penalize
          hrScore = 0.6
          structureScore = 0.6
          reasons.push('duration well over plan')
        } else if (mobilityConfirmed) {
          // Mobility confirmed → grade normally + boost for items done
          const itemPct = totalItems > 0 ? drillsDone / totalItems : 1
          if (ratio >= 0.85 && ratio <= 1.15) {
            hrScore = 1.0
            structureScore = 0.8 + itemPct * 0.2
          } else if (ratio >= 0.7) {
            hrScore = 0.9
            structureScore = 0.75 + itemPct * 0.2
          } else {
            hrScore = 0.85
            structureScore = 0.7 + itemPct * 0.2
          }
          reasons.push(`${drillsDone}/${totalItems} mobility items done`)
        } else {
          // Mobility not logged → accept shortfall gracefully
          hrScore = ratio >= 0.3 ? 1.0 : 0.85
          structureScore = 0.9
          reasons.push('cardio logged (mobility not tracked)')
        }
      } else {
        hrScore = 0.9
        structureScore = 0.9
      }
      // HR compliance: for cross-training, this is the primary quality
      // metric (staying in Z1 for recovery). Use per-second stream if
      // available, else fall back to avgHR.
      const range = parseZoneRange(day.zone)
      if (range && actual.avgHR) {
        const stream = getCachedHRStream(actual.stravaId || actual.garminId)
        let tizPct: number | null = null
        if (stream) {
          tizPct = computeZoneCompliance(stream, range).inZonePct
        }
        if (tizPct !== null) {
          if (tizPct < 75) {
            // HR discipline matters — penalize if drifting out of Z1
            hrScore = Math.min(hrScore, tizPct >= 50 ? 0.8 : 0.65)
            reasons.push(`${Math.round(tizPct)}% HR in zone`)
          }
        } else if (actual.avgHR > range.high + 10) {
          hrScore = Math.min(hrScore, 0.7)
          reasons.push('HR above zone')
        }
      }
      reasons.push('completed')
    }
  }

  // --- LIMITED (easy walk/jog, recovery day) ---
  else if (day.type === 'limited') {
    if (actual.movingTime > 0) {
      effortScore = 1.0
      structureScore = 1.0
      reasons.push('completed')

      // HR: should stay easy (Z1-Z2). Reward low HR.
      const range = parseZoneRange(day.zone)
      if (range && actual.avgHR) {
        if (actual.avgHR <= range.high) {
          hrScore = 1.0
          reasons.push('HR on target')
        } else if (actual.avgHR <= range.high + 10) {
          hrScore = 0.8
          reasons.push('HR slightly high')
        } else {
          hrScore = 0.5
          reasons.push('HR too high for limited')
        }
      } else {
        hrScore = 0.9
      }
    }
  }

  // --- DRILL SCORING (run-type days only) ---
  if (['run', 'quality', 'long'].includes(day.type)) {
    const plannedDrills = hasPlannedDrills(day)
    if (plannedDrills) {
      drillWeighted = true
      if (actual.drills?.completed) {
        // Full credit if all items checked off, partial if only some
        const items = actual.drills.items
        if (items && items.length > 0) {
          const done = items.filter(i => i.done).length
          const pct = done / items.length
          drillScore = pct
          if (pct >= 0.8) reasons.push('drills done')
          else if (pct >= 0.5) reasons.push(`${done}/${items.length} drills`)
          else reasons.push('few drills done')
        } else {
          drillScore = 1.0
          reasons.push('drills done')
        }
      } else {
        drillScore = 0.3
        reasons.push('drills skipped')
      }
    }
  }

  // Weighted score
  // Run types with drills: completion 12% + effort 35% + HR 28% + structure 15% + drills 10% = 100%
  // All others: completion 15% + effort 40% + HR 30% + structure 15% = 100%
  const finalScore = drillWeighted
    ? Math.round(
        (completionScore * 0.12 + effortScore * 0.35 + hrScore * 0.28 + structureScore * 0.15 + drillScore * 0.10) * 100
      )
    : Math.round(
        (completionScore * 0.15 + effortScore * 0.40 + hrScore * 0.30 + structureScore * 0.15) * 100
      )

  const grade = scoreToGrade(finalScore)
  return {
    grade,
    score: finalScore,
    ...gradeStyle(grade),
    reason: reasons.join(', ') || 'completed',
  }
}

function scoreToGrade(score: number): Grade {
  if (score >= 97) return 'A+'
  if (score >= 93) return 'A'
  if (score >= 90) return 'A-'
  if (score >= 87) return 'B+'
  if (score >= 83) return 'B'
  if (score >= 80) return 'B-'
  if (score >= 77) return 'C+'
  if (score >= 73) return 'C'
  if (score >= 70) return 'C-'
  if (score >= 65) return 'D+'
  return 'D'
}

/**
 * Colors that harmonize with the existing palette:
 * - A's: emerald (rich green, stronger than the bg green)
 * - B's: teal (app's primary accent)
 * - C's: amber (caution)
 * - D's: rose (red-pink)
 * - N/A: slate (neutral)
 */
function gradeStyle(grade: Grade): { color: string; bgColor: string } {
  if (grade === 'N/A') return { color: 'text-slate-400', bgColor: 'bg-slate-100' }
  if (grade.startsWith('A')) return { color: 'text-emerald-700', bgColor: 'bg-emerald-50' }
  if (grade.startsWith('B')) return { color: 'text-teal-700', bgColor: 'bg-teal-50' }
  if (grade.startsWith('C')) return { color: 'text-amber-700', bgColor: 'bg-amber-50' }
  return { color: 'text-rose-700', bgColor: 'bg-rose-50' }
}

// ─── Helpers ───────────────────────────────────────────────

function extractMilesFromZone(zoneStr: string): number | null {
  const match = zoneStr.match(/([\d.]+)\s*mi/)
  return match ? parseFloat(match[1]) : null
}

function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || timeStr === '—') return null
  // "1 hr 15 min" | "45 min" | "1.5 hr" | "2 hr 30 min+"
  let total = 0
  const hrMatch = timeStr.match(/([\d.]+)\s*hr/)
  const minMatch = timeStr.match(/(\d+)\s*min/)
  if (hrMatch) total += parseFloat(hrMatch[1]) * 60
  if (minMatch) total += parseInt(minMatch[1])
  return total > 0 ? total : null
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

// Silence unused import warning for getMilesNumber in certain builds
void getMilesNumber
