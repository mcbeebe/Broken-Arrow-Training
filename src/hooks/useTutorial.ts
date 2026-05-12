import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'ba_tutorial_seen'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

/**
 * Tracks whether the post-onboarding tutorial walkthrough has been shown to
 * this athlete. One-shot flag stored in localStorage — once dismissed, the
 * tutorial never appears again for that profile.
 */
export function useTutorial(athleteId?: string) {
  const [seen, setSeen] = useState<boolean>(() => {
    try { return localStorage.getItem(scopedKey(athleteId)) === '1' }
    catch { return false }
  })

  useEffect(() => {
    // Re-read when the athlete switches profiles in the same mount — mirrors
    // the pattern in useOnboarding so per-athlete flags stay in sync.
    let v = false
    try { v = localStorage.getItem(scopedKey(athleteId)) === '1' } catch { /* quota */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(v)
  }, [athleteId])

  const markSeen = useCallback(() => {
    try { localStorage.setItem(scopedKey(athleteId), '1') } catch { /* quota */ }
    setSeen(true)
  }, [athleteId])

  return { seen, markSeen }
}
