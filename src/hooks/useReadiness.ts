import { useMemo } from 'react'
import type {
  GarminHealthData,
  GarminActivity,
  GarminActivityDetail,
  StravaActivity,
  ReadinessScore,
  TRIMPRecord,
  DailyTRIMP,
  PerformanceMetrics,
  WeeklyRecommendation,
  ReadinessBaselines,
  TrainingStateInfo,
  DeloadDay,
} from '../types'
import { stravaActivityToTRIMP, garminActivityToTRIMP, aggregateDailyTRIMP, composeDayLoad } from '../utils/trimp'
import { calculatePerformanceTimeline, generateWeeklyRecommendations, checkWeeklyTRIMPOverload } from '../utils/performance'
import {
  calculateBaselines,
  calculateReadiness,
  applyGuardrails,
  generateReadinessMessage,
  suggestDailyAdjustment,
  checkHRVStability,
  checkInjuryRisk,
  classifyTrainingState,
  countConsecutiveRedDays,
  check7dDecliningTrend,
  buildTrainingStateInfo,
  computeDeloadProgram,
} from '../utils/readiness'
import type { PlannedDay } from '../types'

interface UseReadinessProps {
  healthData: GarminHealthData[]
  stravaActivities: StravaActivity[]
  garminActivities: GarminActivity[]
  garminActivityDetails: Record<string, GarminActivityDetail[]>
  rpeByDate: Map<string, number>
  exerciseLoadByDate: Map<string, number>
  sorenessLoadByDate: Map<string, number>
  maxHR: number
  ftpWatts?: number
  /** Optional — drives per-athlete DOMS calibration AND per-athlete MIM
   *  override lookups (cycling MIM, hiking MIM). When unset, defaults are
   *  used. */
  athleteId?: string
  todayPlannedWorkout?: PlannedDay
  currentWeekNum: number
  raceDate: string
  /** Tertiary HR fallback: Map keyed by activity date with the avgHR/maxHR
   *  the matching layer already wrote onto `PlannedDay.actual`. Used when
   *  the raw summary AND the detail both miss HR — the matched-actual is
   *  often complete (it composes per-second stream data). */
  actualHRByDate?: Map<string, { avgHR?: number; maxHR?: number }>
  /** Per-activity GAP-derived MIM keyed by `${date}|${name}`. Populated
   *  when the WorkoutModal has loaded a per-second stream for a running
   *  activity. Preferred over avg-grade for runs in `resolveRunningMIM`. */
  runGAPByActivity?: Record<string, number>
}

export interface UseReadinessReturn {
  todayScore: ReadinessScore | null
  weekScores: ReadinessScore[]
  trimpHistory: TRIMPRecord[]
  dailyTrimp: DailyTRIMP[]
  /** Engine's predicted DOMS carry-forward per day (residual that
   *  `aggregateDailyTRIMP` baked in from prior days' high-eccentric
   *  records). Exposed so the chart can show "predicted vs measured"
   *  without recomputing the algorithm. */
  domsCarryByDate: Map<string, number>
  performance: PerformanceMetrics[]
  weeklyRecommendations: WeeklyRecommendation[]
  baselines: ReadinessBaselines | null
  hrvStability: { stable: boolean; cv: number }
  riskFlags: import('../utils/readiness').RiskFlag[]
  acwr: number
  trainingStateInfo: TrainingStateInfo | null
  deloadProgram: DeloadDay[] | null
  loading: boolean
}

