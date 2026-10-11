import { coachApiBase, coachAuthHeaders } from '../coachApi'
import type { CheckinSnapshot } from './snapshot'

/** What `GET /api/coach/checkin` returns. */
export interface CheckinStatus {
  allowed: boolean
  enabled?: boolean
  email?: string
  snapshotAsOf?: string | null
  lastSent?: { at: number; subject: string; test?: boolean } | null
}

export interface CheckinReply<T> {
  ok: boolean
  status: number
  body: T & { error?: string }
}

async function call<T>(method: 'GET' | 'POST', body?: unknown): Promise<CheckinReply<T>> {
  const base = coachApiBase()
  if (!base) return { ok: false, status: 0, body: { error: 'coach_api_unavailable' } as T & { error?: string } }
  try {
    const res = await fetch(`${base}/api/coach/checkin`, {
      method,
      headers: { 'Content-Type': 'application/json', ...coachAuthHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body: json }
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } as T & { error?: string } }
  }
}

/** Whether the email is on, where it goes, and when it last went. */
export function fetchCheckinStatus(): Promise<CheckinReply<CheckinStatus>> {
  return call<CheckinStatus>('GET')
}

/** Turn the Sunday/Wednesday email on or off. */
export function saveCheckinEnabled(enabled: boolean): Promise<CheckinReply<{ enabled: boolean; email: string }>> {
  return call('POST', { action: 'settings', enabled })
}

/** Store the latest snapshot for the next email. */
export function uploadCheckinSnapshot(snapshot: CheckinSnapshot): Promise<CheckinReply<{ asOf: string }>> {
  return call('POST', { action: 'snapshot', snapshot })
}

/** Send a check-in now, from the last uploaded snapshot. */
export function sendCheckinTest(): Promise<CheckinReply<{ sentAt: number }>> {
  return call('POST', { action: 'test' })
}
