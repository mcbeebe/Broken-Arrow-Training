import { useCallback, useEffect, useState } from 'react'
import type { AthleteProfile } from '../types'

/**
 * R7 — the editable structured-profile fields the athlete can set in Settings.
 * Stored separately from the plan's base `athlete` and merged over it in
 * App.tsx, so seed athletes (hardcoded plans) and generated plans both gain
 * the personalization without touching plan data.
 */
export type AthleteProfileExtras = Partial<
  Pick<
    AthleteProfile,
    'birthDate' | 'sex' | 'weightLb' | 'heightIn' | 'experienceLevel' | 'trainingAgeYears' | 'injuryHistory' | 'goals'
  >
>

function storageKey(athleteId?: string): string {
  return `ba_athlete_profile_${athleteId || 'default'}`
}

function readInitial(athleteId?: string): AthleteProfileExtras {
  try {
    const raw = localStorage.getItem(storageKey(athleteId))
    if (raw) return JSON.parse(raw) as AthleteProfileExtras
  } catch {
    /* malformed / unavailable — fall through to empty */
  }
  return {}
}

/** Drop empty/undefined keys so the coach directive only ever sees real data. */
function clean(next: AthleteProfileExtras): AthleteProfileExtras {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out as AthleteProfileExtras
}

export function useAthleteProfile(athleteId?: string) {
  const [profile, setProfile] = useState<AthleteProfileExtras>(() => readInitial(athleteId))

  // Re-read when the active athlete changes.
  useEffect(() => {
    setProfile(readInitial(athleteId))
  }, [athleteId])

  // Cross-tab sync.
  useEffect(() => {
    const k = storageKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key === k) setProfile(readInitial(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const save = useCallback(
    (next: AthleteProfileExtras) => {
      const cleaned = clean(next)
      try {
        localStorage.setItem(storageKey(athleteId), JSON.stringify(cleaned))
      } catch {
        /* quota — keep in-memory state anyway */
      }
      setProfile(cleaned)
    },
    [athleteId],
  )

  return { profile, save }
}
