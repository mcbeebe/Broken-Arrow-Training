import type {
  GarminHealthData,
  ReadinessScore,
  ReadinessStatus,
  ReadinessScoreComponents,
  Baseline,
  ReadinessBaselines,
  TRIMPRecord,
  DailyTRIMP,
  WorkoutType,
  PlannedDay,
} from '../types'
import { aggregateDailyTRIMP } from './trimp'

// ─── Weights (from Firstbeat/Buchheit research) ─────────────────

const WEIGHT_HRV = 0.40
const WEIGHT_RHR = 0.20
const WEIGHT_SLEEP = 0.20
const WEIGHT_LOAD = 0.20

// ─── Thresholds ─────────────────────────────────────────────────

const GREEN_THRESHOLD = 70
const YELLOW_THRESHOLD = 40
const SLEEP_DURATION_TARGET_HOURS = 7

// ─── Baseline Calculation ───────────────────────────────────────

export function calculateBaseline(values: number[]): Baseline {
  const filtered = values.filter(v => v != null && !isNaN(v))
  if (filtered.length === 0) return { mean: 0, stdDev: 0, sampleSize: 0 }

  const mean = filtered.reduce((s, v) => s + v, 0) / filtered.length
  const variance = filtered.reduce((s, v) => s + (v - mean) ** 2, 0) / filtered.length
  const stdDev = Math.sqrt(variance)

  return { mean, stdDev, sampleSize: filtered.length }
}

export function calculateBaselines(
  healthHistory: GarminHealthData[],
  trimpRecords: TRIMPRecord[],
): ReadinessBaselines {
  const hrvValues = healthHistory
    .filter(d => d.hrv?.lastNightAvg)
    .map(d => Math.log(d.hrv!.lastNightAvg))

  const rhrValues = healthHistory
    .filter(d => d.rhr != null)
    .map(d => d.rhr!)

  const sleepDurationValues = healthHistory
    .filter(d => d.sleep?.durationSeconds)
    .map(d => d.sleep!.durationSeconds / 3600)

  const sleepScoreValues = healthHistory
    .filter(d => d.sleep?.score != null)
    .map(d => d.sleep!.score!)

  const dailyTrimp = aggregateDailyTRIMP(trimpRecords)
  const trimpValues = dailyTrimp.map(d => d.total)

  return {
    lnRmssd: calculateBaseline(hrvValues),
    rhr: calculateBaseline(rhrValues),
    sleepDuration: calculateBaseline(sleepDurationValues),
    sleepScore: calculateBaseline(sleepScoreValues),
    dailyTrimp: calculateBaseline(trimpValues),
  }
}

// ─── Individual Scoring Functions (0-100) ───────────────────────

export function scoreLnRmssd(currentHRV: number | undefined, baseline: Baseline): number {
  if (!currentHRV || baseline.sampleSize < 3) return 50  // default neutral

  const lnRmssd = Math.log(currentHRV)
  if (baseline.stdDev === 0) return 50

  // Z-score: positive = above baseline = good
  const z = (lnRmssd - baseline.mean) / baseline.stdDev
  // Map z-score [-2, +2] to [0, 100], clamped
  return Math.min(100, Math.max(0, Math.round(50 + z * 25)))
}

export function scoreRhr(currentRHR: number | undefined, baseline: Baseline): number {
  if (!currentRHR || baseline.sampleSize < 3) return 50

  if (baseline.stdDev === 0) return 50

  // Z-score: INVERSED — lower RHR = better
  const z = (baseline.mean - currentRHR) / baseline.stdDev
  return Math.min(100, Math.max(0, Math.round(50 + z * 25)))
}

export function scoreSleep(
  sleep: GarminHealthData['sleep'] | undefined,
  _durationBaseline: Baseline,
  _scoreBaseline: Baseline,
): number {
  if (!sleep) return 50

  // Duration score (0-100): 7+ hours is target
  const durationHours = sleep.durationSeconds / 3600
  let durationScore: number
  if (durationHours >= SLEEP_DURATION_TARGET_HOURS) {
    durationScore = Math.min(100, 70 + (durationHours - SLEEP_DURATION_TARGET_HOURS) * 15)
  } else {
    durationScore = Math.max(0, (durationHours / SLEEP_DURATION_TARGET_HOURS) * 70)
  }

  // Quality score from Garmin sleep score (0-100)
  let qualityScore = 50
  if (sleep.score != null) {
    qualityScore = sleep.score  // Garmin scores are already 0-100
  }

  // Blend: 50% duration, 50% quality
  return Math.round(durationScore * 0.5 + qualityScore * 0.5)
}

export function scoreTrainingLoad(
  recentDailyTrimp: DailyTRIMP[],
  baseline: Baseline,
): number {
  if (recentDailyTrimp.length === 0 || baseline.sampleSize < 3) return 50

  // Use yesterday's total TRIMP (most recent full day)
  const yesterday = recentDailyTrimp[recentDailyTrimp.length - 1]
  if (!yesterday || baseline.stdDev === 0) return 50

  // INVERSED: higher load = lower readiness
  const z = (baseline.mean - yesterday.total) / baseline.stdDev
  return Math.min(100, Math.max(0, Math.round(50 + z * 20)))
}

// ─── Composite Readiness Score ──────────────────────────────────

export function classifyStatus(composite: number): ReadinessStatus {
  if (composite >= GREEN_THRESHOLD) return 'GREEN'
  if (composite >= YELLOW_THRESHOLD) return 'YELLOW'
  return 'RED'
}

