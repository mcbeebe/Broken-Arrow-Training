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

/**
 * Resolve a day label to ISO using the week it lives in.
 *
 * With `week.startIso` (stamped by every generator since the season-span
 * fix) resolution is EXACT: walk the 7 calendar days from the week's
 * start and return the one whose month/day match the label — immune to
 * year boundaries, which is the point. Day labels carry no year, and
 * anchor-based inference mis-resolved far-from-anchor weeks (June-2027
 * plan days matched June-2026 actuals in the field). Weeks without
 * `startIso` (legacy stored plans) fall back to the old inference chain
 * byte-for-byte.
 */
export function dayIsoInWeek(
  dayLabel: string,
  week: { startIso?: string; dates?: string },
  anchorIso?: string,
): string | null {
  if (week.startIso) {
    const match = dayLabel.match(/(\d{1,2})\/(\d{1,2})/)
    if (match) {
      const month = Number(match[1])
      const day = Number(match[2])
      const d = new Date(`${week.startIso}T12:00:00`)
      for (let i = 0; i < 7; i++) {
        if (d.getMonth() + 1 === month && d.getDate() === day) {
          const m = String(month).padStart(2, '0')
          const dd = String(day).padStart(2, '0')
          return `${d.getFullYear()}-${m}-${dd}`
        }
        d.setDate(d.getDate() + 1)
      }
    }
    // Label outside the week's span (shouldn't happen) — defensive fallback
    // anchored to the week itself rather than a caller-supplied guess.
    return parseDayToDate(dayLabel, week.dates, week.startIso)
  }
  return parseDayToDate(dayLabel, week.dates, anchorIso)
}

/** The date a plan actually begins: the athlete's chosen start when it's
 *  in the future, otherwise today. The clamp is one-directional by design —
 *  a stale/past start date can never back-date a regenerated plan (the
 *  P0-1 "week 1 already happened" trust-killer). */
export function effectivePlanStart(
  planStartDate: string | undefined,
  today: string,
  pinnedIso?: string,
): string {
  // A pinned start wins outright, including when it is in the past: that
  // is what pinning MEANS. Re-clamping it forward to today is exactly the
  // drift it exists to stop.
  if (pinnedIso) return pinnedIso
  return planStartDate && planStartDate > today ? planStartDate : today
}

/**
 * A Date's LOCAL calendar day as YYYY-MM-DD.
 *
 * This is the only correct way to get a calendar date out of a Date that was
 * built from local components. `toISOString()` formats in UTC, so reading a
 * locally-built Date through it re-interprets it in another day whenever the
 * local offset pushes it across midnight UTC.
 *
 * The codebase used to guard that by anchoring at local noon
 * (`new Date(iso + 'T12:00:00')`), on the reasoning — written down in this
 * file — that "a negative timezone offset never slips a day". True, and only
 * half the world: noon local is 00:00 UTC at UTC+12 and 23:00 UTC the
 * PREVIOUS day at UTC+13. So the anchor holds from UTC-11 through UTC+12 and
 * fails beyond it — New Zealand and Fiji through their summer (NZDT/+13),
 * Kiritimati year-round (+14), Samoa and Tonga (+13). Every plan generated
 * there came out shifted a day, which lands week starts on Sunday and cascades
 * through the whole schedule.
 *
 * Local components in, local components out. No offset, no anchor, no slip.
 */
export function isoFromLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** A Date at local noon on the given calendar day. Noon (rather than
 *  midnight) keeps a DST spring-forward from landing on a nonexistent local
 *  time; it is NOT a defence against the UTC read above — see
 *  `isoFromLocalDate`. */
export function localNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** Shift an ISO calendar date by whole days. */
export function addDays(iso: string, days: number): string {
  const d = localNoon(iso)
  d.setDate(d.getDate() + days)
  return isoFromLocalDate(d)
}

/** Whole days from `aIso` to `bIso` (negative when b precedes a). */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((localNoon(bIso).getTime() - localNoon(aIso).getTime()) / 86_400_000)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(iso: string): number {
  return ((localNoon(iso).getDay() + 6) % 7) + 1
}

/** Shift an ISO date by a whole number of weeks. */
export function shiftIsoByWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7)
}

/** Today as YYYY-MM-DD in the athlete's local timezone. */
export function todayDateString(): string {
  return isoFromLocalDate(new Date())
}

/** The Monday on or before `iso`.
 *  The plan's pinned start is always a Monday: weeks are Monday-anchored
 *  everywhere else in the app, and pinning mid-week would put week 1 out
 *  of step with every other week. */
export function mondayOnOrBefore(iso: string): string {
  return addDays(iso, -(isoDayOfWeek(iso) - 1))
}
