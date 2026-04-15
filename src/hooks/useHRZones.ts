import { useState, useEffect, useCallback } from 'react'
import type { HRZone } from '../types'

const STORAGE_KEY = 'ba_hr_zones_override'

function scopedKey(athleteId?: string): string {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

/**
 * Per-athlete HR zone override. When set, overrides the plan's default zones
 * everywhere zones are consumed (DayCard display, grading, HR chart reference
 * lines, zone tab). Persists to localStorage.
 */
export function useHRZones(athleteId: string | undefined, defaultZones: HRZone[]) {
  const [override, setOverride] = useState<HRZone[] | null>(() => loadOverride(athleteId))

  useEffect(() => {
    setOverride(loadOverride(athleteId))
  }, [athleteId])

  const save = useCallback((zones: HRZone[]) => {
    localStorage.setItem(scopedKey(athleteId), JSON.stringify(zones))
    setOverride(zones)
  }, [athleteId])

  const reset = useCallback(() => {
    localStorage.removeItem(scopedKey(athleteId))
    setOverride(null)
  }, [athleteId])

  const zones = override ?? defaultZones
  const isCustomized = override !== null

  return { zones, isCustomized, save, reset }
}

function loadOverride(athleteId: string | undefined): HRZone[] | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return null
    return JSON.parse(raw) as HRZone[]
  } catch {
    return null
  }
}
