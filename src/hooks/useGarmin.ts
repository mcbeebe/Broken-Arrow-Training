import { useState, useEffect, useCallback } from 'react'
import type { GarminHealthData, GarminActivity, GarminActivityDetail } from '../types'
import { localDateStr } from '../utils/format'
import {
  checkGarminAuth,
  fetchHealthData,
  fetchGarminActivities,
  fetchActivityDetail,
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
  getCachedActivityDetails,
  cacheActivityDetails,
  getGarminDisplayName,
} from '../utils/garmin'

export interface UseGarminReturn {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  healthData: GarminHealthData[]
  garminActivities: GarminActivity[]
  activityDetails: Record<string, GarminActivityDetail[]>
  lastSync: string | null
  displayName: string | null
  connect: () => Promise<void>
  disconnect: () => void
  sync: () => Promise<void>
}

export function useGarmin(athleteId?: string): UseGarminReturn {
  const [connected, setConnected] = useState(() => isGarminConnected(athleteId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthData, setHealthData] = useState<GarminHealthData[]>(() => getCachedHealthData(athleteId))
  const [garminActivities, setGarminActivities] = useState<GarminActivity[]>(() => getCachedGarminActivities(athleteId))
  const [activityDetails, setActivityDetails] = useState<Record<string, GarminActivityDetail[]>>(() => getCachedActivityDetails(athleteId))
  const [lastSync, setLastSync] = useState<string | null>(() => getGarminLastSync(athleteId))
  const [displayName, setDisplayName] = useState<string | null>(() => getGarminDisplayName(athleteId))

  const configured = isGarminConfigured()

  // Re-load from storage when athleteId changes
  useEffect(() => {
    const wasConnected = isGarminConnected(athleteId)
    const storedName = getGarminDisplayName(athleteId)

    // Migration: if connected but no displayName, this is stale data from
    // before per-athlete Garmin support. Clear it so it doesn't auto-sync
    // someone else's Garmin data into this profile.
    if (wasConnected && !storedName) {
      clearGarminData(athleteId)
      setConnected(false)
      setHealthData([])
      setGarminActivities([])
      setActivityDetails({})
      setLastSync(null)
      setDisplayName(null)
      setError(null)
      return
    }

    setConnected(wasConnected)
    setHealthData(getCachedHealthData(athleteId))
    setGarminActivities(getCachedGarminActivities(athleteId))
    setActivityDetails(getCachedActivityDetails(athleteId))
    setLastSync(getGarminLastSync(athleteId))
    setDisplayName(storedName)
    setError(null)
  }, [athleteId])

  const connect = useCallback(async () => {
    if (!configured) {
      setError('Garmin API URL not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await checkGarminAuth(athleteId)
      if (result.authenticated) {
        const name = result.displayName || null
        setGarminConnected(true, athleteId, name || undefined)
        setConnected(true)
        setDisplayName(name)

        const data = await fetchHealthData(120, athleteId)
        const merged = mergeHealthData(healthData, data)
        cacheHealthData(merged, athleteId)
        setHealthData(merged)

        const today = localDateStr()
        const thirtyAgo = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
        const activities = await fetchGarminActivities(thirtyAgo, today, athleteId)
        cacheGarminActivities(activities, athleteId)
        setGarminActivities(activities)

        const detailCache = { ...getCachedActivityDetails(athleteId) }
        const last7Dates: string[] = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
          last7Dates.push(localDateStr(d))
        }
        const datesWithActivities = last7Dates.filter(date =>
          activities.some(a => a.date === date)
        )
        const detailResults = await Promise.all(
          datesWithActivities.map(async date => {
            const details = await fetchActivityDetail(date, athleteId)
            return { date, details }
          })
        )
        for (const { date, details } of detailResults) {
          if (details.length > 0) detailCache[date] = details
        }
        cacheActivityDetails(detailCache, athleteId)
        setActivityDetails(detailCache)

        setLastSync(new Date().toISOString())
      } else {
        setError(result.error || 'Authentication failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }, [configured, healthData, athleteId])

  const disconnect = useCallback(() => {
    clearGarminData(athleteId)
    setConnected(false)
    setHealthData([])
    setGarminActivities([])
    setActivityDetails({})
    setLastSync(null)
    setDisplayName(null)
    setError(null)
  }, [athleteId])

  const sync = useCallback(async () => {
    if (!configured || !connected) return

    setLoading(true)
    setError(null)

    try {
      const days = healthData.length === 0 ? 120 : 7
      const data = await fetchHealthData(days, athleteId)
      const merged = mergeHealthData(healthData, data)
      cacheHealthData(merged, athleteId)
      setHealthData(merged)

      const today = localDateStr()
      const thirtyAgo = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
      const activities = await fetchGarminActivities(thirtyAgo, today, athleteId)
      cacheGarminActivities(activities, athleteId)
      setGarminActivities(activities)

      const detailCache = { ...getCachedActivityDetails(athleteId) }
      const last7Dates: string[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        last7Dates.push(localDateStr(d))
      }
      const datesWithActivities = last7Dates.filter(date =>
        activities.some(a => a.date === date)
      )
      const detailResults = await Promise.all(
        datesWithActivities.map(async date => {
          const details = await fetchActivityDetail(date, athleteId)
          return { date, details }
        })
      )
      for (const { date, details } of detailResults) {
        if (details.length > 0) detailCache[date] = details
      }
      cacheActivityDetails(detailCache, athleteId)
      setActivityDetails(detailCache)

      setLastSync(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }, [configured, connected, healthData, athleteId])

  // Auto-sync on mount if stale
  useEffect(() => {
    if (connected && configured && isSyncStale(athleteId)) {
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
    activityDetails,
    lastSync,
    displayName,
    connect,
    disconnect,
    sync,
  }
}
