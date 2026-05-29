import { useEffect, type RefObject } from 'react'

/**
 * Keeps the app's layout CSS variables in sync with the live environment so
 * height math (e.g. the Coach chat surface) is exact instead of relying on
 * hand-tuned guesses:
 *
 * - `--app-vh`       — the *visible* viewport height (window.visualViewport),
 *                      so layouts can pin content above the on-screen keyboard
 *                      on iOS Safari, where the keyboard overlays the layout
 *                      viewport and `100dvh` does not shrink.
 * - `--app-keyboard` — how much the keyboard overlaps the bottom of the layout
 *                      viewport (0 when closed).
 * - `--app-header-h` / `--app-tabbar-h` — measured heights of the app header
 *                      and bottom tab bar (incl. notch / home-indicator safe
 *                      areas and multi-line header content), when refs are
 *                      provided. Falls back to the CSS defaults otherwise.
 *
 * On Android/Chromium `interactive-widget=resizes-content` already shrinks the
 * layout viewport; this hook is a harmless, consistent fallback there too.
 */
export function useVisualViewport(opts?: {
  headerRef?: RefObject<HTMLElement | null>
  tabbarRef?: RefObject<HTMLElement | null>
}) {
  const headerRef = opts?.headerRef
  const tabbarRef = opts?.tabbarRef

  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement

    const apply = () => {
      const h = vv ? vv.height : window.innerHeight
      root.style.setProperty('--app-vh', `${h}px`)
      // Bottom overlap of the keyboard against the layout viewport.
      const overlap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
      root.style.setProperty('--app-keyboard', `${overlap}px`)
      // Measure real chrome so the chat height math is exact across devices
      // rather than relying on the --app-header-h / --app-tabbar-h estimates.
      if (headerRef?.current) root.style.setProperty('--app-header-h', `${headerRef.current.offsetHeight}px`)
      if (tabbarRef?.current) root.style.setProperty('--app-tabbar-h', `${tabbarRef.current.offsetHeight}px`)
    }

    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply) // iOS scrolls under the keyboard
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)

    // Header height changes with content (race name wrapping, alert banners)
    // and the tab bar with safe-area insets — observe both so the vars track.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    if (headerRef?.current) ro?.observe(headerRef.current)
    if (tabbarRef?.current) ro?.observe(tabbarRef.current)

    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      ro?.disconnect()
    }
  }, [headerRef, tabbarRef])
}
