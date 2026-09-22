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

/** The keypad holds four digits: 99:59 is the longest set it can say. */
export const MAX_SET_SEC = 99 * 60 + 59

/** "145" → 105 s. The last two digits are seconds, the rest minutes.
 *  Seconds past 59 roll into minutes ("175" → 2:15) so a typo never
 *  produces an impossible clock; anything past 99:59 is 99:59. Empty → 0. */
export function secondsFromDigits(digits: string): number {
  const d = digits.replace(/\D/g, '').slice(-4)
  if (!d) return 0
  const secs = parseInt(d.slice(-2), 10) || 0
  const mins = d.length > 2 ? parseInt(d.slice(0, -2), 10) || 0 : 0
  return Math.min(MAX_SET_SEC, mins * 60 + secs)
}

/** 105 → "145": the digits that reproduce a stored time in the keypad.
 *  A stored time past 99:59 comes back as the keypad's ceiling. */
export function digitsFromSeconds(sec: number | undefined): string {
  if (!sec || sec <= 0) return ''
  const s = Math.min(MAX_SET_SEC, Math.round(sec))
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

/** The keypad's live display for a digit buffer, shown as typed: "9" →
 *  "0:09", "145" → "1:45", "175" → "1:75" (the stored value rolls that
 *  to 2:15 once the cell closes), "" → "0:00". Showing the roll-over
 *  mid-entry would assert a time the athlete has not typed yet. */
export function formatDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(-4)
  if (!d) return '0:00'
  const secs = d.slice(-2).padStart(2, '0')
  const mins = d.length > 2 ? d.slice(0, -2) : '0'
  return `${mins}:${secs}`
}