export function useReadiness({
  healthData,
  stravaActivities,
  garminActivities,
  garminActivityDetails,
  rpeByDate,
  exerciseLoadByDate,
  sorenessLoadByDate,
  maxHR,
  ftpWatts,
  athleteId,
  todayPlannedWorkout,
  currentWeekNum,
  raceDate,
  actualHRByDate,
  runGAPByActivity,
}: UseReadinessProps): UseReadinessReturn {

  // Get resting HR from latest Garmin data. Filter out 0/garbage values
  // (Garmin occasionally returns rhr=0 for missing-data days, which would
  // sneak past `rhr != null` and break the dynamic IF computation).
  const restingHR = useMemo(() => {
    const withRHR = healthData.filter(d => typeof d.rhr === 'number' && d.rhr > 30)
    if (withRHR.length === 0) return 55 // fallback default
    return withRHR[0].rhr!
  }, [healthData])

  // Calculate training load — Garmin activities are the primary source
  // Uses Garmin's on-device EPOC (activityTrainingLoad) as primary load signal.
  // Strava supplements for dates not covered by Garmin.
  // Banister TRIMP is the fallback when EPOC unavailable.
  const trimpRecords = useMemo(() => {
    // Build a lookup of exercise names per date for strength sub-classification.
    // If a "Strength" activity has lunges/squats/deadlifts in its exercise sets,
    // it should be classified as strength_lower (MIM 1.5) not strength_full (1.0).
    const exerciseNamesByDate = new Map<string, string[]>()
    for (const details of Object.values(garminActivityDetails)) {
      for (const d of details) {
        const date = d.startTimeLocal?.slice(0, 10)
        if (date && d.exerciseSets?.length) {
          const names = d.exerciseSets.map(s => (s.exerciseName || '').toLowerCase()).filter(Boolean)
          const existing = exerciseNamesByDate.get(date) || []
          exerciseNamesByDate.set(date, [...existing, ...names])
        }
      }
    }

    const garminRecords: TRIMPRecord[] = garminActivities
      .map(a => {
        // Garmin's summary list endpoint sometimes omits averageHR/maxHR
        // (notably for cycling activities), even though the activity-detail
        // endpoint has them. Without HR the dynamic cycling MIM falls back
        // to the static lookup. Backfill from detail when summary is missing
        // — match by date + name (most days have one activity per name).
        let enriched = a
        if (!a.avgHR || !a.maxHR) {
          // 1) Try the cached Garmin activity detail for this date.
          const detailsForDay = garminActivityDetails[a.date] ?? []
          const detail = detailsForDay.find(d => d.name === a.name) ?? detailsForDay[0]
          if (detail) {
            enriched = {
              ...a,
              avgHR: a.avgHR ?? detail.averageHR,
              maxHR: a.maxHR ?? detail.maxHR,
            }
          }
        }
        if (!enriched.avgHR || !enriched.maxHR) {
          // 2) Fall back to whatever the matching layer already wrote onto
          //    PlannedDay.actual (often filled in from per-second stream).
          const fromActual = actualHRByDate?.get(a.date)
          if (fromActual) {
            enriched = {
              ...enriched,
              avgHR: enriched.avgHR ?? fromActual.avgHR,
              maxHR: enriched.maxHR ?? fromActual.maxHR,
            }
          }
        }
        // Use the cached per-second GAP MIM for runs where the WorkoutModal
        // has loaded a stream — captures short steep peaks accurately.
        const gapKey = `${a.date}|${a.name}`
        const gapMIM = runGAPByActivity?.[gapKey]
        return garminActivityToTRIMP(enriched, restingHR, maxHR, exerciseNamesByDate.get(a.date), ftpWatts, athleteId, gapMIM)
      })
      .filter((r): r is TRIMPRecord => r !== null)

    // When Garmin is connected and has data, use ONLY Garmin for training load.
    // Garmin's on-device EPOC (Firstbeat) is the primary load signal.
    // Strava data is used for visuals/matching only, not load calculations.
    if (garminRecords.length > 0) {
      return garminRecords.sort((a, b) => a.date.localeCompare(b.date))
    }

    // Fallback: no Garmin data, use Strava with Banister TRIMP
    const stravaRecords: TRIMPRecord[] = stravaActivities
      .map(a => {
        const date = a.start_date_local.slice(0, 10)
        const gapKey = `${date}|${a.name}`
        const gapMIM = runGAPByActivity?.[gapKey]
        return stravaActivityToTRIMP(a, restingHR, maxHR, ftpWatts, athleteId, gapMIM)
      })
      .filter((r): r is TRIMPRecord => r !== null)

    return stravaRecords.sort((a, b) => a.date.localeCompare(b.date))
  }, [stravaActivities, garminActivities, garminActivityDetails, restingHR, maxHR, ftpWatts, athleteId, actualHRByDate, runGAPByActivity])

  // Aggregate daily training load. Composition (per day):
  //
  //   total = (recordSum + exerciseLoad) × rpeMult
  //         + max(domsCarry, sorenessAdj_positive)
  //         + sorenessAdj_negative   // recovery credit, additive
  //
  // Where:
  //   - recordSum   = sum of activity TRIMP records for the day
  //   - exerciseLoad = manually-logged strength load (Garmin EPOC misses it)
  //   - rpeMult     = 1 + 0.04 × (rpe − 5);  RPE 5 neutral, 10 = +20%, 1 = −16%
  //   - domsCarry   = engine prediction baked into base.total by
  //                   applyDOMSCarryForward (10–40% of yesterday's
  //                   high-eccentric records)
  //   - sorenessAdj = user's check-in (Twist & Highton 2013)
  //
  // RPE only multiplies today's effort — not yesterday's residual DOMS.
  // DOMS prediction and soreness check-in are de-duplicated when both
  // apply: take the higher of the two (engine prediction vs measurement)
  // rather than stacking. Negative soreness (relief) bypasses the dedup
  // and lands additively as a recovery credit.
  const { dailyTrimp, domsCarryByDate } = useMemo(() => {
    // aggregateDailyTRIMP extends through today and applies DOMS carry-
    // forward (scaled by per-athlete calibration when athleteId set),
    // so soreness/RPE/exercise adjustments can land on rest days.
    const base = aggregateDailyTRIMP(trimpRecords, athleteId)

    const domsMap = new Map<string, number>()
    for (const day of base) {
      const recordSum = day.records.reduce((s, r) => s + r.adjustedTRIMP, 0)
      const carry = Math.max(0, day.total - recordSum)
      if (carry > 0) domsMap.set(day.date, Math.round(carry * 10) / 10)
    }

    if (rpeByDate.size === 0 && exerciseLoadByDate.size === 0 && sorenessLoadByDate.size === 0) {
      return { dailyTrimp: base, domsCarryByDate: domsMap }
    }

    const adjusted = base.map(day => {
      const recordSum = day.records.reduce((s, r) => s + r.adjustedTRIMP, 0)
      const domsCarry = Math.max(0, day.total - recordSum)
      const total = composeDayLoad(recordSum, domsCarry, {
        exerciseLoad: exerciseLoadByDate.get(day.date),
        rpeValue: rpeByDate.get(day.date),
        sorenessAdj: sorenessLoadByDate.get(day.date),
      })
      if (Math.abs(total - day.total) < 0.05) return day
      return { ...day, total: Math.round(total * 10) / 10 }
    })

    return { dailyTrimp: adjusted, domsCarryByDate: domsMap }
  }, [trimpRecords, rpeByDate, exerciseLoadByDate, sorenessLoadByDate, athleteId])

  // Performance timeline (CTL/ATL/TSB/ACWR) — computed early so ACWR feeds readiness
  const performance = useMemo(
    () => calculatePerformanceTimeline(dailyTrimp),
    [dailyTrimp],
  )

  // Single consistent ACWR (tau-based: ATL/CTL) used everywhere.
  // Previously had two different ACWR values (span-based for readiness, tau-based
  // for performance display), which caused confusing mismatches.
  const acwr = useMemo(() => {
    if (performance.length === 0) return 0
    return performance[performance.length - 1].acwr
  }, [performance])

  // HRV stability check
  const hrvStability = useMemo(
    () => checkHRVStability(healthData),
    [healthData],
  )

  // Proactive injury risk flags (HRV slope, ACWR acceleration, recovery failure, escalating soreness)
  const riskFlags = useMemo(
    () => checkInjuryRisk(healthData, performance, sorenessLoadByDate),
    [healthData, performance, sorenessLoadByDate],
  )

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

    // Calculate raw scores
    const rawScores = recentHealth.map(day => {
      const score = calculateReadiness(day, baselines, acwr, hrvStability.cv)
      return score
    })

    // Apply guardrails (ACWR, body battery, acute overrides, consecutive limits)
    const guarded = applyGuardrails(rawScores, healthData, dailyTrimp, acwr)

    // Classify training state and fill messages
    const consecutiveRed = countConsecutiveRedDays(guarded)
    const declining = check7dDecliningTrend(healthData)

    return guarded.map(score => {
      const state = classifyTrainingState(score.composite, acwr, consecutiveRed, declining)
      score.trainingState = state
      score.message = generateReadinessMessage(score, todayPlannedWorkout)
      if (todayPlannedWorkout) {
        score.adjustment = suggestDailyAdjustment(score.status, state, todayPlannedWorkout.type, score.components)
      }
      return score
    })
  }, [healthData, baselines, dailyTrimp, acwr, hrvStability.cv, todayPlannedWorkout])

  // Today's score
  const todayScore = useMemo(() => {
    if (weekScores.length === 0) return null
    return weekScores[weekScores.length - 1]
  }, [weekScores])

  // Training state info (with medical flags)
  const trainingStateInfo = useMemo(() => {
    if (!todayScore) return null
    const consecutiveRed = countConsecutiveRedDays(weekScores)
    return buildTrainingStateInfo(todayScore.trainingState, consecutiveRed)
  }, [todayScore, weekScores])

  // Deload program (only when State D)
  const deloadProgram = useMemo(() => {
    if (trainingStateInfo?.state !== 'D') return null
    return computeDeloadProgram()
  }, [trainingStateInfo])

  // Weekly recommendations (including TRIMP overload check)
  const weeklyRecommendations = useMemo(() => {
    const recs = generateWeeklyRecommendations(performance, currentWeekNum, raceDate)

    // Add weekly TRIMP overload check (ATE guardrail)
    const overload = checkWeeklyTRIMPOverload(dailyTrimp)
    if (overload.overloaded) {
      recs.push({
        type: 'weekly_trimp_overload',
        severity: 'warning',
        message: `Weekly training load (${overload.ratio}% of 28-day average) exceeds 120% threshold. Consider reducing volume.`,
        weekNum: currentWeekNum,
      })
    }

    // Add medical flag if applicable
    if (trainingStateInfo?.medicalFlagLevel === 'critical') {
      recs.push({
        type: 'medical_flag',
        severity: 'alert',
        message: `State D for ${trainingStateInfo.stateDDurationDays}+ days. Consider blood work (cortisol, testosterone, ferritin, CRP) and sports medicine consultation.`,
      })
    } else if (trainingStateInfo?.medicalFlagLevel === 'warning') {
      recs.push({
        type: 'medical_flag',
        severity: 'warning',
        message: `Extended overtraining (${trainingStateInfo.stateDDurationDays}+ days). Recommend sports medicine consultation.`,
      })
    } else if (trainingStateInfo?.medicalFlagLevel === 'info') {
      recs.push({
        type: 'medical_flag',
        severity: 'info',
        message: `Overtraining for ${trainingStateInfo.stateDDurationDays}+ days. Prioritize rest, nutrition, and stress management.`,
      })
    }

    return recs
  }, [performance, currentWeekNum, raceDate, dailyTrimp, trainingStateInfo])

  return {
    todayScore,
    weekScores,
    trimpHistory: trimpRecords,
    dailyTrimp,
    domsCarryByDate,
    performance,
    weeklyRecommendations,
    baselines,
    hrvStability,
    riskFlags,
    acwr,
    trainingStateInfo,
    deloadProgram,
    loading: false,
  }
}
