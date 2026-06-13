import { DEFAULT_READINESS_TUNING, type ReadinessTuning } from './engineConfig'
import type {
  GarminHealthData,
  ReadinessScore,
  ReadinessStatus,
  ReadinessScoreComponents,
  TrainingState,
  TrainingStateInfo,
  DeloadDay,
  Baseline,
  ReadinessBaselines,
  TRIMPRecord,
  DailyTRIMP,
  WorkoutType,
  PlannedDay,
  PerformanceMetrics,
} from '../types'
import { aggregateDailyTRIMP } from './trimp'

// ─── ATE Engine Constants ───────────────────────────────────────
// Adaptive Training Engine — biometric-first readiness model.
//
// Scientific foundations:
//   HRV (ln RMSSD):  Plews et al. 2013 — ln(RMSSD) is the gold standard
//                     for parasympathetic recovery monitoring in athletes.
//                     CV > 10% = noisy signal (Plews et al. 2012).
//   RHR:             Buchheit 2014 — elevated RHR is a reliable marker of
//                     accumulated fatigue when trended against baseline.
//   Sleep:           Hirshkowitz et al. 2015 (NSF) — 7-9h adult consensus.
//                     Watson et al. 2015 (AASM) — <6h = impaired recovery.
//   ACWR guardrails: Gabbett 2016 — >1.5 = elevated injury risk.
//   Overtraining:    Meeusen et al. 2013 (ECSS/ACSM) — 5+ consecutive
//                     poor-recovery days suggests non-functional overreaching.
//
// Weights reflect predictive importance for next-day performance:
//   HRV 40% — most responsive autonomic recovery signal (Plews 2013)
//   RHR 20% — slower-moving fatigue confirmation (Buchheit 2014)
//   Sleep 20% — foundation for all recovery (Walker 2017)
//   Load 20% — training stress context (Gabbett 2016)

// Composite weights (must sum to 1.0)
const WEIGHT_HRV = 0.40
const WEIGHT_RHR = 0.20
const WEIGHT_SLEEP = 0.20
const WEIGHT_LOAD = 0.20

// Recovery Composite sub-weights (Firstbeat WP-G1, must sum to 1.0)
// RMSSD dominant because it's the most sensitive overnight recovery marker
const RECOVERY_WEIGHT_RMSSD = 0.50
const RECOVERY_WEIGHT_RHR_DEV = 0.25
const RECOVERY_WEIGHT_HRV_STATUS = 0.25

// Signal thresholds — these map a -2 to +2 composite score to status.
// Chosen to create four roughly equal-probability zones for a normally
// distributed athlete population. Not from a specific study.
const THRESHOLD_PEAK = 1.25
const THRESHOLD_GREEN = 0.25
const THRESHOLD_YELLOW = -0.25

// Scoring thresholds
const NORMAL_RANGE_SD_MULT = 0.50  // z-score boundary for "normal" band
const CV_ALERT_THRESHOLD = 10.0     // Plews et al. 2012: CV > 10% = unreliable
const RHR_ELEVATED_THRESHOLD = 5.0  // Buchheit 2014: ≥5 bpm above baseline
const SLEEP_MIN_THRESHOLD = 7.0     // Hirshkowitz 2015 (NSF): adult minimum

// Guardrail thresholds
const ACUTE_SLEEP_FLOOR = 6.0       // Watson 2015 (AASM): <6h impairs recovery
const ACUTE_RMSSD_DROP_PCT = 25.0   // Plews 2013: acute drop = sympathetic dominance
const MAX_CONSEC_HIGH = 2           // Prevents score inflation from stable metrics
const MAX_PEAK_PER_WEEK = 1         // Same — conservative peak allocation
const BODY_BATTERY_GATE = 25        // Garmin proprietary — no published cutoff
// A prior high-readiness day only contributes structural load if the athlete
// actually trained that day. We count a day as "trained" when its TRIMP is at
// least this fraction of the athlete's typical active-day load — a rest/easy
// day (well below that) carries no musculoskeletal fatigue to manage, so it
// should not count toward the consecutive-high cap. Self-calibrating: no magic
// absolute TRIMP number, scales to the individual athlete.
const STRUCTURAL_LOAD_FRACTION = 0.5

// Training state thresholds (Meeusen et al. 2013 ECSS/ACSM framework)
const STATE_B_THRESHOLD = 0.25
// R8 — the ACWR sweet-spot top and the consecutive-RED→D threshold moved to
// engineConfig's ReadinessTuning so they can flex by age/experience (defaults
// 1.3 / 5, matching Gabbett 2016 / Meeusen 2013).

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

// ─── HRV Status Mapping (ATE hrv_status_to_score) ──────────────

function hrvStatusToScore(status: string | undefined): number {
  if (!status) return 0.0
  const normalized = status.toLowerCase()
  if (normalized === 'poor') return -1.0
  if (normalized === 'low' || normalized === 'unbalanced') return -0.5
  if (normalized === 'balanced') return 0.5
  if (normalized === 'good') return 1.0
  return 0.0
}

