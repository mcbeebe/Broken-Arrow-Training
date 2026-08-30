/**
 * Read the trip the athlete already typed into onboarding.
 *
 * "Travel, blackout dates, or other constraints" is free text
 * (`config.scheduleConstraintsNote`) — until travel mode it had zero
 * readers. This module does two honest, conservative things with it:
 *   - `mentionsTravel` decides whether the plan view offers a "set it up?"
 *     banner at all;
 *   - `parseTravelNote` best-effort extracts a date range + a kit guess to
 *     PREFILL the declaration sheet. It never applies anything on its own —
 *     the athlete confirms. When it can't parse dates it returns what it
 *     could, and the sheet opens with blanks.
 */
import type { TravelKit } from '../engines/planGenerator/travelMode'

export function mentionsTravel(note?: string): boolean {
  return !!note && /\b(travel|trip|vacation|holiday|away|blackout|flying|flight)\b/i.test(note)
}

export interface TravelNoteParse {
  startIso?: string
  endIso?: string
  kit?: TravelKit
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Build an ISO date for (month, day), choosing the year that puts it on or
 *  after `todayIso` — a trip typed in onboarding is in the future. */
function isoForMonthDay(month: number, day: number, todayIso: string): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const year = Number(todayIso.slice(0, 4))
  const thisYear = `${year}-${pad(month)}-${pad(day)}`
  return thisYear >= todayIso ? thisYear : `${year + 1}-${pad(month)}-${pad(day)}`
}

function guessKit(note: string): TravelKit | undefined {
  if (/no equipment|bodyweight|hotel room|no gym|no kit|nothing/i.test(note)) return 'bodyweight'
  if (/full travel|no training|red[- ]?eye|long[- ]?haul/i.test(note)) return 'rest'
  if (/hotel gym|full gym|gym access|weights/i.test(note)) return 'full'
  if (/run only|running only|can run|treadmill/i.test(note)) return 'run'
  return undefined
}

export function parseTravelNote(note: string | undefined, todayIso: string): TravelNoteParse {
  if (!note) return {}
  const kit = guessKit(note)

  // "May 15–22" / "May 15 - 22" (same month, day range)
  const sameMonth = note.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:[–—-]|to)\s*(\d{1,2})\b/)
  if (sameMonth) {
    const m = MONTHS[sameMonth[1].slice(0, 3).toLowerCase()]
    if (m) {
      const start = isoForMonthDay(m, Number(sameMonth[2]), todayIso)
      const end = isoForMonthDay(m, Number(sameMonth[3]), todayIso)
      if (start && end) return { startIso: start, endIso: end >= start ? end : start, kit }
    }
  }

  // "May 15 – Jun 2" (cross-month, month named on both ends)
  const crossMonth = note.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:[–—-]|to)\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/)
  if (crossMonth) {
    const m1 = MONTHS[crossMonth[1].slice(0, 3).toLowerCase()]
    const m2 = MONTHS[crossMonth[3].slice(0, 3).toLowerCase()]
    if (m1 && m2) {
      const start = isoForMonthDay(m1, Number(crossMonth[2]), todayIso)
      const end = isoForMonthDay(m2, Number(crossMonth[4]), todayIso)
      if (start && end && end >= start) return { startIso: start, endIso: end, kit }
    }
  }

  // "5/15 – 5/22" / "5/15 to 5/22" (numeric M/D on both ends)
  const numeric = note.match(/\b(\d{1,2})\/(\d{1,2})\s*(?:[–—-]|to)\s*(\d{1,2})\/(\d{1,2})\b/)
  if (numeric) {
    const start = isoForMonthDay(Number(numeric[1]), Number(numeric[2]), todayIso)
    const end = isoForMonthDay(Number(numeric[3]), Number(numeric[4]), todayIso)
    if (start && end && end >= start) return { startIso: start, endIso: end, kit }
  }

  return { kit }
}
