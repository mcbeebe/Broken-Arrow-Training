import type { CachedEccentric } from './runEccentric'
import type { Course } from '../types/course'

/**
 * Weekly descent-volume aggregation for the "Descent Capacity" top-line
 * metric on Progress. The eccentric engine (`src/engines/descent/eccentric.ts`)
 * already computes per-activity bucket meters; this module rolls them up
 * by ISO week so the surface can render a trend.
 *
 * Cache keys are "YYYY-MM-DD|activityName" — we recover the activity date
 * by splitting on the pipe.
 */

export interface WeekDescentTotals {
  /** ISO week-start date (Sunday-anchored, YYYY-MM-DD). */
  weekStart: string
  /** Sum of severe-bucket meters across all runs that week. The "real"
   *  eccentric load — sustained steep descents that drive DOMS. */
  severeMeters: number
  /** Sum of moderate + severe meters — the headline number runners read.
   *  Includes meaningful descent, excludes barely-sloped flats. */
  hardDescentMeters: number
  /** Sum of all bucket meters (mild + moderate + severe). */
  totalDescentMeters: number
  /** Sum of totalKmScore (km·eccentric-score) for the week. */
  eccentricLoad: number
  /** Number of runs that contributed to the week. */
  runCount: number
}

export interface DescentTrend {
  /** Most recent N weeks, oldest first. */
  weeks: WeekDescentTotals[]
  /** Current (most-recent, possibly partial) week. */
  current: WeekDescentTotals | null
  /** Week prior to current. */
  previous: WeekDescentTotals | null
  /** Sum hardDescentMeters over all returned weeks — useful for "you've
   *  built X m of descent capacity this block" headlines. */
  totalHardDescentMeters: number
}

export interface DescentTarget {
  /** Lower edge of the suggested weekly hard-descent meters band (peak
   *  training window). */
  minMetersPerWeek: number
  /** Upper edge of the band. */
  maxMetersPerWeek: number
  /** The race's total descent in meters — the source the band scales from. */
  raceDescentMeters: number
}

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

function emptyWeek(weekStart: string): WeekDescentTotals {
  return {
    weekStart,
    severeMeters: 0,
    hardDescentMeters: 0,
    totalDescentMeters: 0,
    eccentricLoad: 0,
    runCount: 0,
  }
}

function addRunToWeek(week: WeekDescentTotals, e: CachedEccentric): void {
  week.severeMeters += e.buckets.severe
  week.hardDescentMeters += e.buckets.severe + e.buckets.moderate
  week.totalDescentMeters += e.buckets.mild + e.buckets.moderate + e.buckets.severe
  week.eccentricLoad += e.totalKmScore
  week.runCount += 1
}

/**
 * Roll up the per-activity eccentric cache into weekly totals for the
 * last `lookbackWeeks` weeks. Weeks with no activity still appear with
 * zeros so the chart doesn't have gaps.
 */
export function buildDescentTrend(
  cache: Record<string, CachedEccentric>,
  options?: { lookbackWeeks?: number; now?: Date },
): DescentTrend {
  const lookback = options?.lookbackWeeks ?? 12
  const now = options?.now ?? new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentWeekStart = weekStartForDate(todayStr)

  const weeksMap = new Map<string, WeekDescentTotals>()
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
  const totalHardDescentMeters = weeks.reduce((sum, w) => sum + w.hardDescentMeters, 0)

  return { weeks, current, previous, totalHardDescentMeters }
}

/**
 * Suggested weekly hard-descent meters band for peak training. Scaled
 * from the race's total descent — peak weeks should aim for 1.2–1.8× the
 * race's vertical loss so the user accumulates the necessary eccentric
 * adaptations before tapering.
 *
 * Returns null when the course carries no descent (flat road race) —
 * Descent Capacity isn't a useful metric for those.
 */
export function descentTargetForCourse(course: Course): DescentTarget | null {
  if (course.verticalLossFt < 100) return null
  const raceDescentMeters = course.verticalLossFt * METERS_PER_FOOT
  return {
    raceDescentMeters: Math.round(raceDescentMeters),
    minMetersPerWeek: Math.round(raceDescentMeters * 1.2),
    maxMetersPerWeek: Math.round(raceDescentMeters * 1.8),
  }
}

export type DescentBandState = 'below' | 'in-band' | 'above'

/** Classifies the current week against the race-ready band. */
export function classifyAgainstBand(
  hardDescentMeters: number,
  target: DescentTarget,
): DescentBandState {
  if (hardDescentMeters < target.minMetersPerWeek) return 'below'
  if (hardDescentMeters > target.maxMetersPerWeek) return 'above'
  return 'in-band'
}

/**
 * Plain-English coaching read for the Descent Capacity section. Renders
 * inside `<InsightNote>`. The headline classifier + race-context produces
 * one of a handful of canned narratives — kept terse and runner-spoken.
 */
export function describeDescentState(
  trend: DescentTrend,
  target: DescentTarget | null,
  weeksToRace: number | null,
): string {
  const current = trend.current
  if (!current || current.runCount === 0) {
    return 'No descent runs logged this week yet. A weekly downhill session is the single best insurance against quad blowup on race day.'
  }
  const currentMeters = Math.round(current.hardDescentMeters)
  const previousMeters = trend.previous ? Math.round(trend.previous.hardDescentMeters) : null

  if (!target) {
    const trendStr = previousMeters !== null
      ? ` (${currentMeters > previousMeters ? 'up' : 'down'} from ${previousMeters} m last week)`
      : ''
    return `Logged ${currentMeters} m of hard descent this week${trendStr}. Without a target race we can't tell you whether that's enough — pick a race to see the target band.`
  }

  const state = classifyAgainstBand(current.hardDescentMeters, target)
  const raceContext = weeksToRace !== null && weeksToRace > 0
    ? ` with ${weeksToRace} week${weeksToRace === 1 ? '' : 's'} to race day`
    : ''

  if (state === 'in-band') {
    return `${currentMeters} m of hard descent this week — squarely in the race-ready band (${target.minMetersPerWeek}–${target.maxMetersPerWeek} m)${raceContext}. Hold the line.`
  }
  if (state === 'below') {
    const gap = target.minMetersPerWeek - current.hardDescentMeters
    return `${currentMeters} m of hard descent this week — short of the ${target.minMetersPerWeek}–${target.maxMetersPerWeek} m race-ready band${raceContext}. Add about ${Math.round(gap)} m of downhill work next week.`
  }
  return `${currentMeters} m of hard descent this week — above the ${target.minMetersPerWeek}–${target.maxMetersPerWeek} m race-ready band${raceContext}. Strong week, but watch quad recovery before pushing higher.`
}
