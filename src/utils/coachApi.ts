/**
 * Shared base URL + helpers for /api/coach/* endpoints.
 *
 * The Coach API lives on the same Vercel deployment as the Garmin API, so
 * we reuse VITE_GARMIN_API_URL. A dedicated VITE_COACH_API_URL can override.
 */

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
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`coach_api_error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
