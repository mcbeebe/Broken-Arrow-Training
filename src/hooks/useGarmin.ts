import { useState, useEffect, useCallback } from 'react'
import type { GarminHealthData, GarminActivity, GarminActivityDetail } from '../types'
import { localDateStr } from '../utils/format'
import {
  checkGarminAuth,
  disconnectGarmin,
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
  mergeGarminActivities,
  getCachedActivityDetails,
  cacheActivityDetails,
  getGarminDisplayName,
  GarminAuthError,
} from '../utils/garmin'

export interface UseGarminReturn {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  mfaRequired: boolean
  healthData: GarminHealthData[]
  garminActivities: GarminActivity[]
  activityDetails: Record<string, GarminActivityDetail[]>
  lastSync: string | null
  displayName: string | null
  connect: (email: string, password: string) => Promise<void>
  submitMfa: (code: string) => Promise<void>
  disconnect: () => void
  sync: () => Promise<void>
}

export function useGarmin(athleteId?: string): UseGarminReturn {
  const [connected, setConnected] = useState(() => isGarminConnected(athleteId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null)
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
    // before per-athlete Garmin support. Clear it (frontend + backend KV).
    if (wasConnected && !storedName) {
      void disconnectGarmin(athleteId)
      clearGarminData(athleteId)
      setConnected(false)
      setHealthData([])
      setGarminActivities([])
      setActivityDetails({})
      setLastSync(null)
      setDisplayName(null)
      setError(null)
      setMfaRequired(false)
      setPendingCredentials(null)
      return
    }

    setConnected(wasConnected)
    setHealthData(getCachedHealthData(athleteId))
    setGarminActivities(getCachedGarminActivities(athleteId))
    setActivityDetails(getCachedActivityDetails(athleteId))
    setLastSync(getGarminLastSync(athleteId))
    setDisplayName(storedName)
    setError(null)
    setMfaRequired(false)
    setPendingCredentials(null)
  }, [athleteId])

  /** Fetch and cache all health + activity data after successful auth */
  const fetchAllData = useCallback(async () => {
    const data = await fetchHealthData(120, athleteId)
    const merged = mergeHealthData(healthData, data)
    cacheHealthData(merged, athleteId)
    setHealthData(merged)

    const today = localDateStr()
    const historyStart = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
    const fetched = await fetchGarminActivities(historyStart, today, athleteId)
    const activities = mergeGarminActivities(getCachedGarminActivities(athleteId), fetched)
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
  }, [healthData, athleteId])

  /** Handle successful authentication */
  const handleAuthSuccess = useCallback(async (name: string | null) => {
    setGarminConnected(true, athleteId, name || undefined)
    setConnected(true)
    setDisplayName(name)
    setMfaRequired(false)
    setPendingCredentials(null)
    await fetchAllData()
  }, [athleteId, fetchAllData])

  /** Step 1: Connect with email + password (may trigger MFA) */
  const connect = useCallback(async (email: string, password: string) => {
    if (!configured) {
      setError('Garmin API URL not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await checkGarminAuth(athleteId, { email, password })

      if (result.authenticated) {
        await handleAuthSuccess(result.displayName || null)
      } else if (result.mfa_required) {
        // Garmin sent MFA code — save credentials for step 2
        setPendingCredentials({ email, password })
        setMfaRequired(true)
      } else {
        setError(result.error || 'Authentication failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }, [configured, athleteId, handleAuthSuccess])

  /** Step 2: Submit MFA verification code */
  const submitMfa = useCallback(async (code: string) => {
    if (!pendingCredentials) {
      setError('No pending authentication — please start over')
      setMfaRequired(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await checkGarminAuth(athleteId, {
        ...pendingCredentials,
        mfa_code: code,
      })

      if (result.authenticated) {
        await handleAuthSuccess(result.displayName || null)
      } else {
        setError(result.error || 'MFA verification failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed')
    } finally {
      setLoading(false)
    }
  }, [athleteId, pendingCredentials, handleAuthSuccess])

  const disconnect = useCallback(() => {
    // Fire-and-forget: wipe backend KV session so next "Connect" can't
    // silently restore someone else's token saved under this athleteId.
    void disconnectGarmin(athleteId)
    clearGarminData(athleteId)
    setConnected(false)
    setHealthData([])
    setGarminActivities([])
    setActivityDetails({})
    setLastSync(null)
    setDisplayName(null)
    setError(null)
    setMfaRequired(false)
    setPendingCredentials(null)
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
      const historyStart = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
      const fetched = await fetchGarminActivities(historyStart, today, athleteId)
      const activities = mergeGarminActivities(getCachedGarminActivities(athleteId), fetched)
      cacheGarminActivities(activities, athleteId)
      setGarminActivities(activities)

      const detailCache = { ...getCachedActivityDetails(athleteId) }
      // Fetch details for dates that have activities but no cached details,
      // plus the last 7 days. This covers older dates that were cleared
      // from cache or never fetched (e.g., elliptical without HR).
      const datesToFetch = new Set<string>()
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        datesToFetch.add(localDateStr(d))
      }
      for (const a of activities) {
        if (a.date && !detailCache[a.date]) datesToFetch.add(a.date)
      }
      const datesWithActivities = [...datesToFetch].filter(date =>
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
      if (err instanceof GarminAuthError) {
        // Session expired — flip back to the disconnected state so the UI
        // shows the reconnect form. Cached health/activity data is kept so
        // the athlete still sees their last readiness while reconnecting.
        setGarminConnected(false, athleteId)
        setConnected(false)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Sync failed')
      }
    } finally {
      setLoading(false)
    }
  }, [configured, connected, healthData, athleteId])

  // Auto-sync on app open if data is more than 10 minutes old.
  useEffect(() => {
    if (connected && configured && isSyncStale(athleteId, 10 * 60 * 1000)) {
      sync()
    }
  }, [connected, configured, athleteId, sync])

  return {
    connected,
    configured,
    loading,
    error,
    mfaRequired,
    healthData,
    garminActivities,
    activityDetails,
    lastSync,
    displayName,
    connect,
    submitMfa,
    disconnect,
    sync,
  }
}
