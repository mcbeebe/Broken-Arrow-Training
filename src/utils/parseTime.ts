// Parse "mm:ss" or "hh:mm:ss" into total seconds.
//
// Also tolerant of digit-only input (no colon) so the numeric keypad on
// mobile — which has no ":" key — still produces a usable value:
//   "900"   → 9:00     (mm:ss)
//   "830"   → 8:30
//   "1230"  → 12:30
//   "13015" → 1:30:15  (hh:mm:ss)
//   "33015" → 3:30:15
// A bare 1–2 digit number stays ambiguous ("21" could be 21 min or 0:21)
// and returns undefined, matching the long-standing "needs a separator"
// contract for short inputs.
//
// Returns undefined on empty or malformed input.
export function parseTimeToSeconds(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  // Colon form — the canonical path. Preserved exactly (incl. the
  // "values >59 are taken literally" behavior for pasted stopwatch text).
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(p => p.trim())
    if (parts.length < 2 || parts.length > 3) return undefined
    if (parts.some(p => !/^\d+$/.test(p))) return undefined
    const nums = parts.map(Number)
    if (nums.length === 2) return nums[0] * 60 + nums[1]
    return nums[0] * 3600 + nums[1] * 60 + nums[2]
  }

  // Digit-only form — interpret the trailing two digits as seconds.
  if (!/^\d+$/.test(trimmed)) return undefined
  if (trimmed.length <= 2) return undefined // too short to disambiguate

  if (trimmed.length <= 4) {
    const mm = parseInt(trimmed.slice(0, trimmed.length - 2), 10)
    const ss = parseInt(trimmed.slice(-2), 10)
    if (ss >= 60) return undefined
    return mm * 60 + ss
  }
  if (trimmed.length <= 6) {
    const hh = parseInt(trimmed.slice(0, trimmed.length - 4), 10)
    const mm = parseInt(trimmed.slice(-4, -2), 10)
    const ss = parseInt(trimmed.slice(-2), 10)
    if (mm >= 60 || ss >= 60) return undefined
    return hh * 3600 + mm * 60 + ss
  }
  return undefined
}