// ─── Scoring Functions (ATE -1/0/+1/+2 scale) ──────────────────

/**
 * Score HRV using ATE Recovery Composite (WP-G1):
 * 50% ln(RMSSD) z-score + 25% RHR deviation z-score + 25% Garmin HRV Status
 * CV > 10% forces max -0.5
 */
export function scoreHRV(
  today: GarminHealthData,
  baseline: ReadinessBaselines,
  hrvCV: number,
): number {
  // Component 1: ln(RMSSD) z-score (50%)
  let lnRmssdZ = 0
  if (today.hrv?.lastNightAvg && baseline.lnRmssd.sampleSize >= 1 && baseline.lnRmssd.stdDev > 0) {
    const lnRmssd = Math.log(today.hrv.lastNightAvg)
    lnRmssdZ = (lnRmssd - baseline.lnRmssd.mean) / baseline.lnRmssd.stdDev
  }

  // Component 2: RHR deviation z-score (25%, inverted — higher RHR = worse)
  let rhrDevZ = 0
  if (today.rhr != null && baseline.rhr.sampleSize >= 1 && baseline.rhr.stdDev > 0) {
    // Inverted: negative deviation (lower RHR) is good
    rhrDevZ = -(today.rhr - baseline.rhr.mean) / baseline.rhr.stdDev
  }

  // Component 3: Garmin HRV Status string (25%)
  const hrvStatusScore = hrvStatusToScore(today.hrv?.status)

  // Recovery Composite (WP-G1)
  const recoveryComposite = lnRmssdZ * RECOVERY_WEIGHT_RMSSD +
    rhrDevZ * RECOVERY_WEIGHT_RHR_DEV +
    hrvStatusScore * RECOVERY_WEIGHT_HRV_STATUS

  // CV check: high variability = forced low score
  if (hrvCV > CV_ALERT_THRESHOLD) {
    return Math.min(-0.5, recoveryComposite)
  }

  // Map recovery composite to ATE bucket score
  const sd = NORMAL_RANGE_SD_MULT
  if (recoveryComposite > sd * 2) return 2.0
  if (recoveryComposite > sd) return 1.0
  if (recoveryComposite > -sd) return 0.0
  return -1.0
}

/**
 * Score RHR: deviation from baseline mean (ATE score_rhr).
 */
export function scoreRHR(currentRHR: number | undefined, baseline: Baseline): number {
  if (currentRHR == null || baseline.sampleSize < 1) return 0.0

  const deviation = currentRHR - baseline.mean
  if (deviation <= -5) return 2.0
  if (deviation <= -2) return 1.0
  if (deviation <= RHR_ELEVATED_THRESHOLD) return 0.0
  return -1.0
}

/**
 * Score Sleep: hours-based only (ATE score_sleep).
 */
export function scoreSleep(sleep: GarminHealthData['sleep'] | undefined): number {
  if (!sleep) return 0.0

  const hours = sleep.durationSeconds / 3600
  if (hours >= 8.5) return 2.0
  if (hours >= SLEEP_MIN_THRESHOLD) return 1.0
  if (hours >= SLEEP_MIN_THRESHOLD - 1) return 0.0
  return -1.0
}

/**
 * Score Load: ACWR-based (Gabbett 2016 zones, ATE score_load).
 */
export function scoreLoad(acwr: number, tuning: ReadinessTuning = DEFAULT_READINESS_TUNING): number {
  if (acwr <= 0) return 0.0 // insufficient data
  if (acwr < 0.8) return 1.0                    // undertraining
  if (acwr <= tuning.acwrSweetTop) return 0.0   // sweet spot
  if (acwr <= tuning.acwrDanger) return -0.5    // caution
  return -1.0                                    // danger
}

/** Floor on the eccentric-load dampening factor — caps attenuation at 30 %. */
const LOAD_DAMPENING_FLOOR = 0.7

/**
 * Compute the multiplicative dampening factor applied to the Load
 * component of ATE when recent eccentric (descent) work is high. Maps a
 * 24-hour DOMS forecast (in arbitrary units, see `engines/descent/forecast`)
 * against the athlete's reference dose to produce a number in [0.7, 1.0].
 *
 *     factor = max(0.7, 1 − forecast24h / referenceDose)
 *
 * Returns 1 (no dampening) for non-positive inputs so callers can pass the
 * raw values without pre-checking.
 *
 * @see BA_Terrain_Descent_Engine_Spec_v1.0.docx §7.4
 * @see BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-13
 */
export function loadDampeningFactor(
  forecast24h: number,
  referenceDose: number,
): number {
  if (!(referenceDose > 0)) return 1
  if (!(forecast24h > 0)) return 1
  return Math.max(LOAD_DAMPENING_FLOOR, 1 - forecast24h / referenceDose)
}

// ─── Composite Score & Signal ───────────────────────────────────

/**
 * Map ATE composite (-2.0 to +2.0) to UI display score (0-100).
 */
export function compositeToDisplayScore(composite: number): number {
  return Math.round(Math.min(100, Math.max(0, (composite + 2) / 4 * 100)))
}

