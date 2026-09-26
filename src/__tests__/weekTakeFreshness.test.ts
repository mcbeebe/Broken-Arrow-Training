/**
 * The last-7-days take sits beside live numbers, so a take written for the
 * card's old numbers must never read as current once the card changes —
 * not while the new take loads, and not if that call fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
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
