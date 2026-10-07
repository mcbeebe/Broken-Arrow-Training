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

/** What api/auth/google.py accepts as an invite's `source`; it drops anything else. */
const SOURCE_RE = /^[a-z0-9-]{1,40}$/

/**
 * The stored first-touch referral source, or null when none, when storage is
 * unavailable, or when the server would drop it (so the caller can fall back
 * to its own source instead of sending one that gets thrown away).
 */
export function readReferralSource(): string | null {
  try {
    const raw = localStorage.getItem(REFERRAL_KEY)
    if (!raw) return null
    const from = (JSON.parse(raw) as { from?: unknown })?.from
    return typeof from === 'string' && SOURCE_RE.test(from) ? from : null
  } catch {
    return null
  }
}