/**
 * Classify signal from composite score (ATE thresholds).
 */
export function classifyStatus(composite: number): ReadinessStatus {
  if (composite >= THRESHOLD_PEAK) return 'PEAK'
  if (composite >= THRESHOLD_GREEN) return 'GREEN'
  if (composite >= THRESHOLD_YELLOW) return 'YELLOW'
  return 'RED'
}

/**
 * Calculate full readiness score (ATE-aligned).
 *
 * `loadDampening` (default `1`, no-op) attenuates the Load component to
 * acknowledge recent eccentric (descent) work — see {@link loadDampeningFactor}
 * for the producer. Affects only the composite sum; `components.trainingLoad`
 * still reports the raw `scoreLoad(acwr)` so the dampening is observable
 * separately from the training-load score itself.
 */
export function calculateReadiness(
  today: GarminHealthData,
  baselines: ReadinessBaselines,
  acwr: number,
  hrvCV: number,
  loadDampening: number = 1,
  tuning: ReadinessTuning = DEFAULT_READINESS_TUNING,
): ReadinessScore {
  const hrvScore = scoreHRV(today, baselines, hrvCV)
  const rhrScore = scoreRHR(today.rhr, baselines.rhr)
  const sleepScore = scoreSleep(today.sleep)
  const loadScore = scoreLoad(acwr, tuning)

  const composite =
    hrvScore * WEIGHT_HRV +
    rhrScore * WEIGHT_RHR +
    sleepScore * WEIGHT_SLEEP +
    loadScore * loadDampening * WEIGHT_LOAD

  const roundedComposite = Math.round(composite * 100) / 100
  const status = classifyStatus(roundedComposite)

  const components: ReadinessScoreComponents = {
    hrv: hrvScore,
    rhr: rhrScore,
    sleep: sleepScore,
    trainingLoad: loadScore,
  }

  return {
    date: today.date,
    composite: roundedComposite,
    displayScore: compositeToDisplayScore(roundedComposite),
    status,
    trainingState: 'A', // placeholder — set by classifyTrainingState
    components,
    message: '',
    adjustment: '',
    acwr,
  }
}

// ─── Training State Classification (ATE, Firstbeat WP-G2) ──────

export function classifyTrainingState(
  composite: number,
  acwr: number,
  consecutiveRedDays: number,
  trend7dDeclining: boolean,
  tuning: ReadinessTuning = DEFAULT_READINESS_TUNING,
): TrainingState {
  // Priority: D > C > B > A (worst state wins)

  // State D: Overtrained
  if (consecutiveRedDays >= tuning.stateDConsecutiveRed || trend7dDeclining) return 'D'

  // State C: Overreaching
  if (composite < 0 || (composite < STATE_B_THRESHOLD && acwr > tuning.acwrSweetTop)) return 'C'

  // State B: Not fully recovered
  if (composite >= 0 && composite < STATE_B_THRESHOLD) return 'B'

  // State A: Well recovered
  return 'A'
}

/**
 * Count consecutive RED days from the end of the scores array.
 */
export function countConsecutiveRedDays(scores: ReadinessScore[]): number {
  let count = 0
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i].status === 'RED') count++
    else break
  }
  return count
}

/**
 * Check if HRV is declining over 7 consecutive days.
 */
export function check7dDecliningTrend(healthHistory: GarminHealthData[]): boolean {
  const hrvValues = healthHistory
    .filter(d => d.hrv?.lastNightAvg)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
    .map(d => d.hrv!.lastNightAvg)

  if (hrvValues.length < 7) return false

  // Check strictly declining
  for (let i = 1; i < hrvValues.length; i++) {
    if (hrvValues[i] >= hrvValues[i - 1]) return false
  }
  return true
}

/**
 * Build full training state info including medical flags.
 */
export function buildTrainingStateInfo(
  state: TrainingState,
  consecutiveRedDays: number,
): TrainingStateInfo {
  let stateDDurationDays = 0
  let medicalFlagLevel: TrainingStateInfo['medicalFlagLevel'] = 'none'

  if (state === 'D') {
    stateDDurationDays = consecutiveRedDays
    if (stateDDurationDays >= 21) medicalFlagLevel = 'critical'
    else if (stateDDurationDays >= 14) medicalFlagLevel = 'warning'
    else if (stateDDurationDays >= 7) medicalFlagLevel = 'info'
  }

  return { state, consecutiveRedDays, stateDDurationDays, medicalFlagLevel }
}

// ─── Deload Programming (ATE, State D) ──────────────────────────

