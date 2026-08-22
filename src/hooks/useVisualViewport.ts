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
 * FIELD ROUND 2 — the first version listened only to the VISUAL
 * viewport channel (vv resize/scroll + focusin) and did not hold on
 * device. The tell in the follow-up screenshot: the bottom tab bar sat
 * ABOVE the keyboard, which only happens when iOS honors
 * `interactive-widget=resizes-content` and resizes the LAYOUT viewport
 * itself. In that mode Safari's keyboard scroll is a plain WINDOW
 * scroll — vv.offsetTop stays 0 and no vv event fires — so the pin
 * never ran. This version covers both keyboard modes:
 *   - overlay mode (older iOS): vv resize/scroll events
 *   - resizes-content mode (newer iOS): window scroll/resize events
 * plus a short self-terminating burst after focus, because Safari's
 * scroll-into-view lands mid-keyboard-animation on its own schedule and
 * has been observed to slip between events entirely. And while the
 * screen is mounted the document is made unscrollable outright
 * (html/body overflow hidden) — in resizes-content mode that removes
 * the scrollable overflow Safari's correction needs, so there is
 * nothing to fight at all.
 *
 * Mount ONLY inside a screen rendered in frame mode (today: CoachTab).
 * Other tabs are normal scrolling documents where Safari's
 * scroll-into-view is exactly what a focused input needs.
 */
export function usePinnedToVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport
    const html = document.documentElement
    const body = document.body

    const pin = () => {
      // Pinch-zoom pans the visual viewport for reasons that have
      // nothing to do with the keyboard — never fight the user's zoom.
      if (vv && vv.scale > 1.001) return
      if (window.scrollY !== 0 || (vv && vv.offsetTop > 0)) {
        window.scrollTo(0, 0)
      }
    }

    // Safari performs its scroll-into-view on its own schedule during
    // the keyboard animation — sometimes between the events we can hear.
    // After any focus, sweep for ~1.2s; each tick is a no-op once the
    // document is at rest, and the burst always self-terminates.
    let burst: ReturnType<typeof setInterval> | null = null
    const startBurst = () => {
      pin()
      if (burst !== null) clearInterval(burst)
      let ticks = 0
      burst = setInterval(() => {
        pin()
        if (++ticks >= 12 && burst !== null) {
          clearInterval(burst)
          burst = null
        }
      }, 100)
    }

    // The frame never legitimately scrolls the document, so remove the
    // ability outright while mounted — in resizes-content mode this
    // deletes the overflow Safari's correction would scroll into.
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'

    pin()
    // Overlay mode: the keyboard moves the visual viewport.
    vv?.addEventListener('resize', pin)
    vv?.addEventListener('scroll', pin)
    // Resizes-content mode: the keyboard resizes the LAYOUT viewport and
    // Safari's correction is an ordinary window scroll.
    window.addEventListener('scroll', pin)
    window.addEventListener('resize', pin)
    window.addEventListener('focusin', startBurst)
    return () => {
      if (burst !== null) clearInterval(burst)
      vv?.removeEventListener('resize', pin)
      vv?.removeEventListener('scroll', pin)
      window.removeEventListener('scroll', pin)
      window.removeEventListener('resize', pin)
      window.removeEventListener('focusin', startBurst)
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [])
}
