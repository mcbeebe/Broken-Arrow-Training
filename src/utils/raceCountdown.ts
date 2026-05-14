// Race-date arithmetic.
//
// `race.date` in this codebase is a free-text string (e.g.
// "Saturday, June 20, 2026"); the rest of the app parses it with `new Date(...)`
// which is good enough for our use. We mirror that approach.

const MS_PER_DAY = 1000 * 60 * 60 * 24

function parseRaceDate(raceDateStr: string): Date | null {
  if (!raceDateStr) return null
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
