const AUTH_KEY = 'ba_auth_session'
const API_URL = import.meta.env.VITE_GARMIN_API_URL || ''

export interface AuthSession {
  athleteId: string
  email: string
  name: string
  token: string
  provider: 'google' | 'apple'
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_KEY)
}

export async function verifySession(session: AuthSession): Promise<boolean> {
  if (!API_URL) return true
  try {
    const res = await fetch(`${API_URL}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    })
    if (!res.ok) return false
    const data = await res.json()
    return data.valid === true
  } catch {
    return true
  }
}

export async function loginWithGoogle(credential: string): Promise<AuthSession> {
  if (!API_URL) {
    throw new Error('API URL not configured (VITE_GARMIN_API_URL missing)')
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
  } catch (e) {
    throw new Error(`Network error reaching ${API_URL}/api/auth/google: ${(e as Error).message}`)
  }
  let data: { authenticated?: boolean; athleteId?: string; email?: string; name?: string; token?: string; error?: string }
  try {
    data = await res.json()
  } catch {
    throw new Error(`Backend returned ${res.status} (non-JSON response)`)
  }
  if (!res.ok || !data.authenticated) {
    throw new Error(data.error || `Login failed (status ${res.status})`)
  }
  const session: AuthSession = {
    athleteId: data.athleteId!,
    email: data.email!,
    name: data.name || '',
    token: data.token!,
    provider: 'google',
  }
  saveSession(session)
  return session
}

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}
