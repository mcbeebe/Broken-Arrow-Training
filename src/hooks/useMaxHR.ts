import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'ba_max_hr_override'

function scopedKey(athleteId?: string): string {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

export function useMaxHR(athleteId: string | undefined, defaultMaxHR: number) {
  const [override, setOverride] = useState<number | null>(() => loadOverride(athleteId))

  useEffect(() => {
    setOverride(loadOverride(athleteId))
  }, [athleteId])

  const save = useCallback((value: number) => {
    localStorage.setItem(scopedKey(athleteId), String(value))
    setOverride(value)
  }, [athleteId])

  const reset = useCallback(() => {
    localStorage.removeItem(scopedKey(athleteId))
    setOverride(null)
  }, [athleteId])

  const maxHR = override ?? defaultMaxHR
  const isCustomized = override !== null

  return { maxHR, isCustomized, save, reset }
}

function loadOverride(athleteId: string | undefined): number | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return null
    const n = parseInt(raw, 10)
    if (isNaN(n) || n < 100 || n > 230) return null
    return n
  } catch {
    return null
  }
}
