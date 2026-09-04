/**
 * Shared base URL + helpers for /api/coach/* endpoints.
 *
 * The Coach API lives on the same Vercel deployment as the Garmin API, so
 * we reuse VITE_GARMIN_API_URL. A dedicated VITE_COACH_API_URL can override.
 */
import { getStoredSession } from './auth'

/**
 * Authorization header for /api/coach/*, when the athlete has a session.
 *
 * The coach endpoints used to take `athleteId` from the request body and
 * believe it, which meant anyone who could guess an id could read another
 * athlete's coach memory or spend their model budget. They now derive the
 * athlete from this token, so every call has to carry it.
 *
 * Returns an empty object when there is no session (the hash-auth dev path
 * with no Google client ID configured) — the request then fails closed at
 * the server with a 401 rather than silently acting as someone else.
 */
export function coachAuthHeaders(): Record<string, string> {
  const token = getStoredSession()?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function coachApiBase(): string {
  const explicit = import.meta.env.VITE_COACH_API_URL as string | undefined
  const garmin = import.meta.env.VITE_GARMIN_API_URL as string | undefined
  return (explicit || garmin || '').replace(/\/$/, '')
}

export function coachApiAvailable(): boolean {
  return !!coachApiBase()
}

export async function coachFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = coachApiBase()
  if (!base) throw new Error('coach_api_unavailable')
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...coachAuthHeaders(),
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`coach_api_error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/**
 * Post a user message to the coach chat WITHOUT a chat UI mounted, and
 * discard the streamed reply. The server still persists the user turn +
 * the assistant's reply and runs durable-fact extraction (detect_inferences)
 * — so the coach "receives and analyzes" the message and its reply waits in
 * the Coach tab. Used to share a workout journal note in the background
 * without yanking the athlete out of the workout view.
 *
 * Caller should refresh coach memory afterward to surface the new turn +
 * any learned facts. Best-effort: throws on network/HTTP failure so the
 * caller can decide whether to surface it (the journal note itself is
 * persisted independently).
 */
export async function sendCoachMessageBackground(
  athleteId: string,
  content: string,
  snapshot: unknown,
): Promise<void> {
  const base = coachApiBase()
  if (!base) throw new Error('coach_api_unavailable')
  const res = await fetch(`${base}/api/coach/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...coachAuthHeaders() },
    body: JSON.stringify({
      athleteId,
      messages: [{ role: 'user', content }],
      snapshot,
    }),
  })
  if (!res.ok || !res.body) throw new Error(`coach_chat_error ${res.status}`)
  // Drain the SSE stream so the server finishes generating + persisting the
  // reply (and runs fact extraction). We don't render the deltas.
  const reader = res.body.getReader()
  let streamDone = false
  while (!streamDone) {
    const { done } = await reader.read()
    streamDone = done
  }
}
