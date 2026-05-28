import { useEffect } from 'react'

/**
 * Keeps `--app-vh` synced to the *visible* viewport height so layouts can pin
 * content above the on-screen keyboard on iOS Safari, where the keyboard
 * overlays the layout viewport and `100dvh` does not shrink. Also exposes
 * `--app-keyboard` — how much the keyboard overlaps the bottom of the layout
 * viewport. Harmless on Android/Chromium, where
 * `interactive-widget=resizes-content` already shrinks the layout viewport.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement

    const apply = () => {
      const h = vv ? vv.height : window.innerHeight
      root.style.setProperty('--app-vh', `${h}px`)
      // Bottom overlap of the keyboard against the layout viewport.
      const overlap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
      root.style.setProperty('--app-keyboard', `${overlap}px`)
    }

    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply) // iOS scrolls under the keyboard
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])
}
