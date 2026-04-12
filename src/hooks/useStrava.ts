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

export function useStrava(): UseStravaReturn {
  const [tokens, setTokens] = useState<StravaTokens | null>(getTokens)
  const [activities, setActivities] = useState<StravaActivity[]>(getCachedActivities)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(getLastSyncTime)

  // Handle OAuth callback on mount
  useEffect(() => {
    const code = getCodeFromUrl()
    if (code) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
      handleCodeExchange(code)
    }
  }, [])

  async function handleCodeExchange(code: string) {
    setLoading(true)
    setError(null)
    try {
      const newTokens = await exchangeToken(code)
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

      // Fetch activities from training start date (Apr 13, 2026)
      const trainingStart = new Date('2026-04-13T00:00:00').getTime() / 1000
      const fetched = await fetchActivities(accessToken, trainingStart)
      setActivities(fetched)
      cacheActivities(fetched)
      setLastSync(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync activities')
    } finally {
      setLoading(false)
    }
  }, [tokens])

  // Auto-sync after connecting
  useEffect(() => {
    if (tokens && activities.length === 0) {
      sync()
    }
  }, [tokens])

  function connect() {
    window.location.href = getAuthUrl()
  }

  function disconnect() {
    clearTokens()
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
