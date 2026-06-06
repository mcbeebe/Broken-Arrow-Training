// Race-date arithmetic.
//
// `race.date` in this codebase is a free-text string (e.g.
// "Saturday, June 20, 2026"); the rest of the app parses it with `new Date(...)`
// which is good enough for our use. We mirror that approach.

const MS_PER_DAY = 1000 * 60 * 60 * 24

function parseRaceDate(raceDateStr: string): Date | null {
  if (!raceDateStr) return null
  // `new Date('2026-05-21')` parses an ISO *date-only* string as UTC midnight.
  // In negative-offset time zones that instant lands on the previous calendar
  // day, so the local components read back one day early (May 21 → May 20),
  // throwing the day/week countdown off by one. Parse the date-only form as a
  // *local* calendar date so it matches the day the user actually sees. Strings
  // with a time component or natural-language dates ("Saturday, June 20, 2026")
  // already parse as local time, so they pass through unchanged.
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raceDateStr.trim())
  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  const d = new Date(raceDateStr)
  if (Number.isNaN(d.getTime())) return null
  return d
}

export function daysUntilRace(raceDateStr: string, now: Date = new Date()): number | null {
  const target = parseRaceDate(raceDateStr)
  if (!target) return null
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  return Math.round((startOfTarget - startOfNow) / MS_PER_DAY)
}

export function weeksUntilRace(raceDateStr: string, now: Date = new Date()): number | null {
  const days = daysUntilRace(raceDateStr, now)
  if (days == null) return null
  return Math.ceil(days / 7)
}
