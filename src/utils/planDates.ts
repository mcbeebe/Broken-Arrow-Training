/**
 * Shared plan-date helpers. Extracted from WeeklyPlan so the Garmin
 * re-push engine (garminRepush.ts) resolves day labels to calendar dates
 * with exactly the same rules the UI uses.
 */

/**
 * Parse a day label like "Mon 4/13" into a YYYY-MM-DD string.
 *
 * Day labels carry no year, so one must be inferred. With `anchorIso`
 * (usually today or the plan's race date) the year is chosen from
 * {anchor−1, anchor, anchor+1} minimizing distance to the anchor — this
 * is what keeps a December race + January second race season working.
 * Without an anchor the legacy hardcoded 2026 is preserved: manual-log
 * storage keys (`manualLogKey`) are derived from the no-anchor form, and
 * re-keying them by year would orphan existing journal notes without a
 * dedicated migration.
 */
export function parseDayToDate(dayLabel: string, _weekDates?: string, anchorIso?: string): string | null {
  const match = dayLabel.match(/(\d{1,2})\/(\d{1,2})/)
  if (!match) return null
  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  const anchorYear = anchorIso ? Number(anchorIso.slice(0, 4)) : NaN
  if (!Number.isFinite(anchorYear)) return `2026-${month}-${day}`
  const anchorMs = Date.parse(`${anchorIso}T12:00:00`)
  let best: string | null = null
  let bestDelta = Infinity
  for (const y of [anchorYear - 1, anchorYear, anchorYear + 1]) {
    const iso = `${y}-${month}-${day}`
    const ms = Date.parse(`${iso}T12:00:00`)
    if (!Number.isFinite(ms)) continue
    const delta = Math.abs(ms - anchorMs)
    if (delta < bestDelta) {
      bestDelta = delta
      best = iso
    }
  }
  return best
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
