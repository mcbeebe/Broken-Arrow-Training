import type { DailyTRIMP, PerformanceMetrics, TSBState, ACWRRisk, WeeklyRecommendation } from '../types'

// ─── Time window filtering ─────────────────────────────────────

export type TimeWindow = '7d' | '30d' | '90d' | 'all'

/** Filter any date-indexed array to records on-or-after the cutoff. */
export function filterByTimeWindow<T extends { date: string }>(
  data: T[],
  window: TimeWindow,
): T[] {
  if (window === 'all' || data.length === 0) return data
  const days = window === '7d' ? 7 : window === '30d' ? 30 : 90
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return data.filter(d => d.date >= cutoffStr)
}

// ─── Tau-based EWMA (for CTL/ATL/TSB performance display) ──────
// EWMA_today = EWMA_yesterday × e^(-1/τ) + value_today × (1 - e^(-1/τ))

const CTL_TAU = 42  // fitness decay: 42-day time constant
const ATL_TAU = 7   // fatigue decay: 7-day time constant

function ewmaDecay(tau: number): number {
  return Math.exp(-1 / tau)
}

export function calculateEWMA(
  dailyValues: { date: string; value: number }[],
  tau: number,
): { date: string; ewma: number }[] {
  if (dailyValues.length === 0) return []

  const decay = ewmaDecay(tau)
  const factor = 1 - decay
  const results: { date: string; ewma: number }[] = []

  // Seed: average daily load over available history (standard practice when
  // training history is shorter than the time constant). Without this, CTL
  // (tau=42) takes 6+ weeks to converge, producing artificially low fitness
  // and extreme ACWR values with only 30 days of Garmin data.
  const avg = dailyValues.reduce((sum, d) => sum + d.value, 0) / dailyValues.length
  let prev = avg

  for (const { date, value } of dailyValues) {
    const ewma = prev * decay + value * factor
    results.push({ date, ewma: Math.round(ewma * 100) / 100 })
    prev = ewma
  }

  return results
}

// ─── Span-based EWMA (for ACWR — ATE-aligned) ──────────────────
// alpha = 2 / (span + 1) — standard financial/sport science EWMA
// Used for 7-day acute and 28-day chronic workload ratio

function ewmaSpan(values: number[], span: number): number {
  if (values.length === 0) return 0
  const alpha = 2 / (span + 1)
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  let ewma = avg
  for (let i = 1; i < values.length; i++) {
    ewma = alpha * values[i] + (1 - alpha) * ewma
  }
  return ewma
}

/**
 * Calculate ACWR using ATE's span-based EWMA (7-day acute / 28-day chronic).
 * This is separate from the tau-based CTL/ATL used for the performance timeline.
 */
export function calculateSpanACWR(dailyTrimp: DailyTRIMP[]): number {
  if (dailyTrimp.length < 7) return 0

  const dailyValues = dailyTrimp.map(d => d.total)
  const acute = ewmaSpan(dailyValues, 7)
  const chronic = ewmaSpan(dailyValues, 28)

  if (chronic <= 0) return 0
  return Math.round((acute / chronic) * 100) / 100
}

/**
 * Check weekly TRIMP overload (ATE guardrail).
 * Returns ratio of 7d sum to 28d weekly average.
 */
export function checkWeeklyTRIMPOverload(dailyTrimp: DailyTRIMP[]): { ratio: number; overloaded: boolean } {
  if (dailyTrimp.length < 28) return { ratio: 0, overloaded: false }

  const last7 = dailyTrimp.slice(-7).reduce((sum, d) => sum + d.total, 0)
  const last28 = dailyTrimp.slice(-28).reduce((sum, d) => sum + d.total, 0)
  const weeklyAvg28d = last28 / 4 // 28 days = 4 weeks

  if (weeklyAvg28d <= 0) return { ratio: 0, overloaded: false }

  const ratioPct = (last7 / weeklyAvg28d) * 100
  return {
    ratio: Math.round(ratioPct),
    overloaded: ratioPct > 120, // ATE threshold: 120%
  }
}

// ─── Performance Timeline ───────────────────────────────────────

