/**
 * Per-set time — the number that matters on a wall-ball set, a SkiErg
 * 500 m, a sled push, a farmer carry: anything prescribed as a distance
 * or a rep count where the athlete is racing the clock, not the load.
 *
 * The live player records `timeSec` from its own clock; the manual
 * editor lets the athlete type it. Entry is microwave-style: digits
 * fill from the right into m:ss ("1", "14", "145" → 0:01, 0:14, 1:45),
 * so a thumb never has to place a colon.
 */

/** "145" → 105 s. The last two digits are seconds, the rest minutes.
 *  Seconds past 59 roll into minutes ("175" → 2:15) so a typo never
 *  produces an impossible clock. Empty → 0. */
export function secondsFromDigits(digits: string): number {
  const d = digits.replace(/\D/g, '').slice(-4)
  if (!d) return 0
  const secs = parseInt(d.slice(-2), 10) || 0
  const mins = d.length > 2 ? parseInt(d.slice(0, -2), 10) || 0 : 0
  return mins * 60 + secs
}

/** 105 → "145": the digits that reproduce a stored time in the keypad. */
export function digitsFromSeconds(sec: number | undefined): string {
  if (!sec || sec <= 0) return ''
  const s = Math.round(sec)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return mins > 0 ? `${mins}${String(secs).padStart(2, '0')}` : String(secs)
}

/** 105 → "1:45"; 3725 → "62:05". Always shows seconds — a set time lives
 *  and dies by them. */
export function formatSetTime(sec: number | undefined): string {
  if (sec == null || sec <= 0) return ''
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The keypad's live display for a digit buffer: "145" → "1:45", "" → "0:00". */
export function formatDigits(digits: string): string {
  return formatSetTime(secondsFromDigits(digits)) || '0:00'
}
