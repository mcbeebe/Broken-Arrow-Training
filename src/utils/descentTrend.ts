import type { CachedEccentric } from './runEccentric'
import type { Course } from '../types/course'

/**
 * Weekly vertical-workload aggregation for the "Vertical workload"
 * top-line metric on Stats. The eccentric engine
 * (`src/engines/descent/eccentric.ts`) already computes per-activity
 * hard ascent + hard descent vertical meters; this module rolls them up
 * by ISO week so the surface can render a trend.
 *
 * Cache keys are "YYYY-MM-DD|activityName" — we recover the activity date
 * by splitting on the pipe.
 *
 * NOTE: prior versions of this file conflated `buckets.severe + .moderate`
 * (horizontal meters of path through hard terrain) with vertical descent
 * meters, then compared the result against a target derived from
 * `verticalLossFt × m/ft`. Those are different physical quantities. The
 * current pipeline reads `hardAscent/DescentVerticalMeters` from the
 * engine — true vertical work, directly comparable to a course's
 * vertical gain / loss. Older cached runs that pre-date the new fields
 * surface as zero until they're re-bucketed.
 */

export interface WeekVerticalTotals {
  /** ISO week-start date (Sunday-anchored, YYYY-MM-DD). */
  weekStart: string
  /** Vertical meters of climbing on grades ≥ +10% across all runs that week.
   *  Directly comparable to a course's vertical gain. */
  hardAscentMeters: number
  /** Vertical meters of descending on grades ≤ -10% across all runs that week.
   *  Directly comparable to a course's vertical loss. */
  hardDescentMeters: number
  /** Sum of totalKmScore (km·eccentric-score) for the week. */
  eccentricLoad: number
  /** Number of runs that contributed to the week. */
  runCount: number
}

/** Legacy alias for code that still imports the old name. */
export type WeekDescentTotals = WeekVerticalTotals

export interface VerticalTrend {
  /** Most recent N weeks, oldest first. */
  weeks: WeekVerticalTotals[]
  /** Current (most-recent, possibly partial) week. */
  current: WeekVerticalTotals | null
  /** Week prior to current. */
  previous: WeekVerticalTotals | null
  /** Sum hardAscentMeters over all returned weeks. */
  totalHardAscentMeters: number
  /** Sum hardDescentMeters over all returned weeks. */
  totalHardDescentMeters: number
}

/** Legacy alias. */
export type DescentTrend = VerticalTrend

export interface VerticalBand {
  /** Lower edge of the suggested weekly meters band (peak training window). */
  minMetersPerWeek: number
  /** Upper edge of the band. */
  maxMetersPerWeek: number
  /** The race's total vertical (gain or loss) in meters — the source the
   *  band scales from. */
  raceVerticalMeters: number
}

export interface VerticalTargets {
  ascent: VerticalBand | null
  descent: VerticalBand | null
}

/** Legacy alias for descent band only. */
export type DescentTarget = VerticalBand & { raceDescentMeters: number }

const METERS_PER_FOOT = 0.3048

function parseDateFromKey(key: string): string | null {
  const idx = key.indexOf('|')
  if (idx < 0) return null
  const date = key.slice(0, idx)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return date
}

/** Sunday-anchored week start as YYYY-MM-DD in the caller's local time.
 *  Sunday because the existing app already aligns weeks Sunday-Saturday. */
export function weekStartForDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - day)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function emptyWeek(weekStart: string): WeekVerticalTotals {
  return {
    weekStart,
    hardAscentMeters: 0,
    hardDescentMeters: 0,
    eccentricLoad: 0,
    runCount: 0,
  }
}

function addRunToWeek(week: WeekVerticalTotals, e: CachedEccentric): void {
  week.hardAscentMeters += e.hardAscentVerticalMeters ?? 0
  week.hardDescentMeters += e.hardDescentVerticalMeters ?? 0
  week.eccentricLoad += e.totalKmScore
  week.runCount += 1
}

/**
 * Roll up the per-activity eccentric cache into weekly totals for the
 * last `lookbackWeeks` weeks. Weeks with no activity still appear with
 * zeros so the chart doesn't have gaps.
 */
