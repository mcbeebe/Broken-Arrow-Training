/**
 * "Why this workout?" says what actually happened when the coach can't
 * answer: over the daily coach budget (429) is not "offline".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { CoachSnapshot, PlannedDay } from '../types'

vi.mock('../utils/coachApi', () => ({
  coachApiAvailable: () => true,
  coachApiBase: () => '',
  coachAuthHeaders: () => ({}),
}))

import WorkoutModal from '../components/WorkoutModal'

const day: PlannedDay = {
  day: 'Tue 10/6', type: 'quality', workout: 'Tempo', detail: '', zone: 'Z3', route: '', time: '40 min',
}
const snapshot = { today: { date: '2026-10-06' } } as unknown as CoachSnapshot

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const openWhy = async (status: number) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }))
  render(<WorkoutModal day={day} weekNum={4} onClose={() => {}} athleteId="a1" coachEnabled coachSnapshot={snapshot} />)
  fireEvent.click(screen.getByRole('button', { name: /Why this workout\?/ }))
}

describe('Why this workout? when the coach cannot answer', () => {
  it('says the daily limit is reached on a 429', async () => {
    await openWhy(429)
    await waitFor(() => expect(screen.getByText(/reached today’s limit/)).toBeTruthy())
    expect(screen.queryByText(/Coach is offline/)).toBeNull()
  })

  it('still says offline for other failures', async () => {
    await openWhy(502)
    await waitFor(() => expect(screen.getByText(/Coach is offline/)).toBeTruthy())
  })
})
