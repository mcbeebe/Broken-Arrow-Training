/**
 * Shared plan-date helpers. Extracted from WeeklyPlan so the Garmin
 * re-push engine (garminRepush.ts) resolves day labels to calendar dates
 * with exactly the same rules the UI uses.
 */

/**
 * Parse a day label like "Mon 4/13" into a YYYY-MM-DD string.
 * Matches the legacy WeeklyPlan behavior (2026 plan year) exactly.
 */
export function parseDayToDate(dayLabel: string, _weekDates?: string): string | null {
  const match = dayLabel.match(/(\d{1,2})\/(\d{1,2})/)
  if (!match) return null
  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `2026-${month}-${day}`
}

/** The date a plan actually begins: the athlete's chosen start when it's
 *  in the future, otherwise today. The clamp is one-directional by design —
 *  a stale/past start date can never back-date a regenerated plan (the
 *  P0-1 "week 1 already happened" trust-killer). */
export function effectivePlanStart(planStartDate: string | undefined, today: string): string {
  return planStartDate && planStartDate > today ? planStartDate : today
}

/** Today as YYYY-MM-DD in the athlete's local timezone. */
export function todayDateString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
