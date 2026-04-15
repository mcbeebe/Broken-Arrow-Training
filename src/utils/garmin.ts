import type { GarminHealthData, GarminActivity, GarminActivityDetail, ActualWorkout, StrengthExerciseLog, StrengthSet } from '../types'
import type { StreamData } from './strava'

const GARMIN_API_URL = import.meta.env.VITE_GARMIN_API_URL || ''

const STORAGE_KEYS = {
  health: 'ba_garmin_health',
  lastSync: 'ba_garmin_last_sync',
  connected: 'ba_garmin_connected',
  displayName: 'ba_garmin_display_name',
  activities: 'ba_garmin_activities',
  activityDetails: 'ba_garmin_activity_details',
  streams: 'ba_garmin_streams',
} as const

function scopedKey(base: string, athleteId?: string): string {
  return athleteId ? `${base}_${athleteId}` : base
}

// ─── API Functions ──────────────────────────────────────────────

export async function checkGarminAuth(
  athleteId?: string,
  credentials?: { email: string; password: string; mfa_code?: string },
): Promise<{ authenticated: boolean; displayName?: string; mfa_required?: boolean; error?: string }> {
  if (!GARMIN_API_URL) return { authenticated: false, error: 'Garmin API URL not configured' }

  const params = athleteId ? `?athlete=${athleteId}` : ''
  const body = credentials ? JSON.stringify(credentials) : undefined
  const res = await fetch(`${GARMIN_API_URL}/api/garmin/auth${params}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body,
  })
  return res.json()
}

export async function disconnectGarmin(athleteId?: string): Promise<void> {
  if (!GARMIN_API_URL) return
  const params = athleteId ? `?athlete=${athleteId}` : ''
  try {
    await fetch(`${GARMIN_API_URL}/api/garmin/auth${params}`, { method: 'DELETE' })
  } catch {
    // Best-effort — don't block frontend disconnect on backend failure
  }
}

export async function fetchHealthData(days: number = 1, athleteId?: string): Promise<GarminHealthData[]> {
  if (!GARMIN_API_URL) return []

  const tzOffset = Math.round(-new Date().getTimezoneOffset() / 60)  // e.g., -7 for Pacific
  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  const res = await fetch(`${GARMIN_API_URL}/api/garmin/health?days=${days}&tz=${tzOffset}${athleteParam}`)
  if (!res.ok) throw new Error(`Garmin health fetch failed: ${res.status}`)

  const data = await res.json()
  return data.dates || []
}

export async function fetchGarminActivities(start: string, end: string, athleteId?: string): Promise<GarminActivity[]> {
  if (!GARMIN_API_URL) return []

  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  const res = await fetch(`${GARMIN_API_URL}/api/garmin/activities?start=${start}&end=${end}${athleteParam}`)
  if (!res.ok) throw new Error(`Garmin activities fetch failed: ${res.status}`)

  const data = await res.json()
  return data.activities || []
}

// ─── localStorage Cache ─────────────────────────────────────────

export function getCachedHealthData(athleteId?: string): GarminHealthData[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.health, athleteId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function cacheHealthData(data: GarminHealthData[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.health, athleteId), JSON.stringify(data))
  localStorage.setItem(scopedKey(STORAGE_KEYS.lastSync, athleteId), new Date().toISOString())
}

export function mergeHealthData(existing: GarminHealthData[], incoming: GarminHealthData[]): GarminHealthData[] {
  const byDate = new Map<string, GarminHealthData>()
  for (const d of existing) byDate.set(d.date, d)
  for (const d of incoming) byDate.set(d.date, d)
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export function getGarminLastSync(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.lastSync, athleteId))
}

export function isGarminConnected(athleteId?: string): boolean {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.connected, athleteId)) === 'true'
}

export function setGarminConnected(connected: boolean, athleteId?: string, displayName?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.connected, athleteId), String(connected))
  if (displayName) {
    localStorage.setItem(scopedKey(STORAGE_KEYS.displayName, athleteId), displayName)
  }
}

export function getGarminDisplayName(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.displayName, athleteId))
}

export function clearGarminData(athleteId?: string): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(scopedKey(key, athleteId)))
}

export function isGarminConfigured(): boolean {
  return !!GARMIN_API_URL
}

export function isSyncStale(athleteId?: string, maxAgeMs: number = 12 * 60 * 60 * 1000): boolean {
  const lastSync = getGarminLastSync(athleteId)
  if (!lastSync) return true
  return Date.now() - new Date(lastSync).getTime() > maxAgeMs
}

// ─── Garmin Activity Cache ──────────────────────────────────────

export function getCachedGarminActivities(athleteId?: string): GarminActivity[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.activities, athleteId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function cacheGarminActivities(activities: GarminActivity[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.activities, athleteId), JSON.stringify(activities))
}

// ─── Activity Detail API & Cache ───────────────────────────────

export async function fetchActivityDetail(date: string, athleteId?: string): Promise<GarminActivityDetail[]> {
  if (!GARMIN_API_URL) return []
  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  const res = await fetch(`${GARMIN_API_URL}/api/garmin/activity_detail?date=${date}${athleteParam}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.activities || []
}

export function getCachedActivityDetails(athleteId?: string): Record<string, GarminActivityDetail[]> {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.activityDetails, athleteId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function cacheActivityDetails(details: Record<string, GarminActivityDetail[]>, athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.activityDetails, athleteId), JSON.stringify(details))
}

