/**
 * G10 acquisition attribution. The free calculators link back with
 * `?from=tool-*`; the first touch wins and is never overwritten, so a later
 * organic visit can't erase where the athlete actually came from. Shared by
 * the root page and the app, so it imports nothing.
 */

/** localStorage key; the JSON shape is `{ from: string, at: number }`. */
export const REFERRAL_KEY = 'ba_referral_source_v1'

/**
 * Record `?from=` as the referral source unless one is already stored.
 * Best-effort: storage errors are swallowed.
 *
 * @param search `location.search`.
 * @param now Timestamp to store; defaults to `Date.now()`.
 */
export function recordReferralSource(search: string, now: number = Date.now()): void {
  try {
    const from = new URLSearchParams(search).get('from')
    if (from && !localStorage.getItem(REFERRAL_KEY)) {
      localStorage.setItem(REFERRAL_KEY, JSON.stringify({ from, at: now }))
    }
  } catch {
    /* attribution is best-effort */
  }
}

/**
 * The stored first-touch referral source, or null when none (or storage is
 * unavailable). The landing page sends it with an invite request.
 */
export function readReferralSource(): string | null {
  try {
    const raw = localStorage.getItem(REFERRAL_KEY)
    if (!raw) return null
    const from = (JSON.parse(raw) as { from?: unknown })?.from
    return typeof from === 'string' && from ? from : null
  } catch {
    return null
  }
}
