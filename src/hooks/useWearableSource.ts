import { useState, useCallback, useEffect } from 'react'
import type { WearableSource } from '../types'

const KEY = 'ba_wearable_source'

function scopedKey(athleteId?: string) {
  return athleteId ? `${KEY}_${athleteId}` : KEY
}

export function useWearableSource(athleteId?: string) {
  const [source, setSourceState] = useState<WearableSource>(() => {
    const stored = localStorage.getItem(scopedKey(athleteId))
    if (stored === 'garmin' || stored === 'terra') return stored
    if (localStorage.getItem(athleteId ? `ba_garmin_connected_${athleteId}` : 'ba_garmin_connected') === 'true') return 'garmin'
    if (localStorage.getItem(athleteId ? `ba_terra_connected_${athleteId}` : 'ba_terra_connected') === 'true') return 'terra'
    return 'none'
  })

  useEffect(() => {
    const stored = localStorage.getItem(scopedKey(athleteId))
    if (stored === 'garmin' || stored === 'terra') {
      setSourceState(stored)
    } else if (localStorage.getItem(athleteId ? `ba_garmin_connected_${athleteId}` : 'ba_garmin_connected') === 'true') {
      setSourceState('garmin')
    } else if (localStorage.getItem(athleteId ? `ba_terra_connected_${athleteId}` : 'ba_terra_connected') === 'true') {
      setSourceState('terra')
    } else {
      setSourceState('none')
    }
  }, [athleteId])

  const setSource = useCallback((next: WearableSource) => {
    localStorage.setItem(scopedKey(athleteId), next)
    setSourceState(next)
  }, [athleteId])

  return { source, setSource }
}
