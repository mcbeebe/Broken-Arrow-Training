/**
 * The landing page's only network call: an invite request into the existing
 * access queue (POST /api/auth/athletes, `action: request_access`), which
 * initiative 003 PR 2 hardened with a honeypot, a per-IP throttle and a daily
 * cap on admin emails. Imports nothing from the app.
 */

/** Endpoint path; the server routes it to api/auth/google.py. */
export const INVITE_PATH = '/api/auth/athletes'
export const INVITE_TIMEOUT_MS = 10_000

export interface InviteInput {
  email: string
  note: string
  /** Referral source (`tool-heat`, `landing`, ...); the server drops anything malformed. */
  source: string | null
  /** Honeypot; always '' from a person. The server silently drops filled ones. */
  hp_contact_ref: string
}

export type InviteResult =
  | { ok: true }
  | { ok: false; kind: 'invalid' | 'throttled' | 'unavailable' | 'network'; message?: string }

/**
 * The API origin, resolved exactly as src/utils/coachApi.ts `coachApiBase()`
 * does (duplicated, not imported: landing code may not import app code).
 */
export function resolveApiBase(env: { VITE_COACH_API_URL?: string; VITE_GARMIN_API_URL?: string }): string {
  return (env.VITE_COACH_API_URL || env.VITE_GARMIN_API_URL || '').replace(/\/$/, '')
}

// Read the two variables by name: passing import.meta.env whole would make
// Vite inline every VITE_* setting into the landing chunk.
export const API_BASE = resolveApiBase({
  VITE_COACH_API_URL: import.meta.env.VITE_COACH_API_URL as string | undefined,
  VITE_GARMIN_API_URL: import.meta.env.VITE_GARMIN_API_URL as string | undefined,
})

/**
 * POST an invite request to the existing access queue.
 *
 * 200 → ok; 400 → invalid, carrying the server's message; 429 → throttled;
 * any other status → unavailable; a thrown fetch or the 10 s timeout →
 * network. Never throws.
 *
 * @param deps Injectable fetch and base URL, for tests.
 */
export async function requestInvite(
  input: InviteInput,
  deps: { fetch?: typeof fetch; base?: string } = {},
): Promise<InviteResult> {
  const doFetch = deps.fetch ?? fetch
  const base = deps.base ?? API_BASE
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INVITE_TIMEOUT_MS)
  let res: Response
  try {
    res = await doFetch(`${base}${INVITE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_access', ...input }),
      signal: controller.signal,
    })
  } catch {
    return { ok: false, kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) return { ok: true }
  if (res.status === 429) return { ok: false, kind: 'throttled' }
  if (res.status === 400) {
    const message = await res
      .json()
      .then((d: { error?: unknown }) => (typeof d?.error === 'string' && d.error.trim() ? d.error : undefined))
      .catch(() => undefined)
    return message ? { ok: false, kind: 'invalid', message } : { ok: false, kind: 'invalid' }
  }
  return { ok: false, kind: 'unavailable' }
}
