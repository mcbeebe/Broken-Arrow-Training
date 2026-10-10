/**
 * Recent-trend helpers for the load metrics: the 14-day sparklines in the
 * Performance snapshot and the Fitness change on the Training Load chart.
 *
 * Field request (2026-10-10): "I want to see my fitness improvement better
 * on the graph" and "a spark line of how my key metrics have been tracking
 * over the past 1–2 weeks". The timeline is keyed by date and need not be
 * gap-free, so every lookup here goes by calendar date, never by index.
 */
import type { PerformanceMetrics } from '../types'
import { localDateStr } from './format'

/** The metrics a sparkline can draw. */
export type TrendMetric = 'ctl' | 'atl' | 'tsb' | 'acwr'

/** Where a tap on Today's snapshot lands on the Performance tab: a
 *  metric's full-width card, or the Training Load chart. */
export type PerformanceTarget = TrendMetric | 'load'

/** The DOM id of a target on the Performance tab. */
export const performanceTargetId = (t: PerformanceTarget) => `perf-${t}`

/** How many days a sparkline covers, today included. */
export const SPARK_DAYS = 14
/** How far back the "vs 7d ago" change looks. */
export const DELTA_DAYS = 7

/** `iso` moved by `days` calendar days (local time, so DST can't skew it). */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

/**
 * The timeline's entries in the `days`-day window ending on its newest
 * entry, oldest first. Input order doesn't matter.
 */
export function recentWindow(timeline: PerformanceMetrics[], days: number = SPARK_DAYS): PerformanceMetrics[] {
  if (timeline.length === 0) return []
  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date))
  const end = sorted[sorted.length - 1].date
  const start = shiftDate(end, -(days - 1))
  return sorted.filter(p => p.date >= start)
}

/**
 * The value on `date`, or — the load model carries forward between
 * entries — on the newest entry before it. Null when the timeline starts
 * after `date`.
 */
export function valueOnOrBefore(timeline: PerformanceMetrics[], metric: TrendMetric, date: string): number | null {
  let best: PerformanceMetrics | null = null
  for (const p of timeline) {
    if (p.date <= date && (!best || p.date > best.date)) best = p
  }
  return best ? best[metric] : null
}

/**
 * Today's value minus the value `days` days earlier, or null when the
 * history doesn't reach back that far.
 */
export function changeOver(timeline: PerformanceMetrics[], metric: TrendMetric, days: number = DELTA_DAYS): number | null {
  if (timeline.length === 0) return null
  const latest = timeline.reduce((a, b) => (b.date > a.date ? b : a))
  const then = valueOnOrBefore(timeline, metric, shiftDate(latest.date, -days))
  return then === null ? null : latest[metric] - then
}

export interface SparkGeometry {
  /** SVG path for the line. */
  d: string
  /** The last point (today's dot). */
  end: { x: number; y: number }
  /** Maps a value onto this sparkline's y, for reference lines and bands. */
  y: (v: number) => number
}

export interface SparkOptions {
  width: number
  height: number
  /** Inset so the stroke and end dot aren't clipped. */
  pad?: number
  /** Values the y-range must include (0 for Recovery Balance, the
   *  in-range band's edges for Load Ratio). */
  include?: number[]
}

/**
 * Geometry for a sparkline over `values` (oldest first). Null with fewer
 * than two finite points — one point is not a trend.
 */
