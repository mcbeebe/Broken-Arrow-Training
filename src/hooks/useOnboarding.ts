import { useState, useCallback, useEffect } from 'react'

export type RaceType = 'trail' | 'hyrox' | 'general'
export type ExperienceLevel = 'first_timer' | 'beginner' | 'intermediate' | 'advanced' | 'elite'
export type StrengthExperience = 'none' | 'beginner' | 'intermediate' | 'advanced'

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

export type FitnessAnchorType =
  | 'race_5k'
  | 'race_10k'
  | 'race_hm'
  | 'race_marathon'
  | 'lthr'
  | 'easy_pace'
  | 'none'

export interface FitnessAnchor {
  type: FitnessAnchorType
  // Race / pace anchors store seconds; lthr stores bpm
  valueSeconds?: number
  bpm?: number
}

export type InjuryStatus = 'none' | 'returning' | 'current'

export type EquipmentAccess = 'track' | 'hills' | 'treadmill' | 'trails' | 'gym'

export type CrossTrainingMode = 'cycling' | 'swimming' | 'rowing' | 'hiking' | 'yoga'

export type TrainingTimeOfDay = 'early_am' | 'morning' | 'midday' | 'afternoon' | 'evening'

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
  // Objective fitness benchmark: recent race time, LTHR, or self-reported easy pace.
  // Drives pace/HR zone derivation for plan intensities.
  fitnessAnchor?: FitnessAnchor
  // Current weekly running mileage (miles). Used to cap volume ramp safely.
  currentWeeklyMileage?: number
  injuryStatus?: InjuryStatus
  // Multi-select: which terrain/equipment the athlete can train on.
  equipmentAccess?: EquipmentAccess[]
  // 0 = none. Drives whether plan includes strength sessions and how many.
  strengthDaysPerWeek?: number
  // Self-reported weight-lifting experience (separate from running experience).
  // Drives starting-weight prescriptions via a per-exercise body-weight ratio.
  strengthExperience?: StrengthExperience
  // Body weight in pounds. Drives load prescriptions for compound lifts
  // (Goblet Squat = 0.20 × BW, BB Back Squat = 0.65 × BW, etc.). Optional —
  // when missing we fall back to the exercise guide's static weight string.
  bodyWeightLb?: number
  // Cross-training modalities the athlete enjoys / wants substituted on easy days.
  crossTrainingModes?: CrossTrainingMode[]
  // When during the day the athlete typically trains (multi-select).
  preferredTrainingTimes?: TrainingTimeOfDay[]
  // Free-text: travel weeks, vacations, work crunch, deload windows, etc.
  scheduleConstraintsNote?: string
  completedAt: string
  // Timestamp of when the post-onboarding methodology primer was dismissed.
  // Unset = primer should be shown the next time a plan is rendered.
  primerSeenAt?: string
}

const STORAGE_KEY = 'ba_onboarding'
const REDO_KEY = 'ba_onboarding_redo'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function scopedRedoKey(athleteId?: string) {
  return athleteId ? `${REDO_KEY}_${athleteId}` : REDO_KEY
}

export function useOnboarding(athleteId?: string) {
  const [config, setConfig] = useState<OnboardingConfig | null>(() => {
    try {
      const raw = localStorage.getItem(scopedKey(athleteId))
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  // Set when the user explicitly chooses "Redo Onboarding" in Settings.
  // Forces the onboarding flow even for seed athletes (Mike, Jim, etc.)
  // whose hardcoded plan would otherwise short-circuit the redirect.
  // Cleared on save() — completing onboarding always wins.
  const [redoRequested, setRedoRequested] = useState<boolean>(() => {
    try {
      return localStorage.getItem(scopedRedoKey(athleteId)) === '1'
    } catch { return false }
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(scopedKey(athleteId))
      setConfig(raw ? JSON.parse(raw) : null)
      setRedoRequested(localStorage.getItem(scopedRedoKey(athleteId)) === '1')
    } catch {
      setConfig(null)
      setRedoRequested(false)
    }
  }, [athleteId])

  const save = useCallback((cfg: OnboardingConfig) => {
    const withTimestamp = { ...cfg, completedAt: new Date().toISOString() }
    try {
      localStorage.setItem(scopedKey(athleteId), JSON.stringify(withTimestamp))
      localStorage.removeItem(scopedRedoKey(athleteId))
    } catch { /* quota */ }
    setConfig(withTimestamp)
    setRedoRequested(false)
  }, [athleteId])

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(scopedKey(athleteId))
      localStorage.removeItem(scopedRedoKey(athleteId))
    } catch {}
    setConfig(null)
    setRedoRequested(false)
  }, [athleteId])

  const requestRedo = useCallback(() => {
    try {
      localStorage.setItem(scopedRedoKey(athleteId), '1')
      localStorage.removeItem(scopedKey(athleteId))
    } catch {}
    setConfig(null)
    setRedoRequested(true)
  }, [athleteId])

  const markPrimerSeen = useCallback(() => {
    setConfig(prev => {
      if (!prev || prev.primerSeenAt) return prev
      const next = { ...prev, primerSeenAt: new Date().toISOString() }
      try { localStorage.setItem(scopedKey(athleteId), JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [athleteId])

  return {
    config,
    isOnboarded: !!config,
    redoRequested,
    save,
    clear,
    requestRedo,
    markPrimerSeen,
  }
}
