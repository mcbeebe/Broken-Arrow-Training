/**
 * N16 — the Day data probe: fetch one date fresh, show exactly what the
 * server returned, report what the cache held.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import DayDataProbe from '../components/DayDataProbe'
import type { GarminActivityDetail } from '../types'

afterEach(cleanup)

const ROWING = {
  activityId: 22, name: 'Indoor Rowing', type: 'indoor_rowing',
  startTimeLocal: '2026-08-25T16:11:00', durationSeconds: 214,
  movingDurationSeconds: 214, averageHR: 169, maxHR: 193,
  distanceMeters: 0, elevationGainMeters: 0, elevationLossMeters: 0, calories: 58,
} as unknown as GarminActivityDetail

describe('DayDataProbe', () => {
  it('probes a date, lists the server truth, and reports the prior cache', async () => {
    const onProbe = vi.fn(async () => [ROWING])
    render(<DayDataProbe cachedDetails={{ '2026-08-25': [] }} onProbe={onProbe} />)
    fireEvent.change(screen.getByTestId('probe-date'), { target: { value: '2026-08-25' } })
    fireEvent.click(screen.getByTestId('probe-run'))
    await waitFor(() => expect(screen.getByTestId('probe-result')).toBeTruthy())
    expect(onProbe).toHaveBeenCalledWith('2026-08-25')
    expect(screen.getByText(/Server returned 1 activity/)).toBeTruthy()
    expect(screen.getByText('indoor_rowing')).toBeTruthy()
    expect(screen.getByText(/3:34 · 0 m · 169 bpm/)).toBeTruthy()
  })

  it('surfaces probe failures instead of pretending', async () => {
    const onProbe = vi.fn(async () => { throw new Error('http_500') })
    render(<DayDataProbe cachedDetails={{}} onProbe={onProbe} />)
    fireEvent.click(screen.getByTestId('probe-run'))
    await waitFor(() => expect(screen.getByText(/Probe failed: http_500/)).toBeTruthy())
  })
})
