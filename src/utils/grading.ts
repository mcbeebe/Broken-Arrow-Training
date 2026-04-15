import type { PlannedDay } from '../types'
import { parseZoneRange } from './zones'
import { getMilesNumber } from './format'

export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'N/A'

export interface GradeResult {
  grade: Grade
  score: number        // 0-100 underlying numeric score
  color: string        // Tailwind text color class
  bgColor: string      // Tailwind bg color class
  reason: string       // Short explanation
}

const REST_TYPES = new Set(['rest', 'travel', 'limited'])

/**
 * Calculate a letter grade for a workout based on completion and execution quality.
 * Uses existing palette: emerald/teal (A's), amber (B/C), rose/red (D), slate (N/A).
 */
export function calculateGrade(day: PlannedDay): GradeResult | null {
  // Rest/travel/limited days don't get graded
  if (REST_TYPES.has(day.type)) return null

  const actual = day.actual
  if (!actual) {
    // Check if day is in the past — if so, it was skipped (N/A)
    const dayDate = parseDayDate(day.day)
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
  let completionScore = 1.0  // We have an actual workout = showed up
  let effortScore = 0.5      // Default neutral if we can't measure
  let hrScore = 0.5          // Default neutral
  let structureScore = 0.5   // Default neutral

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

    // HR zone compliance (30% weight)
    if (actual.avgHR && day.zone !== '—') {
      const range = parseZoneRange(day.zone)
      if (range) {
        const expandedLow = range.low - 5  // Small grace window
        const expandedHigh = range.high + 5
        if (actual.avgHR >= expandedLow && actual.avgHR <= expandedHigh) {
          hrScore = 1.0
          reasons.push('HR in zone')
        } else if (actual.avgHR < expandedLow) {
          hrScore = 0.85  // Going easier than planned
          reasons.push('HR below zone (easy)')
        } else {
          // Going harder than planned
          const overBy = actual.avgHR - expandedHigh
          if (overBy <= 10) {
            hrScore = 0.7
            reasons.push('HR slightly above zone')
          } else {
            hrScore = 0.5
            reasons.push('HR significantly above zone')
          }
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
    // Effort: Did they log exercises? (50% weight)
    if (actual.strengthLog && actual.strengthLog.length > 0) {
      effortScore = 1.0
      structureScore = 1.0
      reasons.push(`${actual.strengthLog.length} exercises logged`)
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
      if (plannedMin) {
        const actualMin = actual.movingTime / 60
        const ratio = actualMin / plannedMin
        hrScore = ratio >= 0.9 ? 1.0 : ratio >= 0.7 ? 0.8 : 0.6
        structureScore = hrScore
      } else {
        hrScore = 0.9
        structureScore = 0.9
      }
      reasons.push('completed')
    }
  }

  // Weighted score (completion 15% + effort 40% + HR 30% + structure 15%)
  const finalScore = Math.round(
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
