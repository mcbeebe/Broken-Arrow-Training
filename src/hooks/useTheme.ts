import { useState, useEffect, useCallback } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'ba_theme'

function getSystemPreference(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: 'light' | 'dark') {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
    // Default to light: dark mode isn't fully polished yet, so don't inherit
    // a system dark preference. Users can still pick dark/auto in Settings.
    return 'light'
  })

  const resolved = mode === 'auto' ? getSystemPreference() : mode

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(getSystemPreference())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next)
    setModeState(next)
  }, [])

  return { mode, resolved, setMode }
}
