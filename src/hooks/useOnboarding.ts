import { useState, useCallback, useEffect } from 'react'
import type { DetailLevel } from '../types'
import { stampKey } from '../utils/syncStamps'

export type RaceType = 'trail' | 'road' | 'hyrox' | 'general'
// Goal for the General Fitness path (raceType === 'general'). Selects which
// preset re-weights the shared 4-pillar engine (Zone 2 / VO2max / strength /
// mobility). See docs/GENERAL_FITNESS_ENGINE_DESIGN.md.
export type GeneralGoal = 'stay_healthy' | 'lose_fat' | 'build_muscle' | 'build_endurance'
// Primary cardio modality for the General Fitness path (raceType === 'general').
// Personalizes the engine's cardio sessions (run vs bike vs row vs swim).
export type CardioModality = 'running' | 'cycling' | 'rowing' | 'swimming' | 'mixed'
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

// Biological sex — optional, asked on the profile step. Its one functional job
// today is to gate the menopause step: 'male' skips it outright, regardless of
// age. 'female', 'prefer_not_to_say', and leaving it unset all preserve the
// age-gated default (40+ sees the step). Kept distinct from the self-identifying
// menopauseStatus below — this only decides whether we ask, not the stage.
export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say'

// Midlife training stage across the menopause continuum (general context, all
// paths). Optional and self-identifying. Collected age-gated (40+) in
// onboarding, and skipped entirely when biological sex is 'male'. 'premenopause'
// captures women approaching the transition (build/bank the base before it).
// The two non-answers carry no coach personalization.
export type MenopauseStatus =
  | 'premenopause'
  | 'perimenopause'
  | 'menopause'
  | 'postmenopause'
  | 'not_applicable'
  | 'prefer_not_to_say'

// How much weight-training background the athlete has. Drives how aggressively
// we prescribe default strength loads — a brand-new lifter should not see the
// same numbers as a seasoned one.
export type StrengthExperience = 'new' | 'recreational' | 'experienced'

export type EquipmentAccess = 'track' | 'hills' | 'treadmill' | 'trails' | 'gym'

export type CrossTrainingMode = 'cycling' | 'swimming' | 'rowing' | 'hiking' | 'yoga'

export type TrainingTimeOfDay = 'early_am' | 'morning' | 'midday' | 'afternoon' | 'evening'

/** A second (or third…) race captured at onboarding — enough to place it
 *  on the season calendar; the season panel manages it from there. */
export interface AdditionalRace {
  name: string
  /** ISO YYYY-MM-DD. */
  date: string
  priority: 'A' | 'B' | 'C'
  distanceMiles?: number
  /** Free-text event details (format, goal, terrain — e.g. "Hyrox open,
   *  first one, goal is to finish strong"). Feeds the coach and the
   *  Hyrox-format detection, same as the main race's description. */
  description?: string
}

