import type { StravaTokens, StravaActivity } from '../types'

// Strava OAuth config — set VITE_STRAVA_CLIENT_ID in .env
const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || ''
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI ||
  `${window.location.origin}${import.meta.env.BASE_URL}`
const TOKEN_EXCHANGE_URL = import.meta.env.VITE_STRAVA_TOKEN_EXCHANGE_URL || ''

const STORAGE_KEY_TOKENS = 'ba_strava_tokens'
const STORAGE_KEY_ACTIVITIES = 'ba_strava_activities'
const STORAGE_KEY_LAST_SYNC = 'ba_strava_last_sync'

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

export function saveTokens(tokens: StravaTokens): void {
  localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens))
}

export function getTokens(): StravaTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY_TOKENS)
  if (!raw) return null
  return JSON.parse(raw) as StravaTokens
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY_TOKENS)
  localStorage.removeItem(STORAGE_KEY_ACTIVITIES)
  localStorage.removeItem(STORAGE_KEY_LAST_SYNC)
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

export function getCachedActivities(): StravaActivity[] {
  const raw = localStorage.getItem(STORAGE_KEY_ACTIVITIES)
  if (!raw) return []
  return JSON.parse(raw) as StravaActivity[]
}

export function cacheActivities(activities: StravaActivity[]): void {
  localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(activities))
  localStorage.setItem(STORAGE_KEY_LAST_SYNC, new Date().toISOString())
}

export function getLastSyncTime(): string | null {
  return localStorage.getItem(STORAGE_KEY_LAST_SYNC)
}

export function isStravaConfigured(): boolean {
  return Boolean(CLIENT_ID && TOKEN_EXCHANGE_URL)
}
