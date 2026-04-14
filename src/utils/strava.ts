import type { StravaTokens, StravaActivity } from '../types'

// Strava OAuth config — set VITE_STRAVA_CLIENT_ID in .env
const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || ''
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI ||
  `${window.location.origin}${import.meta.env.BASE_URL}`
const TOKEN_EXCHANGE_URL = import.meta.env.VITE_STRAVA_TOKEN_EXCHANGE_URL || ''

const STORAGE_KEY_TOKENS = 'ba_strava_tokens'
const STORAGE_KEY_ACTIVITIES = 'ba_strava_activities'
const STORAGE_KEY_LAST_SYNC = 'ba_strava_last_sync'

// Scoped storage helpers — each athlete gets their own keys
function scopedKey(base: string, athleteId?: string): string {
  return athleteId ? `${base}_${athleteId}` : base
}

// --- OAuth ---

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'activity:read_all',
    approval_prompt: 'auto',
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

export function getCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('code')
}

export async function exchangeToken(code: string): Promise<StravaTokens> {
  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const data = await res.json()
  const tokens: StravaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id ?? 0,
    athleteName: data.athlete?.firstname ?? 'Athlete',
  }
  saveTokens(tokens)
  return tokens
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  const tokens: StravaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id ?? getTokens()?.athleteId ?? 0,
    athleteName: data.athlete?.firstname ?? getTokens()?.athleteName ?? 'Athlete',
  }
  saveTokens(tokens)
  return tokens
}

// --- Token storage ---

export function saveTokens(tokens: StravaTokens, athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEY_TOKENS, athleteId), JSON.stringify(tokens))
}

export function getTokens(athleteId?: string): StravaTokens | null {
  const raw = localStorage.getItem(scopedKey(STORAGE_KEY_TOKENS, athleteId))
  if (!raw) return null
  return JSON.parse(raw) as StravaTokens
}

export function clearTokens(athleteId?: string): void {
  localStorage.removeItem(scopedKey(STORAGE_KEY_TOKENS, athleteId))
  localStorage.removeItem(scopedKey(STORAGE_KEY_ACTIVITIES, athleteId))
  localStorage.removeItem(scopedKey(STORAGE_KEY_LAST_SYNC, athleteId))
}

export function isTokenExpired(tokens: StravaTokens): boolean {
  return Date.now() / 1000 >= tokens.expiresAt - 60 // 1 min buffer
}

// --- Activity fetching ---

export async function fetchActivities(
  accessToken: string,
  after?: number,
): Promise<StravaActivity[]> {
  const allActivities: StravaActivity[] = []
  let page = 1
  const perPage = 50

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })
    if (after) params.set('after', String(after))

    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Strava API error: ${res.status}`)

    const activities: StravaActivity[] = await res.json()
    allActivities.push(...activities)

    if (activities.length < perPage) break
    page++
  }

  return allActivities
}

// --- Activity cache ---

export function getCachedActivities(athleteId?: string): StravaActivity[] {
  const raw = localStorage.getItem(scopedKey(STORAGE_KEY_ACTIVITIES, athleteId))
  if (!raw) return []
  return JSON.parse(raw) as StravaActivity[]
}

export function cacheActivities(activities: StravaActivity[], athleteId?: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEY_ACTIVITIES, athleteId), JSON.stringify(activities))
  localStorage.setItem(scopedKey(STORAGE_KEY_LAST_SYNC, athleteId), new Date().toISOString())
}

export function getLastSyncTime(athleteId?: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEY_LAST_SYNC, athleteId))
}

export function isStravaConfigured(): boolean {
  return Boolean(CLIENT_ID && TOKEN_EXCHANGE_URL)
}

// --- Activity streams (detailed HR, pace, etc.) ---

export interface StreamData {
  time: number[]
  heartrate: number[]
  distance: number[]
  altitude: number[]
  velocity: number[]
  cadence: number[]
}

const STORAGE_KEY_STREAMS = 'ba_strava_streams'

export async function fetchActivityStreams(
  accessToken: string,
  activityId: number,
): Promise<StreamData | null> {
  // Check cache first
  const cached = getCachedStream(activityId)
  if (cached) return cached

  const keys = 'time,heartrate,distance,altitude,velocity_smooth,cadence'
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${keys}&key_type=time`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return null

  const streams: { type: string; data: number[] }[] = await res.json()
  const data: StreamData = {
    time: findStream(streams, 'time'),
    heartrate: findStream(streams, 'heartrate'),
    distance: findStream(streams, 'distance'),
    altitude: findStream(streams, 'altitude'),
    velocity: findStream(streams, 'velocity_smooth'),
    cadence: findStream(streams, 'cadence'),
  }

  cacheStream(activityId, data)
  return data
}

function findStream(streams: { type: string; data: number[] }[], type: string): number[] {
  return streams.find(s => s.type === type)?.data || []
}

function getCachedStream(activityId: number): StreamData | null {
  const raw = localStorage.getItem(`${STORAGE_KEY_STREAMS}_${activityId}`)
  if (!raw) return null
  return JSON.parse(raw) as StreamData
}

function cacheStream(activityId: number, data: StreamData): void {
  localStorage.setItem(`${STORAGE_KEY_STREAMS}_${activityId}`, JSON.stringify(data))
}
