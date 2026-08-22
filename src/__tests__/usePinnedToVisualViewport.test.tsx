/**
 * Field bug: on the Coach tab, tapping the composer made the screen
 * "jump" — composer stranded mid-screen, white void below. iOS Safari
 * scrolls the DOCUMENT on input focus to dodge the incoming keyboard,
 * computed before our frame shrinks to the visible viewport; the scroll
 * then sticks. The hook pins the document back to 0, where the shrunken
 * frame already keeps the input visible.
 *
 * Honesty about scope (the benchmark-sheet lesson): jsdom cannot model
 * the iOS keyboard or viewport. These tests prove the HOOK'S CONTRACT —
 * when it pins, when it deliberately doesn't, and that it cleans up —
 * not the on-device behavior. The device check is the merge follow-up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePinnedToVisualViewport } from '../hooks/useVisualViewport'

class FakeVisualViewport extends EventTarget {
  height = 800
  offsetTop = 0
  scale = 1
}

let vv: FakeVisualViewport
let scrollTo: ReturnType<typeof vi.fn>

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

beforeEach(() => {
  vv = new FakeVisualViewport()
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  scrollTo = vi.fn().mockImplementation((_x: number, y: number) => setScrollY(y))
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true })
  setScrollY(0)
})

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
})

describe('usePinnedToVisualViewport', () => {
  it('snaps the document back when Safari scrolls it under the keyboard', () => {
    renderHook(() => usePinnedToVisualViewport())
    // Safari's keyboard-avoidance scroll: document moves, vv reports it.
    setScrollY(336)
    vv.offsetTop = 336
    vv.dispatchEvent(new Event('scroll'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('pins on the keyboard resize event too — the animation fires resize, not always scroll', () => {
    renderHook(() => usePinnedToVisualViewport())
    setScrollY(120)
    vv.height = 480
    vv.dispatchEvent(new Event('resize'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('pins on focusin — the initial tap, before any viewport event lands', () => {
    renderHook(() => usePinnedToVisualViewport())
    scrollTo.mockClear()
    setScrollY(50)
    window.dispatchEvent(new Event('focusin'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('clears residual scroll from the previous tab immediately on mount', () => {
    setScrollY(410) // the athlete was deep in the Plan tab
    renderHook(() => usePinnedToVisualViewport())
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('is a no-op at rest — no scroll thrash, no event loop', () => {
    renderHook(() => usePinnedToVisualViewport())
    scrollTo.mockClear()
    vv.dispatchEvent(new Event('scroll'))
    vv.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('focusin'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('never fights pinch-zoom — a panned zoomed viewport is the user, not the keyboard', () => {
    renderHook(() => usePinnedToVisualViewport())
    scrollTo.mockClear()
    vv.scale = 2.5
    vv.offsetTop = 200
    setScrollY(200)
    vv.dispatchEvent(new Event('scroll'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stops pinning after unmount — other tabs keep native scroll behavior', () => {
    const { unmount } = renderHook(() => usePinnedToVisualViewport())
    unmount()
    scrollTo.mockClear()
    setScrollY(300)
    vv.offsetTop = 300
    vv.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('focusin'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('pins on a plain WINDOW scroll — resizes-content mode, where the keyboard never touches the visual viewport', () => {
    // The round-2 field failure: newer iOS honors
    // interactive-widget=resizes-content, so Safari's keyboard scroll is
    // an ordinary window scroll with vv.offsetTop still 0. The first
    // version only listened to vv events and never saw it.
    renderHook(() => usePinnedToVisualViewport())
    scrollTo.mockClear()
    setScrollY(280)               // vv.offsetTop stays 0
    window.dispatchEvent(new Event('scroll'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('pins on a WINDOW resize — the layout viewport shrinking in resizes-content mode', () => {
    renderHook(() => usePinnedToVisualViewport())
    scrollTo.mockClear()
    setScrollY(90)
    window.dispatchEvent(new Event('resize'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('sweeps after focus — Safari scrolls on its own schedule, sometimes between events', () => {
    vi.useFakeTimers()
    try {
      renderHook(() => usePinnedToVisualViewport())
      window.dispatchEvent(new Event('focusin'))
      scrollTo.mockClear()
      // Safari moves the document 300ms later with NO event we can hear.
      setScrollY(220)
      vi.advanceTimersByTime(400)
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
      // The burst self-terminates: after it ends, a silent scroll stays.
      scrollTo.mockClear()
      vi.advanceTimersByTime(2000)
      setScrollY(75)
      vi.advanceTimersByTime(2000)
      expect(scrollTo).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes the document\'s ability to scroll while mounted, and restores it after', () => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = 'auto'
    const { unmount } = renderHook(() => usePinnedToVisualViewport())
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('auto')
  })

  it('survives a browser with no visualViewport at all', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    setScrollY(80)
    expect(() => {
      const { unmount } = renderHook(() => usePinnedToVisualViewport())
      window.dispatchEvent(new Event('focusin'))
      unmount()
    }).not.toThrow()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })
})
