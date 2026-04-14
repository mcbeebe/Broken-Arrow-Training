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

export function useGarmin(athleteId?: string, garminOwner?: string): UseGarminReturn {
  // Gate: only the profile that owns the Garmin account can access Garmin data.
  // This prevents Mike's Garmin data from leaking into Jim/Lori/Joel's profiles.
  const isOwner = !garminOwner || athleteId === garminOwner

  const [connected, setConnected] = useState(() => isOwner ? isGarminConnected(athleteId) : false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthData, setHealthData] = useState<GarminHealthData[]>(() => isOwner ? getCachedHealthData(athleteId) : [])
  const [garminActivities, setGarminActivities] = useState<GarminActivity[]>(() => isOwner ? getCachedGarminActivities(athleteId) : [])
  const [activityDetails, setActivityDetails] = useState<Record<string, GarminActivityDetail[]>>(() => isOwner ? getCachedActivityDetails(athleteId) : {})
  const [lastSync, setLastSync] = useState<string | null>(() => isOwner ? getGarminLastSync(athleteId) : null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  const configured = isGarminConfigured()

  // Re-load from storage when athleteId changes (only if this profile owns Garmin)
  useEffect(() => {
    if (!isOwner) {
      // Not this profile's Garmin — clear any accidentally cached data and return empty state
      clearGarminData(athleteId)
      setConnected(false)
      setHealthData([])
      setGarminActivities([])
      setActivityDetails({})
      setLastSync(null)
      setError(null)
      return
    }
    setConnected(isGarminConnected(athleteId))
    setHealthData(getCachedHealthData(athleteId))
    setGarminActivities(getCachedGarminActivities(athleteId))
    setActivityDetails(getCachedActivityDetails(athleteId))
    setLastSync(getGarminLastSync(athleteId))
    setError(null)
  }, [athleteId, isOwner])

  const connect = useCallback(async () => {
    if (!isOwner) {
      setError('Garmin is connected on another profile')
      return
    }
    if (!configured) {
      setError('Garmin API URL not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await checkGarminAuth()
      if (result.authenticated) {
        setGarminConnected(true, athleteId)
        setConnected(true)
        setDisplayName(result.displayName || null)

        const data = await fetchHealthData(120)
        const merged = mergeHealthData(healthData, data)
        cacheHealthData(merged, athleteId)
        setHealthData(merged)

        const today = localDateStr()
        const thirtyAgo = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
        const activities = await fetchGarminActivities(thirtyAgo, today)
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
            const details = await fetchActivityDetail(date)
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
  }, [configured, healthData, athleteId, isOwner])

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
    if (!isOwner || !configured || !connected) return

    setLoading(true)
    setError(null)

    try {
      const days = healthData.length === 0 ? 120 : 7
      const data = await fetchHealthData(days)
      const merged = mergeHealthData(healthData, data)
      cacheHealthData(merged, athleteId)
      setHealthData(merged)

      const today = localDateStr()
      const thirtyAgo = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
      const activities = await fetchGarminActivities(thirtyAgo, today)
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
          const details = await fetchActivityDetail(date)
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
  }, [configured, connected, healthData, athleteId, isOwner])

  // Auto-sync on mount if stale (only for Garmin owner profile)
  useEffect(() => {
    if (isOwner && connected && configured && isSyncStale(athleteId)) {
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
