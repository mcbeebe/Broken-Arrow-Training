import { useState, useCallback, useEffect } from 'react'

export type RaceType = 'trail' | 'hyrox' | 'general'
export type ExperienceLevel = 'first_timer' | 'beginner' | 'intermediate' | 'advanced' | 'elite'

export type WearableType = 'garmin' | 'apple_watch' | 'oura' | 'none'

export interface OnboardingConfig {
  raceType: RaceType
  raceName: string
  raceDate: string
  experienceLevel: ExperienceLevel
  trainingDaysPerWeek: number
  longRunDay?: string
  weakStation?: string
  wearable: WearableType
  athleteName: string
  age: number
  maxHR?: number
  // Optional cycling FTP (watts). Drives the cycling MIM intensity factor
  // when an activity has power-meter data; HR-reserve falls back when absent.
  ftpWatts?: number
  completedAt: string
}

const STORAGE_KEY = 'ba_onboarding'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

export function useOnboarding(athleteId?: string) {
  const [config, setConfig] = useState<OnboardingConfig | null>(() => {
    try {
      const raw = localStorage.getItem(scopedKey(athleteId))
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(scopedKey(athleteId))
      setConfig(raw ? JSON.parse(raw) : null)
    } catch { setConfig(null) }
  }, [athleteId])

  const save = useCallback((cfg: OnboardingConfig) => {
    const withTimestamp = { ...cfg, completedAt: new Date().toISOString() }
    try {
      localStorage.setItem(scopedKey(athleteId), JSON.stringify(withTimestamp))
    } catch { /* quota */ }
    setConfig(withTimestamp)
  }, [athleteId])

  const clear = useCallback(() => {
    try { localStorage.removeItem(scopedKey(athleteId)) } catch {}
    setConfig(null)
  }, [athleteId])

  return {
    config,
    isOnboarded: !!config,
    save,
    clear,
  }
}
