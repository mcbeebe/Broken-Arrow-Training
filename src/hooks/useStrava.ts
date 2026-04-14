import { useState, useEffect, useCallback } from 'react'
import type { StravaTokens, StravaActivity } from '../types'
import {
  getTokens,
  clearTokens,
  isTokenExpired,
  refreshAccessToken,
  exchangeToken,
  getCodeFromUrl,
  fetchActivities,
  getCachedActivities,
  cacheActivities,
  getLastSyncTime,
  getAuthUrl,
  isStravaConfigured,
  saveTokens,
} from '../utils/strava'

interface UseStravaReturn {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  athleteName: string | null
  activities: StravaActivity[]
  lastSync: string | null
  connect: () => void
  disconnect: () => void
  sync: () => Promise<void>
}

export function useStrava(athleteId?: string): UseStravaReturn {
  const [tokens, setTokens] = useState<StravaTokens | null>(() => getTokens(athleteId))
  const [activities, setActivities] = useState<StravaActivity[]>(() => getCachedActivities(athleteId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(() => getLastSyncTime(athleteId))

  // Re-load from storage when athleteId changes
  useEffect(() => {
    setTokens(getTokens(athleteId))
    setActivities(getCachedActivities(athleteId))
    setLastSync(getLastSyncTime(athleteId))
    setError(null)
  }, [athleteId])

  // Handle OAuth callback on mount
  useEffect(() => {
    const code = getCodeFromUrl()
    if (code) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      handleCodeExchange(code)
    }
  }, [])

  async function handleCodeExchange(code: string) {
    setLoading(true)
    setError(null)
    try {
      const newTokens = await exchangeToken(code)
      saveTokens(newTokens, athleteId)
      setTokens(newTokens)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token exchange failed')
    } finally {
      setLoading(false)
    }
  }

  async function getValidToken(): Promise<string | null> {
    if (!tokens) return null
    if (!isTokenExpired(tokens)) return tokens.accessToken

    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken)
      saveTokens(refreshed, athleteId)
      setTokens(refreshed)
      return refreshed.accessToken
    } catch {
      setError('Session expired. Please reconnect Strava.')
      disconnect()
      return null
    }
  }

  const sync = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const accessToken = await getValidToken()
      if (!accessToken) return

      const trainingStart = new Date('2026-04-12T00:00:00').getTime() / 1000
      const fetched = await fetchActivities(accessToken, trainingStart)
      setActivities(fetched)
      cacheActivities(fetched, athleteId)
      setLastSync(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync activities')
    } finally {
      setLoading(false)
    }
  }, [tokens, athleteId])

  useEffect(() => {
    if (tokens && activities.length === 0) {
      sync()
    }
  }, [tokens])

  function connect() {
    window.location.href = getAuthUrl()
  }

  function disconnect() {
    clearTokens(athleteId)
    setTokens(null)
    setActivities([])
    setLastSync(null)
    setError(null)
  }

  return {
    connected: tokens !== null,
    configured: isStravaConfigured(),
    loading,
    error,
    athleteName: tokens?.athleteName ?? null,
    activities,
    lastSync,
    connect,
    disconnect,
    sync,
  }
}
