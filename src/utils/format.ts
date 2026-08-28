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

/** TrainingWeek.miles is numeric from every generator now, but stored
 *  legacy plans may still carry strings (some "~"-prefixed — the source
 *  of the field "~~7 mi" header). One parser, two presentations. */
function weekMilesNumber(miles: number | string): number | null {
  if (typeof miles === 'number') return miles
  const n = parseFloat(String(miles).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
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

export function getMilesNumber(miles: number | string): number {
  if (typeof miles === 'number') return miles
  const match = String(miles).match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
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
