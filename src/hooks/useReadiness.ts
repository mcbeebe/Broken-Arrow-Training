import { useMemo } from 'react'
import type {
  GarminHealthData,
  GarminActivity,
  StravaActivity,
  ReadinessScore,
  TRIMPRecord,
  DailyTRIMP,
  PerformanceMetrics,
  WeeklyRecommendation,
  ReadinessBaselines,
} from '../types'
import { stravaActivityToTRIMP, garminActivityToTRIMP, aggregateDailyTRIMP } from '../utils/trimp'
import { calculatePerformanceTimeline, generateWeeklyRecommendations } from '../utils/performance'
import {
  calculateBaselines,
  calculateReadiness,
  applyGuardrails,
  generateReadinessMessage,
  suggestDailyAdjustment,
  checkHRVStability,
} from '../utils/readiness'
import type { PlannedDay } from '../types'

interface UseReadinessProps {
  healthData: GarminHealthData[]
  stravaActivities: StravaActivity[]
  garminActivities: GarminActivity[]
  maxHR: number
  todayPlannedWorkout?: PlannedDay
  currentWeekNum: number
  raceDate: string
}

export interface UseReadinessReturn {
  todayScore: ReadinessScore | null
  weekScores: ReadinessScore[]
  trimpHistory: TRIMPRecord[]
  dailyTrimp: DailyTRIMP[]
  performance: PerformanceMetrics[]
  weeklyRecommendations: WeeklyRecommendation[]
  baselines: ReadinessBaselines | null
  hrvStability: { stable: boolean; cv: number }
  loading: boolean
}

export function useReadiness({
  healthData,
  stravaActivities,
  garminActivities,
  maxHR,
  todayPlannedWorkout,
  currentWeekNum,
  raceDate,
}: UseReadinessProps): UseReadinessReturn {

  // Get resting HR from latest Garmin data
  const restingHR = useMemo(() => {
    const withRHR = healthData.filter(d => d.rhr != null)
    if (withRHR.length === 0) return 55 // fallback default
    return withRHR[0].rhr!
  }, [healthData])

  // Calculate TRIMP from Strava activities (primary source)
  const trimpRecords = useMemo(() => {
    const stravaRecords: TRIMPRecord[] = stravaActivities
      .map(a => stravaActivityToTRIMP(a, restingHR, maxHR))
      .filter((r): r is TRIMPRecord => r !== null)

    // Get dates covered by Strava
    const stravaDates = new Set(stravaRecords.map(r => r.date))

    // Supplement with Garmin activities for dates not in Strava
    const garminRecords: TRIMPRecord[] = garminActivities
      .filter(a => !stravaDates.has(a.date))
      .map(a => garminActivityToTRIMP(a, restingHR, maxHR))
      .filter((r): r is TRIMPRecord => r !== null)

    return [...stravaRecords, ...garminRecords].sort((a, b) => a.date.localeCompare(b.date))
  }, [stravaActivities, garminActivities, restingHR, maxHR])

  // Aggregate daily TRIMP
  const dailyTrimp = useMemo(() => aggregateDailyTRIMP(trimpRecords), [trimpRecords])

  // Calculate baselines from health history
  const baselines = useMemo(() => {
    if (healthData.length < 1) return null
    return calculateBaselines(healthData, trimpRecords)
  }, [healthData, trimpRecords])

  // Calculate readiness scores for the last 7 days
  const weekScores = useMemo(() => {
    if (!baselines || healthData.length === 0) return []

    const recentHealth = healthData
      .filter(d => d.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)

    const scores = recentHealth.map(day => {
      const trimpUpToDay = dailyTrimp.filter(d => d.date <= day.date)
      const score = calculateReadiness(day, baselines, trimpUpToDay.slice(-7))
      score.message = generateReadinessMessage(score, todayPlannedWorkout)
      if (todayPlannedWorkout) {
        score.adjustment = suggestDailyAdjustment(score.status, todayPlannedWorkout.type, score.components)
      }
      return score
    })

    return applyGuardrails(scores)
  }, [healthData, baselines, dailyTrimp, todayPlannedWorkout])

  // Today's score
  const todayScore = useMemo(() => {
    if (weekScores.length === 0) return null
    return weekScores[weekScores.length - 1]
  }, [weekScores])

  // Performance timeline (CTL/ATL/TSB/ACWR)
  const performance = useMemo(
    () => calculatePerformanceTimeline(dailyTrimp),
    [dailyTrimp],
  )

  // Weekly recommendations
  const weeklyRecommendations = useMemo(
    () => generateWeeklyRecommendations(performance, currentWeekNum, raceDate),
    [performance, currentWeekNum, raceDate],
  )

  // HRV stability check
  const hrvStability = useMemo(
    () => checkHRVStability(healthData),
    [healthData],
  )

  return {
    todayScore,
    weekScores,
    trimpHistory: trimpRecords,
    dailyTrimp,
    performance,
    weeklyRecommendations,
    baselines,
    hrvStability,
    loading: false,
  }
}
