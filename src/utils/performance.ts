import type { DailyTRIMP, PerformanceMetrics, TSBState, ACWRRisk, WeeklyRecommendation } from '../types'

// ─── Exponentially Weighted Moving Average ──────────────────────
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

  let prev = dailyValues[0].value  // seed with first value

  for (const { date, value } of dailyValues) {
    const ewma = prev * decay + value * factor
    results.push({ date, ewma: Math.round(ewma * 100) / 100 })
    prev = ewma
  }

  return results
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

export function getTSBState(tsb: number): TSBState {
  if (tsb >= 15) return 'peaked'
  if (tsb >= 5) return 'well_rested'
  if (tsb >= -10) return 'productive'
  if (tsb >= -30) return 'overreaching'
  return 'danger'
}

export function getTSBLabel(state: TSBState): string {
  const labels: Record<TSBState, string> = {
    peaked: 'Fresh / Peaked',
    well_rested: 'Well Rested',
    productive: 'Productive Training',
    overreaching: 'Overreaching',
    danger: 'Danger Zone',
  }
  return labels[state]
}

// ─── ACWR Risk Classification ───────────────────────────────────

export function getACWRRisk(acwr: number): ACWRRisk {
  if (acwr < 0.8) return 'detraining'
  if (acwr <= 1.3) return 'sweet_spot'
  if (acwr <= 1.5) return 'caution'
  return 'high_risk'
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
      message: 'Overreaching detected. Consider swapping this week\'s quality sessions for easy runs.',
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

  // Check ACWR too low (< 0.8 for most of the week)
  const lowACWRDays = recent.filter(m => m.acwr > 0 && m.acwr < 0.8).length
  if (lowACWRDays >= 5) {
    recommendations.push({
      type: 'acwr_low',
      severity: 'info',
      message: 'Undertraining. You have capacity for more. Consider adding a tempo segment to an easy run.',
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
