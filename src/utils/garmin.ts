import type { GarminHealthData, GarminActivity, GarminActivityDetail, ActualWorkout, StrengthExerciseLog, StrengthSet } from '../types'

const GARMIN_API_URL = import.meta.env.VITE_GARMIN_API_URL || ''

const STORAGE_KEYS = {
  health: 'ba_garmin_health',
  lastSync: 'ba_garmin_last_sync',
  connected: 'ba_garmin_connected',
  activities: 'ba_garmin_activities',
  activityDetails: 'ba_garmin_activity_details',
} as const

// ─── API Functions ──────────────────────────────────────────────

export async function checkGarminAuth(): Promise<{ authenticated: boolean; displayName?: string; error?: string }> {
  if (!GARMIN_API_URL) return { authenticated: false, error: 'Garmin API URL not configured' }

  const res = await fetch(`${GARMIN_API_URL}/api/garmin/auth`, { method: 'POST' })
  return res.json()
}

export async function fetchHealthData(days: number = 1): Promise<GarminHealthData[]> {
  if (!GARMIN_API_URL) return []

  const tzOffset = Math.round(-new Date().getTimezoneOffset() / 60)  // e.g., -7 for Pacific
  const res = await fetch(`${GARMIN_API_URL}/api/garmin/health?days=${days}&tz=${tzOffset}`)
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

// ─── Activity Detail API & Cache ───────────────────────────────

export async function fetchActivityDetail(date: string): Promise<GarminActivityDetail[]> {
  if (!GARMIN_API_URL) return []
  const res = await fetch(`${GARMIN_API_URL}/api/garmin/activity_detail?date=${date}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.activities || []
}

export function getCachedActivityDetails(): Record<string, GarminActivityDetail[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activityDetails)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function cacheActivityDetails(details: Record<string, GarminActivityDetail[]>): void {
  localStorage.setItem(STORAGE_KEYS.activityDetails, JSON.stringify(details))
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
    hrZoneSummary: detail.hrZones?.map(z => ({ zone: z.zoneNumber, seconds: z.secsInZone })),
    strengthLog,
  }
}

function parseGarminExerciseSets(raw: unknown): StrengthExerciseLog[] {
  if (!raw) return []

  // Handle the Garmin response format
  const obj = raw as Record<string, unknown>
  const exercises = (obj?.exercises || obj?.exerciseSets || (Array.isArray(raw) ? raw : [])) as Record<string, unknown>[]
  if (!Array.isArray(exercises)) return []

  return exercises.map((ex: Record<string, unknown>) => {
    const name = formatExerciseName((ex.exerciseName || ex.category || 'Unknown') as string)
    const focus = classifyExerciseFocus(name)
    const rawSets = (ex.sets || []) as Record<string, unknown>[]
    const sets: StrengthSet[] = (Array.isArray(rawSets) ? rawSets : []).map((s: Record<string, unknown>) => ({
      reps: (s.repetitionCount as number) || 0,
      weight: s.weight ? `${Math.round((s.weight as number) * 2.205)} lbs` : '—', // Garmin sends kg, convert to lbs
      notes: s.duration ? `${Math.round(s.duration as number)}s` : undefined,
    }))
    return { name, focus, sets }
  })
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