export interface OnboardingConfig {
  raceType: RaceType
  raceName: string
  raceDate: string
  // Free-text athlete narrative about the race/event/goal (terrain, elevation,
  // climate, context). Collected for ALL flows; required (10+ chars). The coach
  // reads this to tailor the plan and the welcome letter.
  raceDescription?: string
  // Free-text personal goal/target for the race/event (e.g. "sub-4:00", "just
  // finish"). Collected for all flows. The coach incorporates it into guidance.
  athleteGoal?: string
  // Optional explicit goal finish time (seconds) for road/trail races. When set
  // alongside a current fitness anchor, the plan engine progresses quality paces
  // from current fitness toward this goal across the build (goal-pace
  // personalization). Distinct from the free-text athleteGoal.
  goalRaceTimeSeconds?: number
  // Target race distance — required for trail/road races, omitted for hyrox/general.
  // Drives method selection via applicability.byDistance in the plan-generator engine.
  raceDistance?: RaceDistance
  // Total race vertical gain in feet (structured). Drives the climbing/descending
  // prescription (R1) when present; otherwise the engine falls back to parsing the
  // free-text raceDescription. Optional — flat/road races leave it unset.
  elevationGainFt?: number
  // Training method the user picked from the top-3 recommendation (e.g. 'daniels',
  // 'koop', 'roche_swap'). Only set for trail/road flows; hyrox/general skip
  // method selection and use the existing generateHyroxPlan path.
  selectedMethodId?: string
  // Goal for the General Fitness path (raceType === 'general'). Selects which
  // preset re-weights the shared 4-pillar engine. Omitted for trail/hyrox.
  generalGoal?: GeneralGoal
  // Primary cardio modality (general path only). Labels the engine's cardio
  // sessions; falls back to inferring from cross-training/equipment when unset.
  cardioModality?: CardioModality
  experienceLevel: ExperienceLevel
  trainingDaysPerWeek: number
  longRunDay?: string
  weakStation?: string
  wearable: WearableType
  athleteName: string
  age: number
  // Optional biological sex (profile step). Gates the menopause step: 'male'
  // skips it regardless of age; 'female'/'prefer_not_to_say'/unset keep the
  // 40+ default. See BiologicalSex above.
  sex?: BiologicalSex
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
  // Injury follow-ups — only collected when injuryStatus is 'returning' or
  // 'current'. They personalize the training ramp messaging and the coach's
  // greeting. All optional; absence just means a less specific message.
  injuryArea?: string
  injuryTimeframe?: string
  injuryNote?: string
  // Menopause context — optional midlife tailoring, collected age-gated (40+)
  // in onboarding and only when sex isn't 'male' (men skip the step). The
  // status self-identifies the stage; symptoms/note are only collected for a
  // real stage (pre/peri/meno/post) and personalize the coach's greeting +
  // snapshot. See src/utils/menopause.ts.
  menopauseStatus?: MenopauseStatus
  menopauseSymptoms?: string[]
  menopauseNote?: string
  // Weight-training background. Calibrates default strength loads at display
  // time (newer lifters see lighter prescriptions). Only collected when the
  // athlete asked for at least one strength day.
  strengthExperience?: StrengthExperience
  // Detail-level preset chosen at onboarding. Seeds useDisplayPreferences so the
  // whole app (and the coach) matches how much data/jargon the athlete wants.
  detailLevel?: DetailLevel
  // Multi-select: which terrain/equipment the athlete can train on.
  equipmentAccess?: EquipmentAccess[]
  // 0 = none. Drives whether plan includes strength sessions and how many.
  strengthDaysPerWeek?: number
  // Cross-training modalities the athlete enjoys / wants substituted on easy days.
  crossTrainingModes?: CrossTrainingMode[]
  // 0 = none. Drives how many cross-training sessions get scheduled per week.
  // If unset and `crossTrainingModes` is non-empty, falls back to 1 (legacy).
  crossTrainingDaysPerWeek?: number
  // When during the day the athlete typically trains (multi-select).
  preferredTrainingTimes?: TrainingTimeOfDay[]
  // Free-text: travel weeks, vacations, work crunch, deload windows, etc.
  scheduleConstraintsNote?: string
  // G1b — optional additional races captured at onboarding ("racing again
  // later this season?"). Seeded ONCE into the season calendar (useSeason);
  // add/remove afterward happens on the season panel, never re-seeded.
  additionalRaces?: AdditionalRace[]
  completedAt: string
  // Timestamp of when the post-onboarding methodology primer was dismissed.
  // Unset = primer should be shown the next time a plan is rendered.
  primerSeenAt?: string
  // Timestamp of when the post-methodology zones primer was dismissed. Shown
  // once after the methodology primer so the athlete sees their personalized
  // bpm ranges and the method-specific framing for each zone before they
  // start consuming workouts.
  zonesPrimerSeenAt?: string
  // Timestamp of when the post-onboarding "connect your devices" step was
  // dismissed (either by connecting or skipping). Unset = step should be
  // shown the next time the app loads after onboarding completes.
  connectStepSeenAt?: string
  // Timestamp of when the post-onboarding "power of the app" value-prop
  // screen was dismissed. Unset = screen should be shown once, before the
  // connect-your-devices step.
  valuePropsSeenAt?: string
  // Timestamp of when the post-onboarding "Letter from your Coach" was
  // dismissed. Unset = shown once at the end of onboarding.
  welcomeLetterSeenAt?: string
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

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  useEffect(() => {
    const cfgK = scopedKey(athleteId)
    const redoK = scopedRedoKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== cfgK && e.key !== redoK) return
      try {
        const raw = localStorage.getItem(cfgK)
        setConfig(raw ? JSON.parse(raw) : null)
        setRedoRequested(localStorage.getItem(redoK) === '1')
      } catch (err) {
        console.debug('[useOnboarding] storage-event reload failed:', err)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const save = useCallback((cfg: OnboardingConfig) => {
    const withTimestamp = { ...cfg, completedAt: new Date().toISOString() }
    const k = scopedKey(athleteId)
    const redoK = scopedRedoKey(athleteId)
    try {
      localStorage.setItem(k, JSON.stringify(withTimestamp))
      stampKey(k)
      localStorage.removeItem(redoK)
      // Tombstone the cleared redo flag so a stale server copy (a prior
      // redo that was never deleted server-side) can't be re-pulled by a
      // background sync and bounce the athlete back into onboarding right
      // after they finished. See hydrateFromServer's tombstone rule.
      stampKey(redoK)
    } catch { /* quota */ }
    setConfig(withTimestamp)
    setRedoRequested(false)
  }, [athleteId])

  const clear = useCallback(() => {
    const cfgK = scopedKey(athleteId)
    const redoK = scopedRedoKey(athleteId)
    try {
      localStorage.removeItem(cfgK)
      localStorage.removeItem(redoK)
      // Tombstone both keys so a background sync pull can't resurrect what
      // we just cleared (which would warp the athlete out of the flow).
      stampKey(cfgK)
      stampKey(redoK)
    } catch {}
    setConfig(null)
    setRedoRequested(false)
  }, [athleteId])

  const requestRedo = useCallback(() => {
    const redoK = scopedRedoKey(athleteId)
    const cfgK = scopedKey(athleteId)
    try {
      localStorage.setItem(redoK, '1')
      stampKey(redoK)
      localStorage.removeItem(cfgK)
      // The post-onboarding tutorial walkthrough is keyed by its own
      // localStorage flag (`ba_tutorial_seen_<athleteId>`), NOT the
      // onboarding config — so clearing the config alone leaves it marked
      // seen and an existing user refreshing their plan never re-sees the
      // walkthrough. Clear it too so the redo flow mirrors a fresh start.
      localStorage.removeItem(`ba_tutorial_seen_${athleteId}`)
      // Tombstone the cleared config. Without a stamp newer than the
      // server's copy, the 60s background sync (or a visibility-change
      // pull) would rewrite the previously-completed onboarding back into
      // localStorage, flip `isOnboarded` true, and unmount the in-progress
      // redo — warping the athlete back to their old plan mid-flow.
      stampKey(cfgK)
    } catch {}
    setConfig(null)
    setRedoRequested(true)
  }, [athleteId])

  const markPrimerSeen = useCallback(() => {
    setConfig(prev => {
      if (!prev || prev.primerSeenAt) return prev
      const next = { ...prev, primerSeenAt: new Date().toISOString() }
      const k = scopedKey(athleteId)
      try { localStorage.setItem(k, JSON.stringify(next)); stampKey(k) } catch { /* quota */ }
      return next
    })
  }, [athleteId])

  const markZonesPrimerSeen = useCallback(() => {
    setConfig(prev => {
      if (!prev || prev.zonesPrimerSeenAt) return prev
      const next = { ...prev, zonesPrimerSeenAt: new Date().toISOString() }
      const k = scopedKey(athleteId)
      try { localStorage.setItem(k, JSON.stringify(next)); stampKey(k) } catch { /* quota */ }
      return next
    })
  }, [athleteId])

  const markConnectStepSeen = useCallback(() => {
    setConfig(prev => {
      if (!prev || prev.connectStepSeenAt) return prev
      const next = { ...prev, connectStepSeenAt: new Date().toISOString() }
      const k = scopedKey(athleteId)
      try { localStorage.setItem(k, JSON.stringify(next)); stampKey(k) } catch { /* quota */ }
      return next
    })
  }, [athleteId])

  const markValuePropsSeen = useCallback(() => {
    setConfig(prev => {
      if (!prev || prev.valuePropsSeenAt) return prev
      const next = { ...prev, valuePropsSeenAt: new Date().toISOString() }
      const k = scopedKey(athleteId)
      try { localStorage.setItem(k, JSON.stringify(next)); stampKey(k) } catch { /* quota */ }
      return next
    })
  }, [athleteId])

  const markWelcomeLetterSeen = useCallback(() => {
    setConfig(prev => {
      if (!prev || prev.welcomeLetterSeenAt) return prev
      const next = { ...prev, welcomeLetterSeenAt: new Date().toISOString() }
      const k = scopedKey(athleteId)
      try { localStorage.setItem(k, JSON.stringify(next)); stampKey(k) } catch { /* quota */ }
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
    markZonesPrimerSeen,
    markConnectStepSeen,
    markValuePropsSeen,
    markWelcomeLetterSeen,
  }
}
