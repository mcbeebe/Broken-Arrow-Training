import type { GarminHealthData, GarminActivity, GarminActivityDetail } from '../types'
import type { StreamData } from './strava'

const TERRA_API_URL = import.meta.env.VITE_TERRA_API_URL || ''

const STORAGE_KEYS = {
  health: 'ba_terra_health',
  lastSync: 'ba_terra_last_sync',
  connected: 'ba_terra_connected',
  displayName: 'ba_terra_display_name',
  userId: 'ba_terra_user_id',
  activities: 'ba_terra_activities',
  activityDetails: 'ba_terra_activity_details',
  streams: 'ba_terra_streams',
} as const

function scopedKey(base: string, athleteId?: string): string {
  return athleteId ? `${base}_${athleteId}` : base
}

// ─── API Functions ──────────────────────────────────────────────

export async function initTerraWidget(
  athleteId?: string,
): Promise<{ widgetUrl: string; sessionId: string }> {
  const params = athleteId ? `?athlete=${athleteId}` : ''
  const res = await fetch(`${TERRA_API_URL}/api/terra/widget${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Terra widget init failed: ${res.status}`)
  return res.json()
}

export async function checkTerraConnection(
  athleteId?: string,
): Promise<{ connected: boolean; userId?: string; provider?: string; displayName?: string }> {
  if (!TERRA_API_URL) return { connected: false }
  const params = athleteId ? `?athlete=${athleteId}` : ''
  const res = await fetch(`${TERRA_API_URL}/api/terra/status${params}`)
  if (!res.ok) return { connected: false }
  return res.json()
}

export async function disconnectTerra(athleteId?: string): Promise<void> {
  if (!TERRA_API_URL) return
  const params = athleteId ? `?athlete=${athleteId}` : ''
  try {
    await fetch(`${TERRA_API_URL}/api/terra/auth${params}`, { method: 'DELETE' })
  } catch {
    // Best-effort
  }
}

export async function fetchTerraHealth(days: number = 120, athleteId?: string): Promise<GarminHealthData[]> {
  if (!TERRA_API_URL) return []
  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  // Try Apple Health endpoint first (iOS companion app pushes data here)
  try {
    const appleRes = await fetch(`${TERRA_API_URL}/api/apple/health?days=${days}${athleteParam}`)
    if (appleRes.ok) {
      const appleData = await appleRes.json()
      const appleDates = appleData.dates || []
      if (appleDates.length > 0) return appleDates
    }
  } catch { /* fall through to Terra */ }
  // Fallback to Terra API
  const res = await fetch(`${TERRA_API_URL}/api/terra/health?days=${days}${athleteParam}`)
  if (!res.ok) throw new Error(`Health data fetch failed: ${res.status}`)
  const data = await res.json()
  return (data.dates || []).map(normalizeTerraHealth)
}

export async function fetchTerraActivities(start: string, end: string, athleteId?: string): Promise<GarminActivity[]> {
  if (!TERRA_API_URL) return []
  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  const res = await fetch(`${TERRA_API_URL}/api/terra/activities?start=${start}&end=${end}${athleteParam}`)
  if (!res.ok) throw new Error(`Terra activities fetch failed: ${res.status}`)
  const data = await res.json()
  return (data.activities || []).map(normalizeTerraActivity)
}