export function calculatePerformanceTimeline(dailyTrimp: DailyTRIMP[]): PerformanceMetrics[] {
  if (dailyTrimp.length === 0) return []

  const values = dailyTrimp.map(d => ({ date: d.date, value: d.total }))
  const ctlSeries = calculateEWMA(values, CTL_TAU)
  const atlSeries = calculateEWMA(values, ATL_TAU)

  return ctlSeries.map((ctlEntry, i) => {
    const ctl = ctlEntry.ewma
    const atl = atlSeries[i].ewma
    const tsb = Math.round((ctl - atl) * 100) / 100
    const acwr = ctl > 1 ? Math.round((atl / ctl) * 100) / 100 : 0

    return {
      date: ctlEntry.date,
      ctl,
      atl,
      tsb,
      acwr,
    }
  })
}

// ─── TSB State Classification ───────────────────────────────────
// Banister impulse-response model (Banister et al. 1975; Morton et al. 1990).
// Specific TSB thresholds are coaching conventions widely adopted via
// TrainingPeaks (Coggan/Allen 2010). Taper research supports TSB +10 to +30
// as race-ready (Mujika & Padilla 2003; Bosquet et al. 2007), which aligns
// with our +15/+25 "peaked" zone.
// Overreaching zone (-30 to -10) aligns with functional overreaching
// definitions in Meeusen et al. 2013 (ECSS/ACSM joint statement).

export function getTSBState(tsb: number): TSBState {
  if (tsb >= 15) return 'peaked'      // Mujika & Padilla 2003: taper sweet spot
  if (tsb >= 5) return 'well_rested'
  if (tsb >= -10) return 'productive'  // Normal training stress
  if (tsb >= -30) return 'overreaching' // Functional overreaching (Meeusen 2013)
  return 'danger'                       // Non-functional overreaching risk
}

export function getTSBLabel(state: TSBState): string {
  const labels: Record<TSBState, string> = {
    peaked: 'Fresh / Peaked',
    well_rested: 'Well Rested',
    productive: 'Productive Training',
    overreaching: 'Overreaching',
    danger: 'Deep Fatigue Debt',
  }
  return labels[state]
}

// ─── ACWR Risk Classification ───────────────────────────────────
// Gabbett 2016 meta-analysis: ACWR 0.8–1.3 = lowest injury incidence.
// Hulin et al. 2014: ACWR > 1.5 = 2–4× injury risk in cricket/rugby.
// Blanch & Gabbett 2016: confirmed across multiple sports.
// Note: Gabbett 2020 revisited these thresholds, noting they're
// population-level guidelines, not individual prescriptions.

export function getACWRRisk(acwr: number): ACWRRisk {
  if (acwr < 0.8) return 'detraining'  // Gabbett 2016: underpreparedness risk
  if (acwr <= 1.3) return 'sweet_spot'  // Gabbett 2016: lowest injury incidence
  if (acwr <= 1.5) return 'caution'     // Transitional zone
  return 'high_risk'                     // Hulin 2014: 2–4× injury risk
}

export function getACWRLabel(risk: ACWRRisk): string {
  const labels: Record<ACWRRisk, string> = {
    detraining: 'Undertraining',
    sweet_spot: 'Sweet Spot',
    caution: 'Caution',
    high_risk: 'High Injury Risk',
  }
  return labels[risk]
}

// ─── Race Day TSB Projection ────────────────────────────────────

export function projectRaceDayTSB(
  timeline: PerformanceMetrics[],
  raceDateStr: string,
  plannedDailyTrimp: number = 0,
): { projectedTSB: number; daysOut: number; onTrack: boolean } {
  if (timeline.length === 0) return { projectedTSB: 0, daysOut: 0, onTrack: false }

  const lastMetrics = timeline[timeline.length - 1]
  const lastDate = new Date(lastMetrics.date)
  const raceDate = new Date(raceDateStr)
  const daysOut = Math.max(0, Math.floor((raceDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)))

  // Project forward assuming planned daily TRIMP, with CTL and ATL decaying
  let ctl = lastMetrics.ctl
  let atl = lastMetrics.atl
  const ctlDecay = ewmaDecay(CTL_TAU)
  const atlDecay = ewmaDecay(ATL_TAU)
  const ctlFactor = 1 - ctlDecay
  const atlFactor = 1 - atlDecay

  for (let d = 0; d < daysOut; d++) {
    ctl = ctl * ctlDecay + plannedDailyTrimp * ctlFactor
    atl = atl * atlDecay + plannedDailyTrimp * atlFactor
  }

  const projectedTSB = Math.round((ctl - atl) * 10) / 10
  const onTrack = projectedTSB >= 10 && projectedTSB <= 30

  return { projectedTSB, daysOut, onTrack }
}

