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

/**
 * Pin the document to scroll position 0 while a visual-viewport-sized
 * app frame is active — the missing half of the keyboard handling.
 *
 * The field bug (Coach tab, iOS): tap the composer and the screen
 * "jumps" — composer stranded mid-screen, dead white space below, chat
 * history shoved off the top. Mechanism: on input focus, iOS Safari
 * scrolls the DOCUMENT to clear the incoming keyboard, and it computes
 * that scroll while the frame is still full-height. Our resize handler
 * then shrinks the frame to the visible viewport (`--app-vh`), but
 * Safari's document scroll REMAINS — shrunken frame + scrolled document
 * = the jump, permanently, until blur.
 *
 * Because the frame starts at the document top and is sized to the
 * visual viewport, scroll position 0 is always the correct resting
 * point: once the frame shrinks, the focused input genuinely is visible
 * at 0, so Safari's correction is unnecessary and snapping back is
 * stable (the guard makes the handler a no-op at 0 — no event loop).
 *
 * Mount ONLY inside a screen rendered in frame mode (today: CoachTab).
 * Other tabs are normal scrolling documents where Safari's
 * scroll-into-view is exactly what a focused input needs.
 */
export function usePinnedToVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport

    const pin = () => {
      // Pinch-zoom pans the visual viewport for reasons that have
      // nothing to do with the keyboard — never fight the user's zoom.
      if (vv && vv.scale > 1.001) return
      if (window.scrollY !== 0 || (vv && vv.offsetTop > 0)) {
        window.scrollTo(0, 0)
      }
    }

    // vv resize/scroll fire through the keyboard animation; focusin
    // catches the initial focus, and entering the tab with residual
    // scroll from the previous view is covered by the immediate call.
    pin()
    vv?.addEventListener('resize', pin)
    vv?.addEventListener('scroll', pin)
    window.addEventListener('focusin', pin)
    return () => {
      vv?.removeEventListener('resize', pin)
      vv?.removeEventListener('scroll', pin)
      window.removeEventListener('focusin', pin)
    }
  }, [])
}