export function computeDeloadProgram(): DeloadDay[] {
  return [
    { dayNumber: 1, intensityCap: 0, maxMinutes: 0, zoneLimit: 'rest', description: 'Complete rest — gentle mobility only (20-30 min)' },
    { dayNumber: 2, intensityCap: 0, maxMinutes: 0, zoneLimit: 'rest', description: 'Complete rest — gentle mobility only (20-30 min)' },
    { dayNumber: 3, intensityCap: 0.6, maxMinutes: 35, zoneLimit: 'Z1', description: 'Zone 1 only, 30-35 min easy' },
    { dayNumber: 4, intensityCap: 0.6, maxMinutes: 35, zoneLimit: 'Z1', description: 'Zone 1 only, 30-35 min easy' },
    { dayNumber: 5, intensityCap: 0.7, maxMinutes: 45, zoneLimit: 'Z1-2', description: 'Zone 1-2, 40-45 min easy' },
    { dayNumber: 6, intensityCap: 0.7, maxMinutes: 45, zoneLimit: 'Z1-2', description: 'Zone 1-2, 40-45 min easy' },
    { dayNumber: 7, intensityCap: 0.5, maxMinutes: 0, zoneLimit: 'reassess', description: 'Reassessment day — check readiness before resuming' },
  ]
}

// ─── Guardrails (ATE-aligned) ───────────────────────────────────

// Display-score bounds for each status band, derived from the same composite
// thresholds used to classify status. Used to keep the shown number honest
// after a guardrail downgrades the status (e.g. avoid "YELLOW 70/100").
const STATUS_DISPLAY_BANDS: Record<ReadinessStatus, [number, number]> = {
  PEAK: [compositeToDisplayScore(THRESHOLD_PEAK), 100],
  GREEN: [compositeToDisplayScore(THRESHOLD_GREEN), compositeToDisplayScore(THRESHOLD_PEAK)],
  YELLOW: [compositeToDisplayScore(THRESHOLD_YELLOW), compositeToDisplayScore(THRESHOLD_GREEN)],
  RED: [0, compositeToDisplayScore(THRESHOLD_YELLOW)],
}

/** Clamp a display score into the band for `status` so badge and number agree. */
function clampDisplayScoreToStatus(displayScore: number, status: ReadinessStatus): number {
  const [min, max] = STATUS_DISPLAY_BANDS[status]
  return Math.min(max, Math.max(min, displayScore))
}

/**
 * Athlete's typical active-day training load: the mean of positive daily TRIMP
 * totals. Rest days (zero load) are excluded so they don't drag the reference
 * down. Returns 0 when there is no training history to compare against.
 */
function referenceActiveLoad(dailyTrimp: DailyTRIMP[]): number {
  const active = dailyTrimp.map(d => d.total).filter(t => t > 0)
  if (active.length === 0) return 0
  return active.reduce((s, v) => s + v, 0) / active.length
}

/**
 * Whether the athlete actually trained on `date` hard enough for it to carry
 * structural (musculoskeletal) load. A rest or easy day — well below the
 * athlete's typical active-day load — returns false. With no usable reference
 * load we cannot establish that a day was hard, so we return false rather than
 * assume it was.
 */
function dayCarriedStructuralLoad(
  date: string,
  dailyTrimp: DailyTRIMP[],
  referenceLoad: number,
): boolean {
  if (referenceLoad <= 0) return false
  const total = dailyTrimp.find(t => t.date === date)?.total ?? 0
  return total >= STRUCTURAL_LOAD_FRACTION * referenceLoad
}