export function calculateReadiness(
  today: GarminHealthData,
  baselines: ReadinessBaselines,
  recentDailyTrimp: DailyTRIMP[],
): ReadinessScore {
  const hrvScore = scoreLnRmssd(today.hrv?.lastNightAvg, baselines.lnRmssd)
  const rhrScore = scoreRhr(today.rhr, baselines.rhr)
  const sleepScore = scoreSleep(today.sleep, baselines.sleepDuration, baselines.sleepScore)
  const loadScore = scoreTrainingLoad(recentDailyTrimp, baselines.dailyTrimp)

  const composite = Math.round(
    hrvScore * WEIGHT_HRV +
    rhrScore * WEIGHT_RHR +
    sleepScore * WEIGHT_SLEEP +
    loadScore * WEIGHT_LOAD
  )

  const status = classifyStatus(composite)

  const components: ReadinessScoreComponents = {
    hrv: hrvScore,
    rhr: rhrScore,
    sleep: sleepScore,
    trainingLoad: loadScore,
  }

  return {
    date: today.date,
    composite,
    status,
    components,
    message: '',       // filled by generateReadinessMessage
    adjustment: '',    // filled by suggestDailyAdjustment
  }
}

// ─── Guardrails ─────────────────────────────────────────────────

export function applyGuardrails(scores: ReadinessScore[]): ReadinessScore[] {
  if (scores.length === 0) return scores

  const result = [...scores]

  for (let i = 0; i < result.length; i++) {
    // Max 2 consecutive GREEN: force YELLOW on day 3
    if (i >= 2 &&
        result[i].status === 'GREEN' &&
        result[i - 1].status === 'GREEN' &&
        result[i - 2].status === 'GREEN') {
      result[i] = {
        ...result[i],
        status: 'YELLOW',
        message: 'Forced moderate day — even with good recovery, accumulated structural fatigue needs management.',
      }
    }

    // Max 2 consecutive RED: force light activity on day 3
    if (i >= 2 &&
        result[i].status === 'RED' &&
        result[i - 1].status === 'RED' &&
        result[i - 2].status === 'RED') {
      result[i] = {
        ...result[i],
        status: 'YELLOW',
        message: 'Extended poor recovery — light activity recommended to prevent detraining. Check sleep and stress.',
      }
    }
  }

  return result
}

export function checkHRVStability(healthHistory: GarminHealthData[]): { stable: boolean; cv: number } {
  const hrvValues = healthHistory
    .filter(d => d.hrv?.lastNightAvg)
    .map(d => Math.log(d.hrv!.lastNightAvg))

  if (hrvValues.length < 7) return { stable: true, cv: 0 }

  // Use last 14 days for CV calculation
  const recent = hrvValues.slice(-14)
  const baseline = calculateBaseline(recent)
  const cv = baseline.mean > 0 ? (baseline.stdDev / baseline.mean) * 100 : 0

  return { stable: cv <= 10, cv: Math.round(cv * 10) / 10 }
}

// ─── Conversational Messages ────────────────────────────────────

export function generateReadinessMessage(
  score: ReadinessScore,
  todayWorkout?: PlannedDay,
): string {
  const { status, components } = score

  const parts: string[] = []

  // HRV context
  if (components.hrv >= 70) parts.push('HRV trending above baseline')
  else if (components.hrv < 40) parts.push('HRV below baseline')

  // Sleep context
  if (components.sleep >= 70) parts.push('good sleep')
  else if (components.sleep < 40) parts.push('sleep was short')

  // Load context
  if (components.trainingLoad < 40) parts.push('heavy training load yesterday')
  else if (components.trainingLoad >= 70) parts.push('well-rested from training')

  const context = parts.length > 0 ? parts.join(', ') + '. ' : ''

  if (status === 'GREEN') {
    const workoutRef = todayWorkout ? ` Go for today's ${todayWorkout.workout}.` : ''
    return `Strong recovery — ${context}${workoutRef}`
  }

  if (status === 'YELLOW') {
    return `Moderate recovery — ${context}Consider reducing intensity to Z1-2 today.`
  }

  return `Low recovery — ${context}Swap for an easy walk or rest day.`
}

// ─── Daily Workout Adjustments ──────────────────────────────────

export function suggestDailyAdjustment(
  status: ReadinessStatus,
  workoutType: WorkoutType,
  components: ReadinessScoreComponents,
): string {
  if (status === 'GREEN') {
    return 'Execute planned workout as written.'
  }

  if (status === 'YELLOW') {
    switch (workoutType) {
      case 'quality':
        return 'Reduce intensity: drop to Z2 steady run, keep planned duration.'
      case 'long':
        return 'Keep the long run but cut 15-20% distance. Stay in Z1-2.'
      case 'strength':
        return 'Reduce sets/weight by ~25%. Focus on mobility work.'
      case 'run':
        return 'Keep the run but stay strictly in Z1-2. No tempo efforts.'
      case 'cross':
        return 'Cross-train as planned but keep effort easy.'
      case 'rest':
      case 'travel':
      case 'limited':
        return 'Rest day — your body agrees. Focus on recovery.'
      default:
        return 'Reduce intensity to Z1-2 today.'
    }
  }

  // RED
  switch (workoutType) {
    case 'rest':
    case 'travel':
    case 'limited':
      return 'Rest day — your body needs it. Focus on hydration and sleep tonight.'
    default: {
      const reason = components.sleep < 40
        ? 'Sleep was insufficient.'
        : components.trainingLoad < 30
        ? 'Heavy training load is accumulating.'
        : 'Recovery metrics are low.'
      return `Replace with 20-30 min easy walk or full rest. ${reason}`
    }
  }
}