// ─── Weekly Recommendations ─────────────────────────────────────

export function generateWeeklyRecommendations(
  timeline: PerformanceMetrics[],
  currentWeekNum: number,
  raceDateStr: string,
): WeeklyRecommendation[] {
  const recommendations: WeeklyRecommendation[] = []

  if (timeline.length === 0) return recommendations

  const recent = timeline.slice(-7)
  const latest = timeline[timeline.length - 1]

  // Check for sustained overreaching (TSB < -30 for 3+ days)
  const overreachingDays = recent.filter(m => m.tsb < -30).length
  if (overreachingDays >= 3) {
    recommendations.push({
      type: 'overreaching',
      severity: 'alert',
      message: 'Recovery Balance (TSB) below -30 for 3+ days — fatigue is outpacing your fitness base. Normal early in a plan while CTL builds. Check the Readiness tab: if GREEN, your body is handling it. If YELLOW/RED, consider swapping quality sessions for easy runs.',
      weekNum: currentWeekNum,
    })
  }

  // Check ACWR spike (> 1.5)
  if (latest.acwr > 1.5) {
    recommendations.push({
      type: 'acwr_spike',
      severity: 'alert',
      message: `Training spike — injury risk elevated (ACWR ${latest.acwr.toFixed(2)}). Reduce this week's volume by 30%.`,
      weekNum: currentWeekNum,
    })
  }

  // Check ACWR too low — only if TODAY's ACWR is genuinely low.
  // Previous logic checked 5/7 days < 0.8, but rest days naturally have low ACWR
  // which caused false "undertraining" alerts even during heavy training weeks.
  // Now only triggers if today's ACWR is very low (< 0.7) — clear detraining signal.
  if (latest.acwr > 0 && latest.acwr < 0.7) {
    recommendations.push({
      type: 'acwr_low',
      severity: 'info',
      message: 'Training load is below your fitness base. Consider adding a tempo segment to maintain fitness.',
      weekNum: currentWeekNum,
    })
  }

  // Check CTL plateau (declining during build phase, weeks 1-8)
  if (currentWeekNum >= 3 && currentWeekNum <= 8 && timeline.length >= 14) {
    const twoWeeksAgo = timeline[timeline.length - 14]
    if (latest.ctl < twoWeeksAgo.ctl * 0.95) {
      recommendations.push({
        type: 'ctl_plateau',
        severity: 'warning',
        message: `Fitness plateau detected. CTL dropped from ${twoWeeksAgo.ctl.toFixed(0)} to ${latest.ctl.toFixed(0)} over 2 weeks. Volume may need to increase.`,
        weekNum: currentWeekNum,
      })
    }
  }

  // Race day TSB projection
  const projection = projectRaceDayTSB(timeline, raceDateStr, latest.ctl > 0 ? latest.atl * 0.3 : 0)
  if (projection.daysOut > 0 && projection.daysOut <= 42) {
    if (projection.projectedTSB < 10) {
      recommendations.push({
        type: 'taper_early',
        severity: 'warning',
        message: `Taper may need to start earlier. Current projection: TSB ${projection.projectedTSB.toFixed(0)} on race day (target: +15 to +25).`,
      })
    } else if (projection.onTrack) {
      recommendations.push({
        type: 'on_track',
        severity: 'info',
        message: `On track for peak form on June 20. Projected TSB: +${projection.projectedTSB.toFixed(0)}.`,
      })
    }
  }

  return recommendations
}