export function applyGuardrails(
  scores: ReadinessScore[],
  healthHistory: GarminHealthData[],
  dailyTrimp: DailyTRIMP[],
  acwr: number,
  tuning: ReadinessTuning = DEFAULT_READINESS_TUNING,
): ReadinessScore[] {
  if (scores.length === 0) return scores

  const result = [...scores.map(s => ({ ...s, guardrailsTriggered: [...(s.guardrailsTriggered || [])] }))]
  const referenceLoad = referenceActiveLoad(dailyTrimp)

  for (let i = 0; i < result.length; i++) {
    const score = result[i]
    const dayHealth = healthHistory.find(h => h.date === score.date)

    // 1. ACWR guardrail (ATE apply_acwr_guardrail)
    if (acwr > tuning.acwrDanger && (score.status === 'PEAK' || score.status === 'GREEN')) {
      score.status = 'YELLOW'
      score.guardrailsTriggered!.push(`ACWR ${acwr.toFixed(2)} > ${tuning.acwrDanger} — capped at YELLOW`)
    } else if (acwr > tuning.acwrSweetTop && score.status === 'PEAK') {
      score.status = 'GREEN'
      score.guardrailsTriggered!.push(`ACWR ${acwr.toFixed(2)} > ${tuning.acwrSweetTop} — capped at GREEN`)
    }

    // 2. Body Battery gate (ATE apply_body_battery_gate)
    if (dayHealth?.bodyBattery && dayHealth.bodyBattery.current < BODY_BATTERY_GATE) {
      if (score.status === 'PEAK' || score.status === 'GREEN') {
        score.status = 'YELLOW'
        score.guardrailsTriggered!.push(`Body Battery ${dayHealth.bodyBattery.current} < ${BODY_BATTERY_GATE} — capped at YELLOW`)
      }
    }

    // 3. Acute overrides (ATE apply_acute_overrides)
    if (dayHealth?.sleep) {
      const sleepHours = dayHealth.sleep.durationSeconds / 3600
      if (sleepHours < ACUTE_SLEEP_FLOOR && (score.status === 'PEAK' || score.status === 'GREEN')) {
        score.status = 'YELLOW'
        score.guardrailsTriggered!.push(`Sleep ${sleepHours.toFixed(1)}h < ${ACUTE_SLEEP_FLOOR}h — forced YELLOW`)
      }
    }

    // RMSSD acute drop check
    if (dayHealth?.hrv?.lastNightAvg) {
      const recentHRV = healthHistory
        .filter(h => h.hrv?.lastNightAvg && h.date < score.date)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7)
        .map(h => h.hrv!.lastNightAvg)

      if (recentHRV.length >= 3) {
        const mean7d = recentHRV.reduce((s, v) => s + v, 0) / recentHRV.length
        const dropPct = ((mean7d - dayHealth.hrv.lastNightAvg) / mean7d) * 100
        if (dropPct > ACUTE_RMSSD_DROP_PCT && (score.status === 'PEAK' || score.status === 'GREEN')) {
          score.status = 'RED'
          score.guardrailsTriggered!.push(`RMSSD dropped ${dropPct.toFixed(0)}% vs 7d mean — forced RED`)
        }
      }
    }

    // 4. Consecutive guardrails (ATE apply_consecutive_guardrails)
    // After 2 hard-trained high-readiness days, force an easy day so
    // musculoskeletal load (which HRV/RHR can't see) doesn't accumulate.
    // Only counts days the athlete actually trained — resting or easy days
    // carry no structural load, so they should NOT trip this cap.
    if (i >= MAX_CONSEC_HIGH) {
      const prevDays = [result[i - 1], result[i - 2]]
      const allHigh = prevDays.every(d => d?.status === 'GREEN' || d?.status === 'PEAK')
      const allTrained = prevDays.every(d => d && dayCarriedStructuralLoad(d.date, dailyTrimp, referenceLoad))
      if (allHigh && allTrained && (score.status === 'GREEN' || score.status === 'PEAK')) {
        score.status = 'YELLOW'
        score.guardrailsTriggered!.push('2 hard-trained days in a row — easy day for structural recovery')
      }
    }

    // Max 2 consecutive RED → allow GREEN
    if (i >= 2 &&
        result[i].status === 'RED' &&
        result[i - 1].status === 'RED' &&
        result[i - 2].status === 'RED') {
      score.status = 'YELLOW'
      score.guardrailsTriggered!.push('3+ consecutive RED — forced YELLOW (prevent detraining)')
    }

    // Max 1 PEAK per 7 days
    if (score.status === 'PEAK') {
      const peaksInWindow = result
        .slice(Math.max(0, i - 6), i)
        .filter(s => s.status === 'PEAK').length
      if (peaksInWindow >= MAX_PEAK_PER_WEEK) {
        score.status = 'GREEN'
        score.guardrailsTriggered!.push('Max 1 PEAK per 7 days — downgraded to GREEN')
      }
    }

    // Keep the displayed number consistent with the (possibly downgraded)
    // status so we never show e.g. "YELLOW 70/100". No-op when the status
    // was not changed, since the composite-derived score is already in band.
    score.displayScore = clampDisplayScoreToStatus(score.displayScore, score.status)
  }

  return result
}

// ─── HRV Stability Check ────────────────────────────────────────

export function checkHRVStability(healthHistory: GarminHealthData[]): { stable: boolean; cv: number } {
  const hrvValues = healthHistory
    .filter(d => d.hrv?.lastNightAvg)
    .map(d => Math.log(d.hrv!.lastNightAvg))

  if (hrvValues.length < 7) return { stable: true, cv: 0 }

  const recent = hrvValues.slice(-14)
  const baseline = calculateBaseline(recent)
  const cv = baseline.mean > 0 ? (baseline.stdDev / baseline.mean) * 100 : 0

  return { stable: cv <= CV_ALERT_THRESHOLD, cv: Math.round(cv * 10) / 10 }
}

// ─── Injury Risk Flagging (proactive trend analysis) ──────────

export interface RiskFlag {
  id: string
  severity: 'watch' | 'warning' | 'alert'
  title: string
  message: string
  metric?: string
}

/** 3-day HRV slope via linear regression on ln(RMSSD).
 *  A negative slope below threshold indicates HRV is dropping rapidly —
 *  strong signal for non-functional overreaching. */
export function check3dHRVSlope(healthHistory: GarminHealthData[]): {
  slope: number
  decelerating: boolean
} {
  const recent = healthHistory
    .filter(d => d.hrv?.lastNightAvg && d.hrv.lastNightAvg > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-3)

  if (recent.length < 3) return { slope: 0, decelerating: false }

  const hrvLog = recent.map(d => Math.log(d.hrv!.lastNightAvg))
  const x = [0, 1, 2]
  const meanX = 1
  const meanY = (hrvLog[0] + hrvLog[1] + hrvLog[2]) / 3
  const num = x.reduce((s, xi, i) => s + (xi - meanX) * (hrvLog[i] - meanY), 0)
  const den = x.reduce((s, xi) => s + (xi - meanX) ** 2, 0)
  const slope = den > 0 ? num / den : 0

  // Threshold: -0.12 in log space ≈ -11% per day (meaningful decline)
  return { slope, decelerating: slope < -0.12 }
}

