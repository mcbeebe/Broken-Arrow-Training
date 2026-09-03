// Race-date arithmetic.
//
// `race.date` in this codebase is a free-text string (e.g.
// "Saturday, June 20, 2026"); the rest of the app parses it with `new Date(...)`
// which is good enough for our use. We mirror that approach.

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Parse a race date as a LOCAL calendar date.
 *
 * A bare `YYYY-MM-DD` is parsed as UTC midnight by spec, but every caller
 * below compares it with LOCAL date getters — so anywhere west of Greenwich
 * the race resolved to the previous day, and on race morning the athlete was
 * told their race was yesterday (`TZ=America/New_York` reproduced it: two
 * failures, `expected -1 to be +0`, where UTC passed). Build the bare form
 * from its parts so the calendar date the athlete typed is the calendar date
 * we compare. Natural-language forms ("Saturday, June 20, 2026") already
 * parse as local midnight and are left to the platform.
 */
export function parseRaceDate(raceDateStr: string): Date | null {
  if (!raceDateStr) return null
  const iso = raceDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [y, m, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    const d = new Date(y, m - 1, day)
    // `new Date(2026, 12, 45)` silently rolls into the next year rather than
    // failing, so round-trip the parts: a date that did not survive intact was
    // never a real calendar date.
    if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null
    return d
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