export function sparkGeometry(values: number[], opts: SparkOptions): SparkGeometry | null {
  const pts = values.filter(Number.isFinite)
  if (pts.length < 2) return null
  const { width, height, pad = 3, include = [] } = opts
  const lo = Math.min(...pts, ...include)
  const hi = Math.max(...pts, ...include)
  const range = hi - lo
  // A flat series sits mid-height rather than on an edge.
  const y = (v: number) => range === 0 ? height / 2 : pad + (height - 2 * pad) * (1 - (v - lo) / range)
  const x = (i: number) => pad + (width - 2 * pad) * i / (pts.length - 1)
  const r = (n: number) => Math.round(n * 10) / 10
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${r(x(i))} ${r(y(v))}`).join('')
  return { d, end: { x: r(x(pts.length - 1)), y: r(y(pts[pts.length - 1])) }, y }
}

export interface FitnessChange {
  from: number
  to: number
  delta: number
  /** Percent of the starting value. */
  pct: number
  /** The date the change is measured from (the range's first day with data). */
  since: string
}

/**
 * How much Fitness moved across a date range: its first reading on or
 * after `startDate` to its last reading on or before `endDate`. Readings
 * before Fitness has built (≤ 1, where the chart draws no line) don't
 * count. Null without two such days.
 */
export function fitnessChange(timeline: PerformanceMetrics[], startDate: string, endDate: string): FitnessChange | null {
  const inRange = timeline
    .filter(p => p.date >= startDate && p.date <= endDate && p.ctl > 1)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (inRange.length < 2) return null
  const first = inRange[0]
  const last = inRange[inRange.length - 1]
  const delta = last.ctl - first.ctl
  return {
    from: first.ctl,
    to: last.ctl,
    delta,
    pct: (delta / first.ctl) * 100,
    since: first.date,
  }
}

/**
 * A y-axis domain for Fitness on its own scale: its range in the window
 * plus headroom, at least 10 points tall so day-to-day noise doesn't read
 * as a cliff, and never below zero.
 */
export function fitnessAxisDomain(values: number[]): [number, number] | null {
  const pts = values.filter(Number.isFinite)
  if (pts.length === 0) return null
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const span = Math.max(hi - lo, 10)
  const mid = (lo + hi) / 2
  const pad = span * 0.15
  const low = Math.max(0, Math.floor((mid - span / 2 - pad) / 5) * 5)
  const high = Math.ceil((mid + span / 2 + pad) / 5) * 5
  return [low, high]
}

/** "▲ +1.8" / "▼ −3.4" / "± 0.0" at `dp` decimals. */
export function formatChange(v: number, dp: number): string {
  const s = Math.abs(v).toFixed(dp)
  if (Number(s) === 0) return `± ${(0).toFixed(dp)}`
  return v > 0 ? `▲ +${s}` : `▼ −${s}`
}

/** The zone edges the change colors read: Recovery Balance's
 *  overreaching line and Load Ratio's in-range band. */
export interface ToneBounds {
  tsbOverreaching: number
  acwrLow: number
  acwrHigh: number
}

/**
 * The change's color: green for good news, amber for caution, grey when
 * the direction alone says nothing. Direction is judged against where the
 * metric now sits, so a planned build week isn't flagged every day:
 * - Fitness: rising good up to the safe weekly ramp, caution past it
 *   (the Fitness card's band says the same); falling caution.
 * - Fatigue: rising caution, falling neutral (backing off isn't good or
 *   bad on its own).
 * - Recovery Balance: rising good; falling is caution only once it is in
 *   overreaching, else neutral (the build zone is tired by design).
 * - Load Ratio: moving toward the in-range band good, moving away from
 *   it caution, moving within it neutral.
 */
export function changeTone(metric: TrendMetric, delta: number, current: number, bounds: ToneBounds): 'good' | 'caution' | 'neutral' {
  if (Math.abs(delta) < 1e-9) return 'neutral'
  switch (metric) {
    case 'ctl': return delta > FITNESS_SAFE_WEEKLY_RAMP ? 'caution' : delta > 0 ? 'good' : 'caution'
    case 'atl': return delta > 0 ? 'caution' : 'neutral'
    case 'tsb': return delta > 0 ? 'good' : current < bounds.tsbOverreaching ? 'caution' : 'neutral'
    case 'acwr': {
      const before = current - delta
      const dist = (v: number) => v < bounds.acwrLow ? bounds.acwrLow - v : v > bounds.acwrHigh ? v - bounds.acwrHigh : 0
      const was = dist(before), now = dist(current)
      return now < was ? 'good' : now > was ? 'caution' : 'neutral'
    }
  }
}

/**
 * Round axis ticks spanning [lo, hi]: about `count` intervals on a step of
 * 1, 2, 2.5 or 5 × 10ⁿ, starting and ending on a tick so the scale reads
 * cleanly (60 / 65 / 70 / 75, not 62 / 66 / 70 / 74 / 77).
 */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (hi < lo) [lo, hi] = [hi, lo]
  if (hi === lo) { hi = lo + 1; lo = lo - 1 }
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)!
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  // Round each tick to the step's precision so 0.1 + 0.2 stays 0.3.
  const dp = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(dp)))
  return ticks
}

/** The hint above every expandable chart on the Performance tab. */
export const EXPAND_HINT = 'Click to expand · rotate for best view'

/** How many days the Smooth toggle averages over. */
export const SMOOTH_DAYS = 7

/**
 * Trailing rolling mean by calendar date: each point becomes the mean of
 * the points within the last `days` days, itself included. Gaps shrink
 * the window rather than borrow from outside it. Input order is kept.
 */
export function rollingMean<T extends { date: string; value: number }>(points: T[], days: number = SMOOTH_DAYS): T[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const meanByDate = new Map<string, number>()
  let start = 0
  let sum = 0
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].value
    const from = shiftDate(sorted[i].date, -(days - 1))
    while (sorted[start].date < from) { sum -= sorted[start].value; start++ }
    meanByDate.set(sorted[i].date, sum / (i - start + 1))
  }
  return points.map(p => ({ ...p, value: meanByDate.get(p.date) ?? p.value }))
}

/**
 * The most Fitness should climb in a week to build safely: TrainingPeaks /
 * Joe Friel's guidance is about 5–8 points a week for most athletes, with
 * risk climbing above that. Written for TSS-based Fitness; ours is
 * TRIMP-based, so it is a guide, not a hard line.
 */
export const FITNESS_SAFE_WEEKLY_RAMP = 8

export interface BandBounds {
  /** Load Ratio's in-range band (the athlete's tuned values). */
  acwrLow: number
  acwrHigh: number
  /** Recovery Balance's healthy range: build zone up to race-ready. */
  tsbLow: number
  tsbHigh: number
}

/**
 * The healthy range for a metric on each day of the timeline, or null
 * where it can't be known (Fitness needs a reading a week earlier;
 * Fatigue needs Fitness to have built):
 * - Fitness: last week's Fitness up to +FITNESS_SAFE_WEEKLY_RAMP. Above =
 *   ramping too fast; below = losing fitness.
 * - Fatigue: the Load Ratio band in Fatigue units (low–high × Fitness).
 * - Recovery Balance: the build zone up to the top of the race-day band
 *   (the app's TSB zones: Peaked is good, so it sits inside).
 * - Load Ratio: its in-range band.
 */
export function healthyBands(
  timeline: PerformanceMetrics[], metric: TrendMetric, b: BandBounds,
): Map<string, [number, number] | null> {
  const byDate = new Map(timeline.map(p => [p.date, p]))
  const out = new Map<string, [number, number] | null>()
  for (const p of timeline) {
    let band: [number, number] | null = null
    if (metric === 'ctl') {
      const prior = byDate.get(shiftDate(p.date, -7))
      band = prior && prior.ctl > 1 ? [prior.ctl, prior.ctl + FITNESS_SAFE_WEEKLY_RAMP] : null
    } else if (metric === 'atl') {
      band = p.ctl > 1 ? [p.ctl * b.acwrLow, p.ctl * b.acwrHigh] : null
    } else if (metric === 'tsb') {
      band = [b.tsbLow, b.tsbHigh]
    } else {
      band = [b.acwrLow, b.acwrHigh]
    }
    out.set(p.date, band)
  }
  return out
}

/** The one line under a card that says what its green band means. */
export function bandCaption(metric: TrendMetric, b: BandBounds): string {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''))
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
  switch (metric) {
    case 'ctl': return `Green band: a safe build, up to +${FITNESS_SAFE_WEEKLY_RAMP} a week on last week's Fitness. Above it, ramping too fast; below, Fitness is easing (expected in a taper or recovery week).`
    case 'atl': return `Green band: ${f(b.acwrLow)}–${f(b.acwrHigh)}× your Fitness. Above it, ramping too fast; below it, room to push harder.`
    case 'tsb': return `Green band: ${signed(b.tsbLow)} to ${signed(b.tsbHigh)}, build zone up to race-ready. Below it, overreaching.`
    case 'acwr': return `Green band: ${f(b.acwrLow)}–${f(b.acwrHigh)}, the lowest-injury range.`
  }
}