/** Detect accelerating ACWR (second-derivative check).
 *  If ACWR went 1.1 → 1.2 → 1.4, the rate of increase is accelerating,
 *  which is worse than steady ramp. Strong signal to deload. */
export function checkACWRAcceleration(performance: PerformanceMetrics[]): {
  accelerating: boolean
  acwrNow: number
  acwr3dAgo: number
  acwr7dAgo: number
} {
  if (performance.length < 8) return { accelerating: false, acwrNow: 0, acwr3dAgo: 0, acwr7dAgo: 0 }

  const now = performance[performance.length - 1]
  const ago3d = performance[performance.length - 4]
  const ago7d = performance[performance.length - 8]

  const acwrNow = now.acwr || 0
  const acwr3d = ago3d?.acwr || 0
  const acwr7d = ago7d?.acwr || 0

  // Rate change: if delta(3d) > delta(prev 4d), acceleration
  const delta3d = acwrNow - acwr3d
  const delta4d = acwr3d - acwr7d
  const accelerating = delta3d > 0.1 && delta3d > delta4d && acwrNow > 1.25

  return { accelerating, acwrNow, acwr3dAgo: acwr3d, acwr7dAgo: acwr7d }
}

/** Multi-day recovery failure: both HRV below baseline AND RHR above
 *  baseline for 3+ of last 5 days. Classic overtraining signature. */
export function checkRecoveryFailure(healthHistory: GarminHealthData[]): {
  failing: boolean
  lowHRVDays: number
  elevatedRHRDays: number
} {
  const recent = healthHistory
    .filter(d => d.hrv?.lastNightAvg && d.rhr != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)

  if (recent.length < 7) return { failing: false, lowHRVDays: 0, elevatedRHRDays: 0 }

  const last5 = recent.slice(-5)
  const prior9 = recent.slice(0, -5)
  if (prior9.length < 5) return { failing: false, lowHRVDays: 0, elevatedRHRDays: 0 }

  const hrvBaseline = calculateBaseline(prior9.map(d => Math.log(d.hrv!.lastNightAvg)))
  const rhrBaseline = calculateBaseline(prior9.map(d => d.rhr!))

  let lowHRVDays = 0
  let elevatedRHRDays = 0
  for (const d of last5) {
    if (Math.log(d.hrv!.lastNightAvg) < hrvBaseline.mean - hrvBaseline.stdDev * 0.5) lowHRVDays++
    if (d.rhr! > rhrBaseline.mean + 2) elevatedRHRDays++
  }

  return {
    failing: lowHRVDays >= 3 && elevatedRHRDays >= 3,
    lowHRVDays,
    elevatedRHRDays,
  }
}

/** Direction a soreness series is moving in. `falling` = the athlete is
 *  recovering (soreness easing), `rising` = getting worse. */
export type SorenessDirection = 'rising' | 'falling' | 'flat'

/**
 * Sign of the linear-regression slope over a soreness series ordered
 * oldest→newest, with a deadband so noise reads as `flat`. Values are in
 * load-adjustment units (the SORENESS_LOAD_ADJUSTMENT scale), where the
 * smallest meaningful step is 15, so a per-day slope of ±1 is a safe
 * deadband — any real day-over-day change clears it.
 */
export function sorenessTrendDirection(series: number[]): SorenessDirection {
  if (series.length < 2) return 'flat'
  const n = series.length
  const meanX = (n - 1) / 2
  const meanY = series.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (series[i] - meanY)
    den += (i - meanX) ** 2
  }
  const slope = den > 0 ? num / den : 0
  if (slope > 1) return 'rising'
  if (slope < -1) return 'falling'
  return 'flat'
}

/**
 * Check for escalating DOMS/soreness — user-reported soreness elevated
 * on 3+ of the last 5 days OR increasing for 3 consecutive days. These
 * patterns correlate with eccentric overload (Twist & Highton 2013) and
 * raise injury risk if training continues at the same intensity.
 *
 * `direction` reports which way reported soreness is actually moving over
 * the recent window. Elevated soreness that is FALLING means the athlete
 * is recovering — callers must not frame it as escalation.
 */
