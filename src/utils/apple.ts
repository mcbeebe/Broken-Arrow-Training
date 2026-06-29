/**
 * Apple Health data access (recovery + workouts).
 *
 * The iOS companion app reads HealthKit and uploads to /api/apple/health.
 * This module is the web read path: it fetches that data back with the
 * signed-in athlete's Bearer JWT (the server derives identity from the
 * token, so — unlike Garmin — there is no `?athlete=` param), caches it in
 * localStorage, and normalizes it to the same `GarminHealthData` /
 * `GarminActivity` shapes the readiness engine already consumes. Both
 * recovery and activities are served by the one co-located endpoint
 * (`?kind=activities` switches modes) to stay under the Vercel function cap.
 */
import type { GarminHealthData, GarminActivity } from '../types'
import { getStoredSession } from './auth'

// Same Vercel API host as Garmin/auth — Apple endpoints live there too.
const APPLE_API_URL = (import.meta.env.VITE_GARMIN_API_URL || '').replace(/\/$/, '')

const STORAGE_KEYS = {
  health: 'ba_apple_health',
  activities: 'ba_apple_activities',
  lastSync: 'ba_apple_last_sync',
} as const

function scopedKey(base: string, athleteId?: string): string {
  return athleteId ? `${base}_${athleteId}` : base
}

/**
 * An Apple Watch activity is a `GarminActivity` (so the training-load and
 * matching pipelines treat it identically) plus two Apple-only fields: the
 * real HKWorkout UUID for dedup, and the steep-descent vertical we compute
 * on-device to feed the readiness load-dampening / DOMS engine.
 */
export interface AppleActivity extends GarminActivity {
  appleId?: string
  source?: 'apple'
  hardDescentVerticalMeters?: number
}

function authHeaders(): Record<string, string> | null {
  const token = getStoredSession()?.token
  return token ? { Authorization: `Bearer ${token}` } : null
}

export function isAppleConfigured(): boolean {
  return !!APPLE_API_URL
}

// ─── API ────────────────────────────────────────────────────────

export async function fetchAppleHealth(days = 30, _athleteId?: string): Promise<GarminHealthData[]> {
  const headers = authHeaders()
  if (!APPLE_API_URL || !headers) return []
  try {
    const res = await fetch(`${APPLE_API_URL}/api/apple/health?days=${days}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return (data.dates as GarminHealthData[]) || []
  } catch {
    return []
  }
}

export async function fetchAppleActivities(days = 120, _athleteId?: string): Promise<AppleActivity[]> {
  const headers = authHeaders()
  if (!APPLE_API_URL || !headers) return []
  try {
    const res = await fetch(`${APPLE_API_URL}/api/apple/health?kind=activities&days=${days}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return (data.activities as AppleActivity[]) || []
  } catch {
    return []
  }
}

// ─── localStorage cache ─────────────────────────────────────────

export function getCachedAppleHealth(athleteId?: string): GarminHealthData[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.health, athleteId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function cacheAppleHealth(data: GarminHealthData[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.health, athleteId), JSON.stringify(data))
}

export function getCachedAppleActivities(athleteId?: string): AppleActivity[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.activities, athleteId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function cacheAppleActivities(activities: AppleActivity[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.activities, athleteId), JSON.stringify(activities))
}

export function markAppleSynced(athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.lastSync, athleteId), new Date().toISOString())
}

export function getAppleLastSync(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.lastSync, athleteId))
}

export function clearAppleData(athleteId?: string): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(scopedKey(key, athleteId)))
}

export function isAppleSyncStale(athleteId?: string, maxAgeMs: number = 12 * 60 * 60 * 1000): boolean {
  const lastSync = getAppleLastSync(athleteId)
  if (!lastSync) return true
  return Date.now() - new Date(lastSync).getTime() > maxAgeMs
}

// ─── merge (history-preserving, like Garmin) ────────────────────

/** Merge by date; incoming wins (fresher). Mirrors mergeHealthData. */
export function mergeAppleHealth(existing: GarminHealthData[], incoming: GarminHealthData[]): GarminHealthData[] {
  const byDate = new Map<string, GarminHealthData>()
  for (const d of existing) byDate.set(d.date, d)
  for (const d of incoming) byDate.set(d.date, d)
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Merge by stable identity (the HKWorkout UUID, falling back to the derived
 * numeric id). A sync only returns activities inside its window, so merging —
 * rather than replacing — keeps older completed sessions. Incoming wins.
 */
export function mergeAppleActivities(existing: AppleActivity[], incoming: AppleActivity[]): AppleActivity[] {
  const keyOf = (a: AppleActivity): string =>
    a.appleId ? `u:${a.appleId}` : a.activityId != null ? `id:${a.activityId}` : `d:${a.date}|${a.name}|${a.durationMinutes}`
  const byKey = new Map<string, AppleActivity>()
  for (const a of existing) byKey.set(keyOf(a), a)
  for (const a of incoming) byKey.set(keyOf(a), a)
  return Array.from(byKey.values()).sort((a, b) => b.date.localeCompare(a.date))
}
