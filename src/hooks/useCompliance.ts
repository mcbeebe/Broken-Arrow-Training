import { useMemo } from 'react'
import type { TrainingWeek } from '../types'
import { getMilesNumber } from '../utils/format'
import { parseZoneRange } from '../utils/zones'

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
  hrCompliance: number // percentage of workouts where avg HR was in target zone
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
}

const REST_TYPES = new Set(['rest', 'travel', 'limited'])

export function useCompliance(weeks: TrainingWeek[]): OverallCompliance {
  return useMemo(() => computeCompliance(weeks), [weeks])
}

function computeCompliance(weeks: TrainingWeek[]): OverallCompliance {
  const weekStats = weeks.map(week => {
    let completed = 0
    let missed = 0
    let restDays = 0
    let actualMiles = 0
    let actualElevation = 0
    let hrInZone = 0
    let hrChecked = 0

    for (const day of week.days) {
      if (REST_TYPES.has(day.type)) {
        restDays++
        continue
      }

      if (day.actual) {
        completed++
        actualMiles += day.actual.distance
        actualElevation += day.actual.elevationGain

        // HR zone compliance
        if (day.actual.avgHR && day.zone !== '—') {
          const range = parseZoneRange(day.zone)
          if (range) {
            hrChecked++
            if (day.actual.avgHR >= range.low && day.actual.avgHR <= range.high) {
              hrInZone++
            }
          }
        }
      } else {
        // Only count as missed if the day is in the past
        const dayDate = parseDayDate(day.day)
        if (dayDate && dayDate < todayStr()) {
          missed++
        }
      }
    }

    const totalWorkouts = week.days.length - restDays
    const plannedMiles = getMilesNumber(week.miles)

    // Estimate planned elevation from zone descriptions (rough heuristic)
    const plannedElevation = estimateElevation(week)

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
      hrCompliance: hrChecked > 0 ? Math.round((hrInZone / hrChecked) * 100) : 0,
    } satisfies WeekCompliance
  })

  const totalCompleted = weekStats.reduce((s, w) => s + w.completed, 0)
  const totalMissed = weekStats.reduce((s, w) => s + w.missed, 0)
  const totalWorkouts = weekStats.reduce((s, w) => s + w.totalWorkouts, 0)
  const totalPlannedMiles = weekStats.reduce((s, w) => s + w.plannedMiles, 0)
  const totalActualMiles = weekStats.reduce((s, w) => s + w.actualMiles, 0)
  const totalActualElevation = weekStats.reduce((s, w) => s + w.actualElevation, 0)
  const hrCheckedWeeks = weekStats.filter(w => w.hrCompliance > 0)
  const overallHRCompliance = hrCheckedWeeks.length > 0
    ? Math.round(hrCheckedWeeks.reduce((s, w) => s + w.hrCompliance, 0) / hrCheckedWeeks.length)
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
  }
}

function parseDayDate(dayLabel: string): string | null {
  const match = dayLabel.match(/(\d+)\/(\d+)/)
  if (!match) return null
  const month = parseInt(match[1], 10)
  const date = parseInt(match[2], 10)
  return `2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function estimateElevation(week: TrainingWeek): number {
  // Rough estimation from zone descriptions mentioning "ft gain"
  let total = 0
  for (const day of week.days) {
    const match = day.detail.match(/([\d,]+)\s*(?:\+\s*)?ft/i)
    if (match) {
      total += parseInt(match[1].replace(',', ''), 10)
    }
  }
  return total
}
