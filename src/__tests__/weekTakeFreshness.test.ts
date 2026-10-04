/**
 * The last-7-days take sits beside live numbers, so a take written for the
 * card's old numbers must never read as current once the card changes —
 * not while the new take loads, and not if that call fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { CoachSnapshot } from '../types'

vi.mock('../utils/coachApi', () => ({
  coachApiAvailable: () => true,
  coachApiBase: () => '',
  coachAuthHeaders: () => ({}),
}))

import { useCoachInsight } from '../hooks/useCoachInsight'

const snap = (digest: string): CoachSnapshot =>
  ({ today: { date: '2026-09-26' }, last7Digest: digest }) as unknown as CoachSnapshot

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.unstubAllGlobals() })

describe('week_take freshness', () => {
  it('stops calling an old take current the moment the card changes, and keeps it that way if the refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Log that missing Thursday.', generatedAt: Date.now() }) })
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ s }) => useCoachInsight({ athleteId: 'a1', surface: 'week_take', snapshot: s, enabled: true }),
      { initialProps: { s: snap('Sessions done 3 of 4') } },
    )
    await waitFor(() => expect(result.current.current).toBe(true))
    expect(result.current.insight?.text).toBe('Log that missing Thursday.')

    // The athlete logs Thursday: the card now reads 4 of 4.
    rerender({ s: snap('Sessions done 4 of 4') })
    expect(result.current.current).toBe(false)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // The refresh failed; the old take is still held but is not current.
    expect(result.current.current).toBe(false)
  })

  it('is current again when the take for the new numbers arrives', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'old', generatedAt: Date.now() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'new', generatedAt: Date.now() }) }))
    const { result, rerender } = renderHook(
      ({ s }) => useCoachInsight({ athleteId: 'a1', surface: 'week_take', snapshot: s, enabled: true }),
      { initialProps: { s: snap('A') } },
    )
    await waitFor(() => expect(result.current.current).toBe(true))
    rerender({ s: snap('B') })
    await waitFor(() => expect(result.current.insight?.text).toBe('new'))
    expect(result.current.current).toBe(true)
  })
})

describe('week_take waits for the card to settle', () => {
  // Aborting a request doesn't stop the server's model call: every step of
  // a sync landing used to cost one.
  const ok = (text: string) => ({ ok: true, json: async () => ({ text, generatedAt: Date.now() }) })
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
  const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); await Promise.resolve() })

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const mount = (fetchMock: ReturnType<typeof vi.fn>, digest = 'A') => {
    vi.stubGlobal('fetch', fetchMock)
    return renderHook(
      ({ s, on }) => useCoachInsight({ athleteId: 'a1', surface: 'week_take', snapshot: s, enabled: on, debounceMs: 1500 }),
      { initialProps: { s: snap(digest), on: true } },
    )
  }

  it('asks once, for the numbers the card settled on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('settled'))
    const { result, rerender } = mount(fetchMock, 'Sessions done 1 of 4')
    expect(result.current.loading).toBe(true)
    await advance(500)
    rerender({ s: snap('Sessions done 2 of 4'), on: true })
    await advance(500)
    rerender({ s: snap('Sessions done 4 of 4'), on: true })
    await advance(1499)
    expect(fetchMock).not.toHaveBeenCalled()
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).snapshot.last7Digest).toBe('Sessions done 4 of 4')
    await flush()
    expect(result.current.insight?.text).toBe('settled')
    expect(result.current.current).toBe(true)
  })

  it('shows a cached take at once, without waiting', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('for A')).mockResolvedValueOnce(ok('for B'))
    const { result, rerender } = mount(fetchMock)
    await advance(1500); await flush()
    rerender({ s: snap('B'), on: true })
    await advance(1500); await flush()
    expect(result.current.insight?.text).toBe('for B')
    // Back to A: read from the local cache on this render, no call.
    rerender({ s: snap('A'), on: true })
    await flush()
    expect(result.current.insight?.text).toBe('for A')
    expect(result.current.current).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('regenerates without waiting', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('first')).mockResolvedValueOnce(ok('again'))
    const { result } = mount(fetchMock)
    await advance(1500); await flush()
    act(() => result.current.regenerate())
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).force).toBe(true)
  })

  it('stops loading if the card is turned off mid-wait, and never calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('never'))
    const { result, rerender } = mount(fetchMock)
    expect(result.current.loading).toBe(true)
    rerender({ s: snap('A'), on: false })
    await advance(3000)
    expect(result.current.loading).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
