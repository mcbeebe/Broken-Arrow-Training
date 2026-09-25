import { useState, useEffect, useCallback } from 'react'
import type { GarminHealthData, GarminActivity, GarminActivityDetail } from '../types'
import { localDateStr } from '../utils/format'
import { STORAGE_FULL_MESSAGE, isQuotaError } from '../utils/storageRoom'
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
  /** Server-supplied guidance for the code screen — how the code arrives,
   *  or that a fresh one has just been sent. Distinct from `error`. */
  mfaNotice: string | null
  healthData: GarminHealthData[]
  garminActivities: GarminActivity[]
  activityDetails: Record<string, GarminActivityDetail[]>
  lastSync: string | null
  displayName: string | null
  connect: (email: string, password: string) => Promise<void>
  submitMfa: (code: string) => Promise<void>
  /** Ask Garmin for a fresh code, explicitly. The only way a second
   *  challenge is ever issued while one is pending. */
  resendMfa: () => Promise<void>
  disconnect: () => void
  sync: () => Promise<void>
  /** Force-refetch one date's activity details from the server,
   *  overwrite the local cache, and return what came back — the
   *  self-healing path for a stale or incomplete cached day. */
  refreshDetailsForDate: (date: string) => Promise<GarminActivityDetail[]>
}

export function useGarmin(athleteId?: string): UseGarminReturn {
  const [connected, setConnected] = useState(() => isGarminConnected(athleteId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaNotice, setMfaNotice] = useState<string | null>(null)
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
      setMfaNotice(null)
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
    setMfaNotice(null)
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
    setMfaNotice(null)
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
        // Garmin wants a code. The sign-in that asked for it is parked on
        // the server; step 2 resumes it. Keep the credentials: if that
        // parked sign-in is lost, the server needs them to start another.
        setPendingCredentials({ email, password })
        setMfaRequired(true)
        setMfaNotice(result.message ?? null)
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
      } else if (result.mfa_required) {
        // Still on the code screen. Either Garmin rejected this code (the
        // parked sign-in survives — try again), or that sign-in was gone
        // and the server has issued a fresh code: say which.
        if (result.code_resent) {
          setMfaNotice(result.message ?? 'Garmin has sent a new code. Enter the newest one you received.')
          setError(null)
        } else {
          setError(result.error || 'Garmin did not accept that code.')
        }
      } else {
        setError(result.error || 'MFA verification failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed')
    } finally {
      setLoading(false)
    }
  }, [athleteId, pendingCredentials, handleAuthSuccess])

  /** Explicitly ask Garmin for a fresh code. */
  const resendMfa = useCallback(async () => {
    if (!pendingCredentials) {
      setError('No pending authentication — please start over')
      setMfaRequired(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await checkGarminAuth(athleteId, { ...pendingCredentials, resend: true })
      if (result.authenticated) {
        await handleAuthSuccess(result.displayName || null)
      } else if (result.mfa_required) {
        setMfaNotice(result.message ?? 'Garmin has sent a new code.')
      } else {
        setError(result.error || 'Could not request a new code')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a new code')
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
    setMfaNotice(null)
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
      // A save that can't fit on the phone never stops the sync: the app
      // still gets the new data; only the phone copy is skipped.
      let savedOnPhone = cacheHealthData(merged, athleteId)
      setHealthData(merged)

      const today = localDateStr()
      const historyStart = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
      const fetched = await fetchGarminActivities(historyStart, today, athleteId)
      const activities = mergeGarminActivities(getCachedGarminActivities(athleteId), fetched)
      savedOnPhone = cacheGarminActivities(activities, athleteId) && savedOnPhone
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
      savedOnPhone = cacheActivityDetails(detailCache, athleteId) && savedOnPhone
      setActivityDetails(detailCache)

      setLastSync(new Date().toISOString())
      if (!savedOnPhone) setError(STORAGE_FULL_MESSAGE)
    } catch (err) {
      if (err instanceof GarminAuthError) {
        // Session expired — flip back to the disconnected state so the UI
        // shows the reconnect form. Cached health/activity data is kept so
        // the athlete still sees their last readiness while reconnecting.
        setGarminConnected(false, athleteId)
        setConnected(false)
        setError(err.message)
      } else {
        // Safari's own "The quota has been exceeded." is no use to anyone.
        setError(isQuotaError(err) ? STORAGE_FULL_MESSAGE : err instanceof Error ? err.message : 'Sync failed')
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

  const refreshDetailsForDate = useCallback(async (date: string) => {
    const details = await fetchActivityDetail(date, athleteId)
    const cache = { ...getCachedActivityDetails(athleteId) }
    if (details.length > 0) cache[date] = details
    else delete cache[date]
    cacheActivityDetails(cache, athleteId)
    setActivityDetails(cache)
    return details
  }, [athleteId])

  return {
    connected,
    configured,
    loading,
    error,
    mfaRequired,
    mfaNotice,
    healthData,
    garminActivities,
    activityDetails,
    lastSync,
    displayName,
    connect,
    submitMfa,
    resendMfa,
    disconnect,
    sync,
    refreshDetailsForDate,
  }
}