// ─── Activity Stream API & Cache ───────────────────────────────

/**
 * Fetch per-second time-series stream (HR, velocity, altitude, distance,
 * cadence) for a Garmin activity. Shape matches Strava's StreamData so
 * the same HRChart/PaceChart components can render either source.
 *
 * Results are cached in localStorage indefinitely — completed-activity
 * streams are immutable.
 */
export async function fetchGarminActivityStream(
  activityId: number | string,
  athleteId?: string,
): Promise<StreamData | null> {
  if (!GARMIN_API_URL) return null
  const cached = getCachedGarminStream(activityId, athleteId)
  if (cached) return cached

  const athleteParam = athleteId ? `&athlete=${athleteId}` : ''
  try {
    const res = await fetch(
      `${GARMIN_API_URL}/api/garmin/activity_stream?activityId=${activityId}${athleteParam}`,
    )
    if (!res.ok) return null
    const json = await res.json()
    const stream = json?.stream as StreamData | undefined
    if (!stream || !stream.heartrate || stream.heartrate.length === 0) return null
    cacheGarminStream(activityId, stream, athleteId)
    return stream
  } catch {
    return null
  }
}

function streamStorageKey(activityId: number | string, athleteId?: string): string {
  return `${scopedKey(STORAGE_KEYS.streams, athleteId)}_${activityId}`
}

function getCachedGarminStream(activityId: number | string, athleteId?: string): StreamData | null {
  try {
    const raw = localStorage.getItem(streamStorageKey(activityId, athleteId))
    return raw ? (JSON.parse(raw) as StreamData) : null
  } catch { return null }
}

function cacheGarminStream(activityId: number | string, data: StreamData, athleteId?: string): void {
  try {
    localStorage.setItem(streamStorageKey(activityId, athleteId), JSON.stringify(data))
  } catch {
    // Quota exceeded — not fatal, just skip caching
  }
}

// ─── Garmin Detail → ActualWorkout Converter ───────────────────

