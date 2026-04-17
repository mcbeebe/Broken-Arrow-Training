import { useState, useEffect, useCallback } from 'react'
import type { GarminHealthData, GarminActivity, GarminActivityDetail } from '../types'
import { localDateStr } from '../utils/format'
import {
  initTerraWidget,
  checkTerraConnection,
  disconnectTerra,
  fetchTerraHealth,
  fetchTerraActivities,
  fetchTerraActivityDetail,
  getCachedTerraHealth,
  cacheTerraHealth,
  mergeTerraHealth,
  getTerraLastSync,
  isTerraConnected,
  setTerraConnected,
  setTerraUserId,
  clearTerraData,
  isTerraConfigured,
  isSyncStale,
  getCachedTerraActivities,
  cacheTerraActivities,
  getCachedTerraActivityDetails,
  cacheTerraActivityDetails,
  getTerraDisplayName,
} from '../utils/terra'

export interface UseTerraReturn {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  healthData: GarminHealthData[]
  terraActivities: GarminActivity[]
  activityDetails: Record<string, GarminActivityDetail[]>
  lastSync: string | null
  displayName: string | null
  connect: () => Promise<void>
  disconnect: () => void
  sync: () => Promise<void>
}

export function useTerra(athleteId?: string): UseTerraReturn {
  const [connected, setConnected] = useState(() => isTerraConnected(athleteId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthData, setHealthData] = useState<GarminHealthData[]>(() => getCachedTerraHealth(athleteId))
  const [terraActivities, setTerraActivities] = useState<GarminActivity[]>(() => getCachedTerraActivities(athleteId))
  const [activityDetails, setActivityDetails] = useState<Record<string, GarminActivityDetail[]>>(() => getCachedTerraActivityDetails(athleteId))
  const [lastSync, setLastSync] = useState<string | null>(() => getTerraLastSync(athleteId))
  const [displayName, setDisplayName] = useState<string | null>(() => getTerraDisplayName(athleteId))

  const configured = isTerraConfigured()

  useEffect(() => {
    setConnected(isTerraConnected(athleteId))
    setHealthData(getCachedTerraHealth(athleteId))
    setTerraActivities(getCachedTerraActivities(athleteId))
    setActivityDetails(getCachedTerraActivityDetails(athleteId))
    setLastSync(getTerraLastSync(athleteId))
    setDisplayName(getTerraDisplayName(athleteId))
    setError(null)
  }, [athleteId])

  const fetchAllData = useCallback(async (days: number = 120) => {
    const data = await fetchTerraHealth(days, athleteId)
    const merged = mergeTerraHealth(healthData, data)
    cacheTerraHealth(merged, athleteId)
    setHealthData(merged)

    const today = localDateStr()
    const rangeStart = localDateStr(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000))
    const activities = await fetchTerraActivities(rangeStart, today, athleteId)
    cacheTerraActivities(activities, athleteId)
    setTerraActivities(activities)

    const detailCache = { ...getCachedTerraActivityDetails(athleteId) }
    const last7Dates: string[] = []
    for (let i = 0; i < 7; i++) {
      last7Dates.push(localDateStr(new Date(Date.now() - i * 24 * 60 * 60 * 1000)))
    }
    const datesWithActivities = last7Dates.filter(date =>
      activities.some(a => a.date === date),
    )
    const detailResults = await Promise.all(
      datesWithActivities.map(async date => {
        const details = await fetchTerraActivityDetail(date, athleteId)
        return { date, details }
      }),
    )
    for (const { date, details } of detailResults) {
      if (details.length > 0) detailCache[date] = details
    }
    cacheTerraActivityDetails(detailCache, athleteId)
    setActivityDetails(detailCache)
    setLastSync(new Date().toISOString())
  }, [healthData, athleteId])

  const connect = useCallback(async () => {
    if (!configured) {
      setError('Terra API URL not configured')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { widgetUrl, sessionId } = await initTerraWidget(athleteId)
      void sessionId

      // Open Terra widget in a popup window
      const popup = window.open(widgetUrl, 'terra-connect', 'width=500,height=700')

      // Poll for connection completion
      const pollInterval = setInterval(async () => {
        try {
          const status = await checkTerraConnection(athleteId)
          if (status.connected) {
            clearInterval(pollInterval)
            if (popup && !popup.closed) popup.close()
            if (status.userId) setTerraUserId(status.userId, athleteId)
            setTerraConnected(true, athleteId, status.displayName || 'Apple Health')
            setConnected(true)
            setDisplayName(status.displayName || 'Apple Health')
            await fetchAllData()
            setLoading(false)
          }
        } catch {
          // Keep polling
        }
      }, 2000)

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        if (loading) {
          setLoading(false)
          setError('Connection timed out. Please try again.')
        }
      }, 5 * 60 * 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setLoading(false)
    }
  }, [configured, athleteId, fetchAllData, loading])

  const disconnect = useCallback(() => {
    void disconnectTerra(athleteId)
    clearTerraData(athleteId)
    setConnected(false)
    setHealthData([])
    setTerraActivities([])
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
      await fetchAllData(days)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }, [configured, connected, healthData, fetchAllData])

  useEffect(() => {
    if (connected && configured && isSyncStale(athleteId, 5 * 60 * 1000)) {
      sync()
    }
  }, [connected, configured, athleteId, sync])

  return {
    connected,
    configured,
    loading,
    error,
    healthData,
    terraActivities,
    activityDetails,
    lastSync,
    displayName,
    connect,
    disconnect,
    sync,
  }
}
