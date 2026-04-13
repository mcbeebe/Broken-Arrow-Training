import { useState, useEffect, useCallback } from 'react'
import type { GarminHealthData, GarminActivity } from '../types'
import {
  checkGarminAuth,
  fetchHealthData,
  fetchGarminActivities,
  getCachedHealthData,
  cacheHealthData,
  mergeHealthData,
  getGarminLastSync,
  isGarminConnected,
  setGarminConnected,
  clearGarminData,
  isGarminConfigured,
  isSyncStale,
  getCachedGarminActivities,
  cacheGarminActivities,
} from '../utils/garmin'

export interface UseGarminReturn {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  healthData: GarminHealthData[]
  garminActivities: GarminActivity[]
  lastSync: string | null
  displayName: string | null
  connect: () => Promise<void>
  disconnect: () => void
  sync: () => Promise<void>
}

export function useGarmin(): UseGarminReturn {
  const [connected, setConnected] = useState(isGarminConnected())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthData, setHealthData] = useState<GarminHealthData[]>(getCachedHealthData())
  const [garminActivities, setGarminActivities] = useState<GarminActivity[]>(getCachedGarminActivities())
  const [lastSync, setLastSync] = useState<string | null>(getGarminLastSync())
  const [displayName, setDisplayName] = useState<string | null>(null)

  const configured = isGarminConfigured()

  const connect = useCallback(async () => {
    if (!configured) {
      setError('Garmin API URL not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await checkGarminAuth()
      if (result.authenticated) {
        setGarminConnected(true)
        setConnected(true)
        setDisplayName(result.displayName || null)

        // 30-day backfill on first connection
        const data = await fetchHealthData(30)
        const merged = mergeHealthData(healthData, data)
        cacheHealthData(merged)
        setHealthData(merged)
        setLastSync(new Date().toISOString())
      } else {
        setError(result.error || 'Authentication failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }, [configured, healthData])

  const disconnect = useCallback(() => {
    clearGarminData()
    setConnected(false)
    setHealthData([])
    setGarminActivities([])
    setLastSync(null)
    setDisplayName(null)
    setError(null)
  }, [])

  const sync = useCallback(async () => {
    if (!configured || !connected) return

    setLoading(true)
    setError(null)

    try {
      // Fetch last 7 days for incremental sync
      const days = healthData.length === 0 ? 30 : 7
      const data = await fetchHealthData(days)
      const merged = mergeHealthData(healthData, data)
      cacheHealthData(merged)
      setHealthData(merged)

      // Fetch Garmin activities for supplement (last 30 days)
      const today = new Date().toISOString().slice(0, 10)
      const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const activities = await fetchGarminActivities(thirtyAgo, today)
      cacheGarminActivities(activities)
      setGarminActivities(activities)

      setLastSync(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }, [configured, connected, healthData])

  // Auto-sync on mount if stale
  useEffect(() => {
    if (connected && configured && isSyncStale()) {
      sync()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connected,
    configured,
    loading,
    error,
    healthData,
    garminActivities,
    lastSync,
    displayName,
    connect,
    disconnect,
    sync,
  }
}
