/**
 * The one-line verdicts that top each Progress chart.
 *
 * This is the A×B hybrid's grammar, the same one Today speaks: lead with a
 * plain-language read, keep the numbers as evidence beneath it. An athlete
 * should never meet a bare CTL number or a readiness percentage without a
 * sentence telling them what it means.
 *
 * Every verdict is grounded in a threshold the codebase already trusts — the
 * acute:chronic workload ratio for load, the readiness status for readiness —
 * so the words and the charts below them can never disagree. And the honesty
 * rule from the metric contract holds here too: 'bad' is reserved for a state
 * a coach would actually act on (a genuine load spike, a red readiness), not
 * for an ordinary hard week.
 *
 * Pure functions of the series, so the wording is testable without a chart.
 */
import type { PerformanceMetrics, ReadinessScore } from '../types'

export type VerdictTone = 'good' | 'watch' | 'bad' | 'neutral'

export interface ChartVerdict {
  headline: string
  evidence: string
  tone: VerdictTone
}

/** A few days of load history before the ratio means anything. */
export const MIN_LOAD_DAYS = 7

const round = (n: number) => Math.round(n)
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * How the chronic load (fitness) is trending across the recent window —
 * the difference between the latest CTL and the one ~a week back.
 */
function ctlDirection(series: PerformanceMetrics[]): 'rising' | 'steady' | 'easing' {
  if (series.length < 2) return 'steady'
  const latest = series[series.length - 1].ctl
  const prior = series[Math.max(0, series.length - 8)].ctl
  const delta = latest - prior
  if (delta > 1) return 'rising'
  if (delta < -1) return 'easing'
  return 'steady'
}

/**
 * The load verdict, from the acute:chronic workload ratio (ATL/CTL). The
 * bands are the sports-science standard the load engine already uses:
 * 0.8–1.3 is the safe build zone, 1.3–1.5 is near the ceiling, above 1.5 is
 * a spike worth easing, below 0.8 is a light patch or a taper.
 */
export function loadVerdict(performance: PerformanceMetrics[]): ChartVerdict | null {
  if (performance.length < MIN_LOAD_DAYS) return null
  const latest = performance[performance.length - 1]
  const acwr = latest.acwr
  const ctl = round(latest.ctl)
  const dir = ctlDirection(performance)
  const acwrText = `acute:chronic ${round2(acwr)}`

  if (acwr > 1.5) {
    return { tone: 'bad', headline: 'Load is spiking', evidence: `${acwrText} — well above the safe zone; ease back before it costs you.` }
  }
  if (acwr >= 1.3) {
    return { tone: 'watch', headline: 'Ramping hard', evidence: `${acwrText}, near the ceiling. Fine for a push week, not a habit.` }
  }
  if (acwr >= 0.8) {
    return { tone: 'good', headline: 'Load building safely', evidence: `CTL ${ctl} ${dir}, ${acwrText} — right in the build zone.` }
  }
  return { tone: 'neutral', headline: 'Load easing', evidence: `${acwrText} — a light patch or a taper. Fitness holds for a while yet.` }
}

/** Trend of the readiness score across the week (latest vs earliest). */
function readinessDirection(scores: ReadinessScore[]): 'climbing' | 'steady' | 'dipping' {
  if (scores.length < 2) return 'steady'
  const delta = scores[scores.length - 1].displayScore - scores[0].displayScore
  if (delta >= 5) return 'climbing'
  if (delta <= -5) return 'dipping'
  return 'steady'
}

/**
 * The readiness verdict, anchored on the latest status (PEAK/GREEN/YELLOW/RED)
 * with the week's trend as colour. Red is the body genuinely asking for
 * easing; green stable is the honest "you're fine" the tab should lead with.
 */
export function readinessVerdict(weekScores: ReadinessScore[]): ChartVerdict | null {
  if (weekScores.length === 0) return null
  const latest = weekScores[weekScores.length - 1]
  const score = round(latest.displayScore)
  const dir = readinessDirection(weekScores)
  const trend = dir === 'climbing' ? 'climbing this week' : dir === 'dipping' ? 'dipping this week' : 'steady this week'
  const ev = `${score}/100, ${trend}.`

  switch (latest.status) {
    case 'RED':
      return { tone: 'bad', headline: 'Running down', evidence: `${ev} Your body is asking for easier days.` }
    case 'YELLOW':
      return { tone: 'watch', headline: dir === 'dipping' ? 'Readiness dipping' : 'Readiness a touch low', evidence: `${ev} Worth watching, not worth worrying.` }
    case 'PEAK':
      return { tone: 'good', headline: 'Primed', evidence: `${ev} Fresh and ready — a good day to ask something of yourself.` }
    default: // GREEN
      return { tone: 'good', headline: dir === 'climbing' ? 'Readiness climbing' : 'Readiness holding', evidence: `${ev} Recovering as fast as you're training.` }
  }
}
