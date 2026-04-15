import { useCallback, useEffect, useState } from 'react'

/**
 * "About Me" free-text field — the primary memory surface for the
 * Coach feature. Persisted per-athlete in localStorage. User owns it;
 * the Coach will eventually propose additions (pending inferences),
 * but for Option A we just provide the editable field + persistence.
 */

const STORAGE_KEY_PREFIX = 'ba_about_me_v1:'

function storageKey(athleteId: string): string {
  return `${STORAGE_KEY_PREFIX}${athleteId}`
}

function readFromStorage(athleteId: string): string {
  try {
    const raw = localStorage.getItem(storageKey(athleteId))
    return raw ?? ''
  } catch {
    return ''
  }
}

export function useAboutMe(athleteId: string) {
  const [text, setText] = useState<string>(() => readFromStorage(athleteId))

  // Re-read when the athlete changes
  useEffect(() => {
    setText(readFromStorage(athleteId))
  }, [athleteId])

  const save = useCallback((next: string) => {
    setText(next)
    try {
      localStorage.setItem(storageKey(athleteId), next)
    } catch {
      // best-effort — ignore quota errors
    }
  }, [athleteId])

  const clear = useCallback(() => {
    save('')
  }, [save])

  return { text, save, clear }
}
