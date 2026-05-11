import { useState, useCallback, useEffect } from 'react'

export type RaceType = 'trail' | 'hyrox' | 'general'
export type ExperienceLevel = 'first_timer' | 'beginner' | 'intermediate' | 'advanced' | 'elite'

export type WearableType = 'garmin' | 'apple_watch' | 'oura' | 'none'

export type RaceDistance =
  | '5k'
  | '10k'
  | 'half_marathon'
  | 'marathon'
  | '50k'
  | '50_mile'
  | '100k'
  | '100_mile'
  | 'mountain_ultra'

export interface OnboardingConfig {
  raceType: RaceType
  raceName: string
  raceDate: string
  // Target race distance — required for trail/road races, omitted for hyrox/general.
  // Drives method selection via applicability.byDistance in the plan-generator engine.
  raceDistance?: RaceDistance
  // Training method the user picked from the top-3 recommendation (e.g. 'daniels',
  // 'koop', 'roche_swap'). Only set for trail/road flows; hyrox/general skip
  // method selection and use the existing generateHyroxPlan path.
  selectedMethodId?: string
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