export function garminDetailToActual(detail: GarminActivityDetail): ActualWorkout {
  const distanceMiles = Math.round((detail.distanceMeters / 1609.344) * 100) / 100
  const elevFt = Math.round(detail.elevationGainMeters * 3.28084)

  // Convert exercise sets to strengthLog
  let strengthLog: StrengthExerciseLog[] | undefined
  if (detail.exerciseSets) {
    strengthLog = parseGarminExerciseSets(detail.exerciseSets)
    if (strengthLog.length === 0) strengthLog = undefined
  }

  return {
    stravaId: 0,
    garminId: detail.activityId,
    source: 'garmin',
    distance: distanceMiles,
    movingTime: detail.movingDurationSeconds || detail.durationSeconds,
    elapsedTime: detail.durationSeconds,
    avgHR: detail.averageHR,
    maxHR: detail.maxHR,
    calories: detail.calories,
    elevationGain: elevFt,
    type: detail.type,
    name: detail.name,
    startDate: detail.startTimeLocal,
    aerobicTE: detail.aerobicTrainingEffect,
    anaerobicTE: detail.anaerobicTrainingEffect,
    epoc: detail.activityTrainingLoad,
    recoveryTimeHours: detail.recoveryTime,
    vo2max: detail.vO2MaxValue,
    hrZoneSummary: detail.hrZones?.map((z, i, arr) => {
      const next = arr[i + 1]
      return {
        zone: z.zoneNumber,
        seconds: z.secsInZone,
        lowHR: z.zoneLowBoundary,
        // highHR = next zone's low boundary - 1 (if we have it)
        highHR: next?.zoneLowBoundary ? next.zoneLowBoundary - 1 : undefined,
      }
    }),
    strengthLog,
  }
}

function parseGarminExerciseSets(raw: unknown): StrengthExerciseLog[] {
  if (!raw) return []

  // Garmin exercise sets structure:
  // { exerciseSets: [ { exercises: [{category, name}], repetitionCount, weight, setType, duration }, ... ] }
  // OR just an array of sets directly
  let sets: Record<string, unknown>[]
  if (Array.isArray(raw)) {
    sets = raw as Record<string, unknown>[]
  } else {
    const obj = raw as Record<string, unknown>
    sets = (obj?.exerciseSets || []) as Record<string, unknown>[]
  }
  if (!Array.isArray(sets)) return []

  // Filter to ACTIVE sets only (skip REST)
  const activeSets = sets.filter(s => s.setType === 'ACTIVE')

  // Group sets by exercise name (category + name from exercises[0])
  const grouped = new Map<string, StrengthSet[]>()
  for (const s of activeSets) {
    const exList = (s.exercises || []) as Record<string, unknown>[]
    const firstEx = exList[0] as Record<string, unknown> | undefined
    // Use specific name if available, fall back to category
    const rawName = (firstEx?.name || firstEx?.category || 'Unknown') as string
    const name = formatExerciseName(rawName)

    const reps = (s.repetitionCount as number) || 0
    // Garmin sends weight in grams — convert to lbs
    const weightG = (s.weight as number) || 0
    const weightLbs = weightG > 0 ? Math.round(weightG / 453.592) : 0
    const duration = s.duration as number | undefined

    const set: StrengthSet = {
      reps,
      weight: weightLbs > 0 ? `${weightLbs} lbs` : '—',
      notes: duration && reps === 0 ? `${Math.round(duration)}s` : undefined,
    }

    const existing = grouped.get(name) || []
    existing.push(set)
    grouped.set(name, existing)
  }

  return Array.from(grouped.entries()).map(([name, sets]) => ({
    name,
    focus: classifyExerciseFocus(name),
    sets,
  }))
}

function formatExerciseName(garminName: string): string {
  return garminName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^Barbell /, '')
    .replace(/^Dumbbell /, 'DB ')
}

function classifyExerciseFocus(name: string): 'upper' | 'lower' | 'core' | 'full' {
  const lower = name.toLowerCase()
  if (/squat|lunge|deadlift|leg|calf|hip|glute|hamstring|quad/.test(lower)) return 'lower'
  if (/press|row|curl|pullup|pull-up|push|shoulder|chest|back|bicep|tricep|lat/.test(lower)) return 'upper'
  if (/plank|crunch|ab|core|twist|rotate/.test(lower)) return 'core'
  return 'full'
}
