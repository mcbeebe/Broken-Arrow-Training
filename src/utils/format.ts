/**
 * Get today's date as YYYY-MM-DD in the user's local timezone.
 * Using toISOString() returns UTC which is wrong after ~5pm Pacific.
 */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatMiles(miles: number): string {
  return miles % 1 === 0 ? `${miles} mi` : `${miles.toFixed(1)} mi`
}

/** A week's `miles` that states minutes and no miles is a time target, not
 *  a distance: General Fitness weeks are "~45 min cardio", and reading their
 *  digits showed 45 minutes of cardio as 45 miles. Such a week has no
 *  mileage target, like an uploaded plan's "By time" week. */
function isTimeTarget(miles: string): boolean {
  // Not \b before the unit: "60min" has no word boundary between 0 and m.
  return /(?<![a-z])min(ute)?s?\b/i.test(miles) && !/(?<![a-z])mi(les?)?\b/i.test(miles)
}

/** TrainingWeek.miles is numeric from the race generators, but General
 *  Fitness writes a time ("~45 min cardio"), uploaded plans write a label
 *  ("By time"), and stored legacy plans may still carry strings (some
 *  "~"-prefixed — the source of the field "~~7 mi" header). One parser for
 *  the header, the chip and the number; anything that isn't miles shows as
 *  written. */
function weekMilesNumber(miles: number | string): number | null {
  if (typeof miles === 'number') return miles
  const text = String(miles)
  if (isTimeTarget(text)) return null
  // The number given in miles ("20 min + 6 mi" is 6), else the first one
  // ("~7", "14+race"); never the digits run together ("6 mi + 20 min" ≠ 620).
  const m = text.match(/(\d+(?:\.\d+)?)\s*mi(?:les?)?\b/i) ?? text.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** Week header form: "~20 mi" (planned volumes are estimates). */
export function formatWeekMilesHeader(miles: number | string): string {
  const n = weekMilesNumber(miles)
  return n === null ? String(miles) : `~${n} mi`
}

/** Week chip form: "20 mi" — compact, always carries the unit. */
export function formatWeekMilesChip(miles: number | string): string {
  const n = weekMilesNumber(miles)
  return n === null ? String(miles) : `${n} mi`
}

export function formatSeconds(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}`
  }
  // Short efforts live and die by their seconds — a 3:34 erg TT must
  // never display as "3 min".
  if (seconds < 600) {
    const secs = Math.round(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins} min`
}

export function formatPace(miles: number, seconds: number): string {
  if (miles === 0) return '--'
  const paceSeconds = seconds / miles
  const mins = Math.floor(paceSeconds / 60)
  const secs = Math.round(paceSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`
}

// Precision-aware load formatter for the "number precision" detail setting.
// low/normal show whole numbers; high adds one decimal. Used for CTL/ATL/TSB
// style load values across the performance surfaces.
export function formatLoadP(load: number, precision: 'low' | 'normal' | 'high'): string {
  return precision === 'high' ? load.toFixed(1) : `${Math.round(load)}`
}

/** A week's planned miles, 0 when it has no mileage target (a time target
 *  such as "~45 min cardio", or a label such as "By time"). */
export function getMilesNumber(miles: number | string): number {
  return weekMilesNumber(miles) ?? 0
}

/**
 * Estimate run time from distance based on workout type.
 * Based on: 21-min 5K runner (~6:46/mi race pace)
 * Easy flat: ~10:00-10:30/mi
 * Rolling trail: ~11:30-13:00/mi
 * Hilly/technical trail: ~13:00-15:00/mi
 */
export function estimateRunTime(zoneStr: string): string | null {
  // Parse miles from zone string like "3.0 mi · Z1–2 (108–148)"
  const milesMatch = zoneStr.match(/([\d.]+)\s*mi/)
  if (!milesMatch) return null
  const miles = parseFloat(milesMatch[1])
  if (miles === 0) return null

  // Determine pace based on zone
  const isHilly = zoneStr.includes('Z3') || zoneStr.includes('Z4')
  const lowPace = isHilly ? 12.0 : 10.5  // min/mi
  const highPace = isHilly ? 14.0 : 12.5

  const lowMin = Math.round(miles * lowPace)
  const highMin = Math.round(miles * highPace)

  if (lowMin === highMin) return `~${lowMin} min`
  return `~${lowMin}-${highMin} min`
}
