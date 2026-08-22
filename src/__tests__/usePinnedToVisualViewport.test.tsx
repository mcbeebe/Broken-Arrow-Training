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
