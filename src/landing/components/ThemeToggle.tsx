import { useEffect, useState } from 'react'
import { THEME_TOGGLE } from '../content'
import { DARK_QUERY, applyTheme, deviceIsDark, readStoredTheme, resolveTheme, type Theme } from '../theme'

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * The header's light/dark switch. It starts on whatever the page shows (the
 * device's setting or a saved pick) and follows the device while there is no
 * pick. The icon shows what a press switches to: a moon on light, a sun on dark.
 */
export function ThemeToggle() {
  const [deviceDark, setDeviceDark] = useState(() => deviceIsDark(window))
  const [picked, setPicked] = useState<Theme | null>(() => readStoredTheme(storage()))
  const theme = resolveTheme(picked, deviceDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (e: MediaQueryListEvent) => setDeviceDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next, deviceDark, document.documentElement, storage())
    setPicked(next === (deviceDark ? 'dark' : 'light') ? null : next)
  }

  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? THEME_TOGGLE.toLight : THEME_TOGGLE.toDark}
      data-theme-toggle={theme}
      className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-landing-muted"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
    </button>
  )
}
