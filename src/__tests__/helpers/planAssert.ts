/**
 * Reusable assertions for plan-output behavioral tests (iRunFar roadmap R1–R14).
 *
 * These let a test inspect what a *generated plan* actually prescribes — the bar
 * for "the code applies the theory" (not just that a helper exists). NOT a test
 * file (no `.test` suffix) so vitest skips it; import it from real tests.
 */
import type { TrainingPlan, PlannedDay } from '../../types'
import { parseElevation } from '../../utils/targets'

/** Every planned day, flattened across weeks. */
export function allDays(plan: TrainingPlan): PlannedDay[] {
  return plan.weeks.flatMap(w => w.days)
}

/** Days whose `workout` + `detail` text matches a pattern. */
export function daysMatching(plan: TrainingPlan, re: RegExp): PlannedDay[] {
  return allDays(plan).filter(d => re.test(`${d.workout} ${d.detail}`))
}

/** The vert (ft) prescribed on a day, parsed from its detail string (0 if none). */
export function dayVertFt(day: PlannedDay): number {
  return parseElevation(day.detail) ?? 0
}

/** Per-week max prescribed vert (ft), one entry per week in order. */
export function weeklyVertFt(plan: TrainingPlan): number[] {
  return plan.weeks.map(w => w.days.reduce((m, d) => Math.max(m, dayVertFt(d)), 0))
}

/** 1-based week numbers in which any day matches the pattern. */
export function weeksWith(plan: TrainingPlan, re: RegExp): number[] {
  return plan.weeks.filter(w => w.days.some(d => re.test(`${d.workout} ${d.detail}`))).map(w => w.num)
}

/**
 * Largest gap (in weeks) between consecutive in-window hits — including the gap
 * from the window start to the first hit and from the last hit to the window end.
 * Returns Infinity when there are no hits in `[startWeek, endWeek]`. Use to assert
 * a stimulus recurs at least every N weeks (e.g. downhill ≤ 2 weeks ≈ 14 days).
 */
export function maxWeekGap(weekNums: number[], startWeek: number, endWeek: number): number {
  const hits = weekNums.filter(n => n >= startWeek && n <= endWeek).sort((a, b) => a - b)
  if (hits.length === 0) return Infinity
  let gap = hits[0] - startWeek + 1
  for (let i = 1; i < hits.length; i++) gap = Math.max(gap, hits[i] - hits[i - 1])
  gap = Math.max(gap, endWeek - hits[hits.length - 1])
  return gap
}

/** True if the series never decreases. */
export function isNonDecreasing(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false
  return true
}
