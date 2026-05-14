import { useCallback, useEffect, useState } from 'react'

// Plain-English Mode toggle.
//
// Default: false → metric labels render as "Fitness / Fatigue / Form …".
// When true: labels switch to CTL / ATL / TSB / etc. for power users.
//
// Stored per-athlete in localStorage to mirror the per-athlete pattern used
// elsewhere (ba_coach_font_scale_, ba_coach_insight_collapsed_, ...).

const STORAGE_PREFIX = 'ba_show_technical_terms_'

function storageKey(athleteId: string | undefined): string {
  return `${STORAGE_PREFIX}${athleteId ?? 'anon'}`
}

function readInitial(athleteId: string | undefined): boolean {
  try {
    const raw = localStorage.getItem(storageKey(athleteId))
    return raw === 'true'
  } catch {
    return false
  }
}

export function useTerminologyMode(athleteId?: string) {
  const [showTechnicalNames, setShow] = useState<boolean>(() => readInitial(athleteId))

  // Re-read when athleteId changes (e.g. profile switch).
  useEffect(() => {
    setShow(readInitial(athleteId))
  }, [athleteId])

  // Cross-tab / cross-component sync via the storage event.
  useEffect(() => {
    const key = storageKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key === key) setShow(e.newValue === 'true')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const setShowTechnicalNames = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(storageKey(athleteId), next ? 'true' : 'false')
      } catch {
        // localStorage may be unavailable in some embedded contexts; in-memory
        // state still flips so the toggle keeps working for the session.
      }
      setShow(next)
    },
    [athleteId],
  )

  return { showTechnicalNames, setShowTechnicalNames }
}
