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
  /** Percent of the starting value; null when it started at ~0. */
  pct: number | null
  /** The date the change is measured from (the range's first day with data). */
  since: string
}

/**
 * How much Fitness moved across a date range: its first reading on or
 * after `startDate` to its last reading on or before `endDate`. Null
 * without two distinct days of data, or before Fitness has built at all.
 */
export function fitnessChange(timeline: PerformanceMetrics[], startDate: string, endDate: string): FitnessChange | null {
  const inRange = timeline
    .filter(p => p.date >= startDate && p.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (inRange.length < 2) return null
  const first = inRange[0]
  const last = inRange[inRange.length - 1]
  if (last.ctl <= 1) return null
  const delta = last.ctl - first.ctl
  return {
    from: first.ctl,
    to: last.ctl,
    delta,
    pct: first.ctl > 1 ? (delta / first.ctl) * 100 : null,
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

/**
 * The change's color: green for good news, amber for caution, grey when
 * the direction alone says nothing. Fitness and Recovery Balance rising
 * is good and falling is caution. Fatigue and Load Ratio rising is
 * caution, but falling is only neutral: backing off isn't automatically
 * good (a Load Ratio under the band is detraining).
 */
export function changeTone(metric: TrendMetric, delta: number): 'good' | 'caution' | 'neutral' {
  if (Math.abs(delta) < 1e-9) return 'neutral'
  if (metric === 'ctl' || metric === 'tsb') return delta > 0 ? 'good' : 'caution'
  return delta > 0 ? 'caution' : 'neutral'
}