export function checkEscalatingSoreness(
  sorenessLoadByDate: Map<string, number>,
): {
  escalating: boolean
  elevatedDays: number
  trending: boolean
  direction: SorenessDirection
  last: number
} {
  const today = new Date()
  const recent: { date: string; adj: number; reported: boolean }[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${day}`
    recent.push({ date: key, adj: sorenessLoadByDate.get(key) ?? 0, reported: sorenessLoadByDate.has(key) })
  }
  // Soreness adjustment > 0 means user reported moderate-or-worse soreness
  // (Level 3 = +15, Level 4 = +35, Level 5 = +65; Level 2 = 0; Level 1 = -15)
  const elevatedDays = recent.filter(r => r.adj > 0).length
  // Trending: last 3 consecutive days all elevated AND non-decreasing
  const last3 = recent.slice(0, 3)
  const trending =
    last3.every(r => r.adj > 0) &&
    last3[0].adj >= last3[1].adj &&
    last3[1].adj >= last3[2].adj
  // Direction from the days the athlete actually reported, oldest→newest.
  // Fall back to the zero-filled window only when we have too few reports
  // to read a slope.
  const reportedSeries = recent.filter(r => r.reported).map(r => r.adj).reverse()
  const series = reportedSeries.length >= 2 ? reportedSeries : recent.map(r => r.adj).reverse()
  const direction = sorenessTrendDirection(series)
  return {
    escalating: elevatedDays >= 3 || trending,
    elevatedDays,
    trending,
    direction,
    last: recent[0].adj,
  }
}

/**
 * Scan upcoming planned days for the next quad-loading session
 * (eccentric strength, plyo/bounding, downhill-heavy long runs).
 * Returns null if none found in the window.
 */
export function findNextQuadLoadingSession(
  daysAhead: PlannedDay[],
): { day: string; workout: string } | null {
  const QUAD_KEYWORDS = /\b(bound(?:ing)?|plyo|depth\s*jump|step[- ]?down|eccentric|nordic|drop\s*jump|downhill|descent|split\s*squat|bulgarian|step[- ]?up)\b/i
  for (const d of daysAhead) {
    if (!d || d.type === 'rest' || d.type === 'travel') continue
    const haystack = `${d.workout} ${d.detail}`
    if (QUAD_KEYWORDS.test(haystack)) {
      return { day: d.day, workout: d.workout }
    }
  }
  return null
}

/** Easy/aerobic workouts that don't add meaningful quad-loading. */
function isLowQuadLoadDay(d: PlannedDay | undefined): boolean {
  if (!d) return true
  if (d.type === 'rest' || d.type === 'travel' || d.type === 'limited' || d.type === 'cross') return true
  // Easy/Z1-2 runs are aerobic; long runs and quality runs can load quads
  if (d.type === 'run') {
    const z = (d.zone || '').toLowerCase()
    return /z1|z2/.test(z) && !/z3|z4|z5/.test(z)
  }
  return false
}

/** Run all risk checks and return a prioritized list of flags. */
export function checkInjuryRisk(
  healthHistory: GarminHealthData[],
  performance: PerformanceMetrics[],
  sorenessLoadByDate?: Map<string, number>,
  todayPlanned?: PlannedDay,
  daysAhead?: PlannedDay[],
): RiskFlag[] {
  const flags: RiskFlag[] = []

  const hrvSlope = check3dHRVSlope(healthHistory)
  if (hrvSlope.decelerating) {
    flags.push({
      id: 'hrv_slope',
      severity: 'warning',
      title: 'HRV dropping fast',
      message: `HRV has declined steeply over 3 days (slope ${hrvSlope.slope.toFixed(2)}). Consider 1-2 easy days to allow recovery.`,
      metric: `slope: ${hrvSlope.slope.toFixed(2)}`,
    })
  }

  const acwrAccel = checkACWRAcceleration(performance)
  if (acwrAccel.accelerating) {
    flags.push({
      id: 'acwr_accel',
      severity: 'alert',
      title: 'Training load ramp accelerating',
      message: `ACWR jumped from ${acwrAccel.acwr3dAgo.toFixed(2)} to ${acwrAccel.acwrNow.toFixed(2)} in 3 days. Injury risk climbing. Deload this week.`,
      metric: `ACWR ${acwrAccel.acwrNow.toFixed(2)}`,
    })
  }

  const recovery = checkRecoveryFailure(healthHistory)
  if (recovery.failing) {
    flags.push({
      id: 'recovery_fail',
      severity: 'alert',
      title: 'Recovery system under strain',
      message: `HRV below baseline on ${recovery.lowHRVDays}/5 days AND RHR elevated on ${recovery.elevatedRHRDays}/5 days. Classic overtraining signature. Take 2-3 rest days and re-evaluate.`,
      metric: `${recovery.lowHRVDays}/5 low HRV · ${recovery.elevatedRHRDays}/5 high RHR`,
    })
  }

  const decliningTrend = check7dDecliningTrend(healthHistory)
  if (decliningTrend) {
    flags.push({
      id: 'hrv_decline_7d',
      severity: 'warning',
      title: 'HRV declining every day this week',
      message: 'HRV has decreased on each of the last 7 days. This is rare and suggests accumulating fatigue faster than you can recover.',
    })
  }

  if (sorenessLoadByDate) {
    const soreness = checkEscalatingSoreness(sorenessLoadByDate)
    // Only flag escalation when soreness is NOT already easing. Elevated
    // soreness that's trending DOWN is recovery in progress, not an
    // eccentric-overload alarm — flagging it produces the false "soreness
    // climbing" read the athlete shouldn't see. The improving-but-elevated
    // state is still surfaced neutrally via the snapshot's soreness trend.
    if (soreness.escalating && soreness.direction !== 'falling') {
      const severity: RiskFlag['severity'] = soreness.trending && soreness.last >= 35 ? 'alert' : 'warning'
      const nextQuad = daysAhead ? findNextQuadLoadingSession(daysAhead) : null
      const todayClear = isLowQuadLoadDay(todayPlanned)

      const todayLine = todayClear
        ? `Today's ${todayPlanned?.workout ?? 'session'} is fine — easy aerobic work doesn't add quad load.`
        : `Today's ${todayPlanned?.workout ?? 'session'} loads the quads — drop intensity or swap if soreness is climbing.`

      const watchLine = nextQuad
        ? ` Watching ${nextQuad.day}'s ${nextQuad.workout} — if soreness is still trending up tomorrow, that's the one we cut.`
        : ` If soreness keeps climbing, the next quad-loading session (heavy squats, bounding, downhill) gets pulled.`

      const trendLine = soreness.trending
        ? `Soreness has been elevated and trending up for 3 days — classic eccentric-overload signal.`
        : `Elevated soreness on ${soreness.elevatedDays}/5 recent days — recovery lagging behind training stimulus.`

      const title = todayClear ? 'Quad-loading at risk' : 'Muscle soreness escalating'

      flags.push({
        id: 'escalating_soreness',
        severity,
        title,
        message: `${trendLine} ${todayLine}${watchLine}`,
        metric: `soreness adj +${soreness.last}`,
      })
    }
  }

  return flags
}

