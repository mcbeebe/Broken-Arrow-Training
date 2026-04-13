import type { GarminHealthData, GarminActivity } from '../types'

const GARMIN_API_URL = import.meta.env.VITE_GARMIN_API_URL || ''

const STORAGE_KEYS = {
  health: 'ba_garmin_health',
  lastSync: 'ba_garmin_last_sync',
  connected: 'ba_garmin_connected',
  activities: 'ba_garmin_activities',
} as const

// ─── API Functions ──────────────────────────────────────────────

export async function checkGarminAuth(): Promise<{ authenticated: boolean; displayName?: string; error?: string }> {
  if (!GARMIN_API_URL) return { authenticated: false, error: 'Garmin API URL not configured' }

  const res = await fetch(`${GARMIN_API_URL}/api/garmin/auth`, { method: 'POST' })
  return res.json()
}

export async function fetchHealthData(days: number = 1): Promise<GarminHealthData[]> {
  if (!GARMIN_API_URL) return []

  const res = await fetch(`${GARMIN_API_URL}/api/garmin/health?days=${days}`)
  if (!res.ok) throw new Error(`Garmin health fetch failed: ${res.status}`)

  const data = await res.json()
  return data.dates || []
}

export async function fetchGarminActivities(start: string, end: string): Promise<GarminActivity[]> {
  if (!GARMIN_API_URL) return []

  const res = await fetch(`${GARMIN_API_URL}/api/garmin/activities?start=${start}&end=${end}`)
  if (!res.ok) throw new Error(`Garmin activities fetch failed: ${res.status}`)

  const data = await res.json()
  return data.activities || []
}

// ─── localStorage Cache ─────────────────────────────────────────

export function getCachedHealthData(): GarminHealthData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.health)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function cacheHealthData(data: GarminHealthData[]): void {
  localStorage.setItem(STORAGE_KEYS.health, JSON.stringify(data))
  localStorage.setItem(STORAGE_KEYS.lastSync, new Date().toISOString())
}

export function mergeHealthData(existing: GarminHealthData[], incoming: GarminHealthData[]): GarminHealthData[] {
  const byDate = new Map<string, GarminHealthData>()
  for (const d of existing) byDate.set(d.date, d)
  for (const d of incoming) byDate.set(d.date, d)  // newer data wins
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export function getGarminLastSync(): string | null {
  return localStorage.getItem(STORAGE_KEYS.lastSync)
}

export function isGarminConnected(): boolean {
  return localStorage.getItem(STORAGE_KEYS.connected) === 'true'
}

export function setGarminConnected(connected: boolean): void {
  localStorage.setItem(STORAGE_KEYS.connected, String(connected))
}

export function clearGarminData(): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key))
}

export function isGarminConfigured(): boolean {
  return !!GARMIN_API_URL
}

export function isSyncStale(maxAgeMs: number = 12 * 60 * 60 * 1000): boolean {
  const lastSync = getGarminLastSync()
  if (!lastSync) return true
  return Date.now() - new Date(lastSync).getTime() > maxAgeMs
}

// ─── Garmin Activity Cache ──────────────────────────────────────

export function getCachedGarminActivities(): GarminActivity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activities)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function cacheGarminActivities(activities: GarminActivity[]): void {
  localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(activities))
}