export async function fetchTerraActivityDetail(date: string, athleteId?: string): Promise<GarminActivityDetail[]> {
  if (!TERRA_API_URL) return []
  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  const res = await fetch(`${TERRA_API_URL}/api/terra/activity_detail?date=${date}${athleteParam}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.activities || []).map(normalizeTerraActivityDetail)
}

export async function fetchTerraActivityStream(
  activityId: number | string,
  athleteId?: string,
): Promise<StreamData | null> {
  if (!TERRA_API_URL) return null
  const cached = getCachedTerraStream(activityId, athleteId)
  if (cached) return cached
  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  try {
    const res = await fetch(`${TERRA_API_URL}/api/terra/activity_stream?activityId=${activityId}${athleteParam}`)
    if (!res.ok) return null
    const data = await res.json()
    const stream: StreamData = data.stream || { heartrate: [], time: [], altitude: [], velocity: [], distance: [], cadence: [] }
    cacheTerraStream(activityId, stream, athleteId)
    return stream
  } catch {
    return null
  }
}

// ─── Data Normalization ─────────────────────────────────────────
// Terra responses → existing Garmin types so the readiness engine
// doesn't know or care where data came from.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTerraHealth(raw: any): GarminHealthData {
  return {
    date: raw.date || raw.metadata?.date || '',
    hrv: raw.hrv_data ? {
      weeklyAvg: 0,
      lastNightAvg: raw.hrv_data.avg_hrv_rmssd ?? raw.hrv_data.rmssd ?? 0,
      status: 'UNKNOWN',
    } : undefined,
    rhr: raw.heart_data?.resting_hr_bpm ?? raw.rhr ?? undefined,
    sleep: raw.sleep_data ? {
      durationSeconds: raw.sleep_data.duration_seconds ?? 0,
      quality: mapSleepQuality(raw.sleep_data.sleep_efficiency ?? raw.sleep_data.score),
      deepSeconds: raw.sleep_data.deep_seconds ?? 0,
      remSeconds: raw.sleep_data.rem_seconds ?? 0,
      lightSeconds: raw.sleep_data.light_seconds ?? 0,
      awakeSeconds: raw.sleep_data.awake_seconds ?? 0,
      score: raw.sleep_data.sleep_efficiency ?? raw.sleep_data.score,
    } : undefined,
    bodyBattery: undefined,
  }
}

function mapSleepQuality(score?: number): string {
  if (score == null) return 'UNKNOWN'
  if (score >= 85) return 'EXCELLENT'
  if (score >= 70) return 'GOOD'
  if (score >= 50) return 'FAIR'
  return 'POOR'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTerraActivity(raw: any): GarminActivity {
  return {
    date: raw.date || raw.metadata?.date || '',
    type: raw.metadata?.type || raw.type || 'UNKNOWN',
    name: raw.metadata?.name || raw.name || 'Activity',
    durationMinutes: ((raw.active_durations_data?.activity_seconds ?? raw.duration_seconds ?? 0) / 60),
    avgHR: raw.heart_rate_data?.avg_hr_bpm ?? raw.avgHR,
    maxHR: raw.heart_rate_data?.max_hr_bpm ?? raw.maxHR,
    elevationGainFt: Math.round((raw.distance_data?.elevation?.gain_actual_meters ?? raw.elevation_gain_meters ?? 0) * 3.28084),
    trainingEffect: undefined,
    anaerobicTrainingEffect: undefined,
    activityTrainingLoad: undefined,
    calories: raw.calories_data?.total_burned_calories ?? raw.calories,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTerraActivityDetail(raw: any): GarminActivityDetail {
  const activityId = typeof raw.metadata?.id === 'number' ? raw.metadata.id : hashId(raw.metadata?.id || raw.id || `${raw.date}-${Math.random()}`)
  return {
    activityId,
    name: raw.metadata?.name || raw.name || 'Activity',
    type: raw.metadata?.type || raw.type || 'UNKNOWN',
    startTimeLocal: raw.metadata?.start_time || raw.start_time || '',
    durationSeconds: raw.active_durations_data?.activity_seconds ?? raw.duration_seconds ?? 0,
    movingDurationSeconds: raw.active_durations_data?.moving_time_seconds ?? raw.moving_time_seconds ?? 0,
    averageHR: raw.heart_rate_data?.avg_hr_bpm ?? raw.avgHR,
    maxHR: raw.heart_rate_data?.max_hr_bpm ?? raw.maxHR,
    distanceMeters: raw.distance_data?.distance_meters ?? raw.distance_meters ?? 0,
    elevationGainMeters: raw.distance_data?.elevation?.gain_actual_meters ?? raw.elevation_gain_meters ?? 0,
    elevationLossMeters: raw.distance_data?.elevation?.loss_actual_meters ?? raw.elevation_loss_meters ?? 0,
    calories: raw.calories_data?.total_burned_calories ?? raw.calories ?? 0,
    hrZones: raw.heart_rate_data?.hr_zone_data?.map((z: { min_hr?: number; duration_seconds?: number; zone_number?: number }, i: number) => ({
      zoneNumber: z.zone_number ?? i + 1,
      zoneLowBoundary: z.min_hr ?? 0,
      secsInZone: z.duration_seconds ?? 0,
    })),
    aerobicTrainingEffect: undefined,
    anaerobicTrainingEffect: undefined,
    activityTrainingLoad: undefined,
    vO2MaxValue: undefined,
    recoveryTime: undefined,
  }
}

function hashId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ─── localStorage Cache ─────────────────────────────────────────

export function getCachedTerraHealth(athleteId?: string): GarminHealthData[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.health, athleteId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function cacheTerraHealth(data: GarminHealthData[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.health, athleteId), JSON.stringify(data))
  localStorage.setItem(scopedKey(STORAGE_KEYS.lastSync, athleteId), new Date().toISOString())
}

export function mergeTerraHealth(existing: GarminHealthData[], incoming: GarminHealthData[]): GarminHealthData[] {
  const byDate = new Map<string, GarminHealthData>()
  for (const d of existing) byDate.set(d.date, d)
  for (const d of incoming) byDate.set(d.date, d)
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export function getTerraLastSync(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.lastSync, athleteId))
}

export function isTerraConnected(athleteId?: string): boolean {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.connected, athleteId)) === 'true'
}

export function setTerraConnected(connected: boolean, athleteId?: string, displayName?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.connected, athleteId), String(connected))
  if (displayName) {
    localStorage.setItem(scopedKey(STORAGE_KEYS.displayName, athleteId), displayName)
  }
}

export function getTerraDisplayName(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.displayName, athleteId))
}

export function getTerraUserId(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.userId, athleteId))
}

export function setTerraUserId(userId: string, athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.userId, athleteId), userId)
}

export function clearTerraData(athleteId?: string): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(scopedKey(key, athleteId)))
}

export function isTerraConfigured(): boolean {
  return !!TERRA_API_URL
}

export function isSyncStale(athleteId?: string, maxAgeMs: number = 12 * 60 * 60 * 1000): boolean {
  const lastSync = getTerraLastSync(athleteId)
  if (!lastSync) return true
  return Date.now() - new Date(lastSync).getTime() > maxAgeMs
}

export function getCachedTerraActivities(athleteId?: string): GarminActivity[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.activities, athleteId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function cacheTerraActivities(activities: GarminActivity[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.activities, athleteId), JSON.stringify(activities))
}

export function getCachedTerraActivityDetails(athleteId?: string): Record<string, GarminActivityDetail[]> {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.activityDetails, athleteId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function cacheTerraActivityDetails(details: Record<string, GarminActivityDetail[]>, athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.activityDetails, athleteId), JSON.stringify(details))
}

function getCachedTerraStream(activityId: number | string, athleteId?: string): StreamData | null {
  try {
    const raw = localStorage.getItem(scopedKey(`${STORAGE_KEYS.streams}_${activityId}`, athleteId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function cacheTerraStream(activityId: number | string, stream: StreamData, athleteId?: string): void {
  localStorage.setItem(scopedKey(`${STORAGE_KEYS.streams}_${activityId}`, athleteId), JSON.stringify(stream))
}