// ─── Conversational Messages (ATE-aligned) ──────────────────────

const STATE_LABELS: Record<TrainingState, string> = {
  A: 'Well recovered',
  B: 'Not fully recovered',
  C: 'Overreaching',
  D: 'Overtrained — deload recommended',
}

export function generateReadinessMessage(
  score: ReadinessScore,
  todayWorkout?: PlannedDay,
): string {
  const { status, components, trainingState } = score

  const parts: string[] = []

  // HRV context
  if (components.hrv >= 1) parts.push('HRV above baseline')
  else if (components.hrv <= -0.5) parts.push('HRV below baseline')

  // Sleep context
  if (components.sleep >= 1) parts.push('good sleep')
  else if (components.sleep <= -1) parts.push('sleep was short')

  // Load context
  if (components.trainingLoad <= -0.5) parts.push('training ramp elevated')
  else if (components.trainingLoad >= 1) parts.push('well-rested from training')

  const context = parts.length > 0 ? parts.join(', ') + '. ' : ''

  if (status === 'PEAK') {
    const workoutRef = todayWorkout ? ` Go all-in on today's ${todayWorkout.workout}.` : ' Ideal day for your hardest session.'
    return `Peak recovery — ${context}${workoutRef}`
  }

  if (status === 'GREEN') {
    const workoutRef = todayWorkout ? ` Go for today's ${todayWorkout.workout}.` : ''
    return `Strong recovery — ${context}${workoutRef}`
  }

  if (status === 'YELLOW') {
    if (trainingState === 'C') {
      return `Overreaching detected — ${context}48-72h easy block recommended. Zone 1-2 only.`
    }
    return `Moderate recovery — ${context}Consider reducing intensity to Z1-2 today.`
  }

  // RED
  if (trainingState === 'D') {
    return `${STATE_LABELS.D} — ${context}Complete rest or very light movement only. Focus on sleep and nutrition.`
  }
  return `Low recovery — ${context}Swap for an easy walk or rest day.`
}

// ─── Daily Workout Adjustments (ATE signal × state matrix) ──────

export function suggestDailyAdjustment(
  status: ReadinessStatus,
  trainingState: TrainingState,
  workoutType: WorkoutType,
  components: ReadinessScoreComponents,
): string {
  // PEAK + State A: go all-in
  if (status === 'PEAK' && trainingState === 'A') {
    return 'Peak form — execute planned workout at full intensity. Great day for VO2max intervals or race-pace work.'
  }

  // GREEN + State A: execute as written
  if (status === 'GREEN' && trainingState === 'A') {
    return 'Execute planned workout as written.'
  }

  // GREEN + State B: maintain volume, reduce intensity
  if (status === 'GREEN' && trainingState === 'B') {
    return 'Not fully recovered — maintain planned volume but reduce intensity 10-15%. Stay Z1-3.'
  }

  // YELLOW: Zone 1-2 only, sport-specific adjustments
  if (status === 'YELLOW') {
    if (trainingState === 'C') {
      return 'Overreaching — 48-72h easy block. Walk, yoga, or mobility only. No structured training.'
    }
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

  // RED: complete rest or very easy
  if (trainingState === 'D') {
    return 'Deload active — complete rest or gentle mobility (20-30 min). No structured training until reassessment.'
  }

  switch (workoutType) {
    case 'rest':
    case 'travel':
    case 'limited':
      return 'Rest day — your body needs it. Focus on hydration and sleep tonight.'
    default: {
      const reason = components.sleep <= -1
        ? 'Sleep was insufficient.'
        : components.trainingLoad <= -0.5
        ? 'Training ramp is elevated.'
        : 'Recovery metrics are low.'
      return `Replace with 20-30 min easy walk or full rest. ${reason}`
    }
  }
}