export function buildVerticalTrend(
  cache: Record<string, CachedEccentric>,
  options?: { lookbackWeeks?: number; now?: Date },
): VerticalTrend {
  const lookback = options?.lookbackWeeks ?? 12
  const now = options?.now ?? new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentWeekStart = weekStartForDate(todayStr)

  const weeksMap = new Map<string, WeekVerticalTotals>()
  const cursor = new Date(`${currentWeekStart}T00:00:00`)
  for (let i = 0; i < lookback; i++) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    weeksMap.set(`${y}-${m}-${d}`, emptyWeek(`${y}-${m}-${d}`))
    cursor.setDate(cursor.getDate() - 7)
  }

  for (const [key, value] of Object.entries(cache)) {
    const date = parseDateFromKey(key)
    if (!date) continue
    const wk = weekStartForDate(date)
    const week = weeksMap.get(wk)
    if (!week) continue // outside the lookback window
    addRunToWeek(week, value)
  }

  const weeks = Array.from(weeksMap.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  )
  const current = weeks[weeks.length - 1] ?? null
  const previous = weeks[weeks.length - 2] ?? null
  const totalHardAscentMeters = weeks.reduce((sum, w) => sum + w.hardAscentMeters, 0)
  const totalHardDescentMeters = weeks.reduce((sum, w) => sum + w.hardDescentMeters, 0)

  return { weeks, current, previous, totalHardAscentMeters, totalHardDescentMeters }
}

/** Legacy alias preserved so non-refactored callers keep working. */
export const buildDescentTrend = buildVerticalTrend

/**
 * Suggested weekly vertical-work band for peak training. Scaled from the
 * race's vertical gain / loss — peak weeks should aim for 1.2–1.8× each
 * so the user accumulates the necessary adaptations before tapering.
 *
 * Returns `{ ascent: null, descent: null }` when the course has neither.
 * Either side can be null independently (rare in trail racing but
 * possible for point-to-point with one-way gradient).
 */
export function verticalTargetsForCourse(course: Course): VerticalTargets {
  const ascent = bandFromFt(course.verticalGainFt)
  const descent = bandFromFt(course.verticalLossFt)
  return { ascent, descent }
}

function bandFromFt(ft: number): VerticalBand | null {
  if (ft < 100) return null
  const raceVerticalMeters = ft * METERS_PER_FOOT
  return {
    raceVerticalMeters: Math.round(raceVerticalMeters),
    minMetersPerWeek: Math.round(raceVerticalMeters * 1.2),
    maxMetersPerWeek: Math.round(raceVerticalMeters * 1.8),
  }
}

/** Legacy: descent-only target with the older `raceDescentMeters` field. */
export function descentTargetForCourse(course: Course): DescentTarget | null {
  const band = bandFromFt(course.verticalLossFt)
  if (!band) return null
  return { ...band, raceDescentMeters: band.raceVerticalMeters }
}

export type BandState = 'below' | 'in-band' | 'above'
/** Legacy alias. */
export type DescentBandState = BandState

/** Classifies a weekly meters total against a band. */
export function classifyAgainstBand(
  meters: number,
  band: VerticalBand,
): BandState {
  if (meters < band.minMetersPerWeek) return 'below'
  if (meters > band.maxMetersPerWeek) return 'above'
  return 'in-band'
}

/**
 * Plain-English coaching read covering both ascent and descent for the
 * current week. Renders inside `<InsightNote>`.
 */
export function describeVerticalState(
  trend: VerticalTrend,
  targets: VerticalTargets,
  weeksToRace: number | null,
): string {
  const current = trend.current
  if (!current || current.runCount === 0) {
    return 'No vertical work logged this week yet. A weekly hill session — climb + descent — is the single best insurance against quad blowup on race day.'
  }
  const raceContext = weeksToRace !== null && weeksToRace > 0
    ? ` with ${weeksToRace} week${weeksToRace === 1 ? '' : 's'} to race day`
    : ''
  const ascentLine = sideRead('climb', current.hardAscentMeters, targets.ascent)
  const descentLine = sideRead('descent', current.hardDescentMeters, targets.descent)
  if (!targets.ascent && !targets.descent) {
    return `${Math.round(current.hardAscentMeters)} m of hard climbing and ${Math.round(current.hardDescentMeters)} m of hard descent this week${raceContext ? ` —${raceContext}` : ''}. Pick a race to see the target bands.`
  }
  return `${ascentLine} · ${descentLine}${raceContext ? ` —${raceContext}.` : '.'}`
}

function sideRead(
  side: 'climb' | 'descent',
  meters: number,
  band: VerticalBand | null,
): string {
  const m = Math.round(meters)
  if (!band) return `${m} m of hard ${side}`
  const state = classifyAgainstBand(meters, band)
  if (state === 'in-band') return `${m} m of hard ${side} — in band (${band.minMetersPerWeek}–${band.maxMetersPerWeek} m)`
  if (state === 'below') {
    const gap = Math.round(band.minMetersPerWeek - meters)
    return `${m} m of hard ${side} — short ${gap} m of the ${band.minMetersPerWeek}–${band.maxMetersPerWeek} m band`
  }
  return `${m} m of hard ${side} — above the ${band.minMetersPerWeek}–${band.maxMetersPerWeek} m band`
}

/** Legacy single-axis read kept for callers that still use it. */
export function describeDescentState(
  trend: VerticalTrend,
  target: VerticalBand | null,
  weeksToRace: number | null,
): string {
  return describeVerticalState(trend, { ascent: null, descent: target }, weeksToRace)
}
