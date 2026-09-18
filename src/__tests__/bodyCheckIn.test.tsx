/**
 * The body check-in: "How does your body feel right now?", gated to a
 * morning window (until 10 AM) and an evening window (from the evening
 * hour). One answer per window, so two a day at most.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, renderHook, act } from '@testing-library/react'
import { BodyCheckInTile, BodyCheckInRow } from '../components/BodyCheckIn'
import { useSoreness } from '../hooks/useSoreness'
import { useCheckInWindow } from '../hooks/useCheckInWindow'
import { localDateStr } from '../utils/format'
import type { DayCheckIns } from '../utils/checkInWindow'

afterEach(cleanup)

const none: DayCheckIns = { morning: null, evening: null }
const morningAt = new Date(2026, 8, 18, 6, 52).toISOString()
const eveningAt = new Date(2026, 8, 18, 19, 12).toISOString()
const noon = new Date(2026, 8, 18, 12, 0)

describe('the tile (Verdict card)', () => {
  it('invites the morning answer while the window is open', () => {
    render(<BodyCheckInTile window="morning" checkIns={none} onLog={vi.fn()} />)
    const tile = screen.getByTestId('body-tile')
    expect(tile.getAttribute('data-state')).toBe('open')
    expect(tile.textContent).toContain('Tap to log')
    expect(tile.textContent).toContain('Morning check-in · until 10 AM')
    expect(screen.queryByTestId('body-chips')).toBeNull()
  })

  it('asks the question on tap and logs one answer into the open window', () => {
    const onLog = vi.fn()
    render(<BodyCheckInTile window="morning" checkIns={none} onLog={onLog} />)
    fireEvent.click(screen.getByTestId('body-tile'))
    expect(screen.getByTestId('body-question').textContent).toBe('How does your body feel right now?')
    fireEvent.click(screen.getByTestId('body-chip-2'))
    expect(onLog).toHaveBeenCalledWith('morning', 2)
    // The row closes once answered.
    expect(screen.queryByTestId('body-chips')).toBeNull()
  })

  it('shows the answer with its time, and allows a change within the same window', () => {
    const onLog = vi.fn()
    render(<BodyCheckInTile window="morning" checkIns={{ ...none, morning: 2, morningAt }} onLog={onLog} />)
    const tile = screen.getByTestId('body-tile')
    expect(tile.getAttribute('data-state')).toBe('answered')
    expect(tile.textContent).toContain('👍 Normal')
    expect(tile.textContent).toContain('morning 6:52am')
    fireEvent.click(tile)
    expect(screen.getByTestId('body-chip-2').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('body-chip-3'))
    expect(onLog).toHaveBeenCalledWith('morning', 3)
  })

  it('lets the morning answer stand between windows and is not tappable', () => {
    render(<BodyCheckInTile window={null} now={noon} checkIns={{ ...none, morning: 1, morningAt }} onLog={vi.fn()} />)
    const tile = screen.getByTestId('body-tile') as HTMLButtonElement
    expect(tile.disabled).toBe(true)
    expect(tile.textContent).toContain('💚 Fresh')
    fireEvent.click(tile)
    expect(screen.queryByTestId('body-chips')).toBeNull()
  })

  it('names the next window when nothing was answered and none is open', () => {
    render(<BodyCheckInTile window={null} now={noon} checkIns={none} onLog={vi.fn()} />)
    const tile = screen.getByTestId('body-tile') as HTMLButtonElement
    expect(tile.disabled).toBe(true)
    expect(tile.getAttribute('data-state')).toBe('closed')
    expect(tile.textContent).toContain('Evening check-in opens at 6 PM')
  })
})

describe('the row (Evening Close)', () => {
  it('asks the evening question inline, with the morning answer for context', () => {
    const onLog = vi.fn()
    render(<BodyCheckInRow window="evening" checkIns={{ ...none, morning: 3, morningAt }} onLog={onLog} />)
    expect(screen.getByTestId('body-row').getAttribute('data-state')).toBe('open')
    expect(screen.getByTestId('body-question').textContent).toBe('How does your body feel right now?')
    expect(screen.getByTestId('body-row').textContent).toContain('Evening check-in · from 6 PM')
    expect(screen.getByTestId('body-morning-context').textContent).toContain('😣 Sore · 6:52am')
    fireEvent.click(screen.getByTestId('body-chip-2'))
    expect(onLog).toHaveBeenCalledWith('evening', 2)
  })

  it('collapses to the receipt once answered, with a Change that reopens it', () => {
    render(<BodyCheckInRow window="evening" checkIns={{ morning: 3, evening: 2, morningAt, eveningAt }} onLog={vi.fn()} />)
    const row = screen.getByTestId('body-row')
    expect(row.getAttribute('data-state')).toBe('answered')
    expect(row.textContent).toContain('Body this evening:')
    expect(row.textContent).toContain('👍 Normal')
    expect(row.textContent).toContain('7:12pm')
    expect(screen.queryByTestId('body-chips')).toBeNull()
    fireEvent.click(screen.getByTestId('body-change'))
    expect(screen.getByTestId('body-chip-2').getAttribute('aria-pressed')).toBe('true')
  })

  it('does not ask outside the evening window', () => {
    render(<BodyCheckInRow window={null} now={noon} checkIns={{ ...none, morning: 2, morningAt }} onLog={vi.fn()} />)
    expect(screen.queryByTestId('body-chips')).toBeNull()
    expect(screen.getByTestId('body-row').textContent).toContain('Body this morning:')
    cleanup()
    render(<BodyCheckInRow window={null} now={noon} checkIns={none} onLog={vi.fn()} />)
    expect(screen.getByTestId('body-row').textContent).toContain('Evening check-in opens at 6 PM')
  })
})

describe('useSoreness windows', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps one answer per window and the latest as the day’s level', () => {
    vi.setSystemTime(new Date(2026, 8, 18, 6, 52))
    const { result } = renderHook(() => useSoreness('mike'))
    const today = localDateStr()
    act(() => result.current.logCheckIn(today, 'morning', 3))
    expect(result.current.todayCheckIns.morning).toBe(3)
    expect(result.current.todaySoreness).toBe(3)

    // A second morning answer replaces, never adds.
    vi.setSystemTime(new Date(2026, 8, 18, 7, 10))
    act(() => result.current.logCheckIn(today, 'morning', 2))
    expect(result.current.todayCheckIns.morning).toBe(2)
    expect(result.current.todayCheckIns.evening).toBeNull()

    vi.setSystemTime(new Date(2026, 8, 18, 19, 12))
    act(() => result.current.logCheckIn(today, 'evening', 4))
    expect(result.current.todayCheckIns).toMatchObject({ morning: 2, evening: 4 })
    expect(result.current.todaySoreness).toBe(4)
    expect(result.current.sorenessLoadByDate.get(today)).toBe(40)

    const stored = JSON.parse(localStorage.getItem('ba_soreness_mike')!)[today]
    expect(stored.morning.level).toBe(2)
    expect(stored.evening.level).toBe(4)
    expect(stored.level).toBe(4)
  })

  it('routes the legacy briefing answer into the open window', () => {
    vi.setSystemTime(new Date(2026, 8, 18, 7, 0))
    const { result } = renderHook(() => useSoreness('mike'))
    const today = localDateStr()
    act(() => result.current.logSoreness(today, 1))
    expect(result.current.todayCheckIns.morning).toBe(1)

    // Midday: updates the day's answer without claiming a window.
    vi.setSystemTime(new Date(2026, 8, 18, 13, 0))
    act(() => result.current.logSoreness(today, 3))
    expect(result.current.todaySoreness).toBe(3)
    expect(result.current.todayCheckIns).toMatchObject({ morning: 1, evening: null })

    // The athlete's own evening hour applies.
    vi.setSystemTime(new Date(2026, 8, 18, 19, 0))
    act(() => result.current.logSoreness(today, 2, 20))
    expect(result.current.todayCheckIns.evening).toBeNull()
    act(() => result.current.logSoreness(today, 2, 19))
    expect(result.current.todayCheckIns.evening).toBe(2)
  })

  it('reads a legacy single-answer entry as no windows', () => {
    const today = localDateStr()
    localStorage.setItem('ba_soreness_mike', JSON.stringify({ [today]: { level: 3, timestamp: new Date().toISOString() } }))
    const { result } = renderHook(() => useSoreness('mike'))
    expect(result.current.todaySoreness).toBe(3)
    expect(result.current.todayCheckIns).toMatchObject({ morning: null, evening: null })
  })
})

describe('useCheckInWindow', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('tracks the clock across the 10 AM and evening edges', () => {
    vi.setSystemTime(new Date(2026, 8, 18, 9, 40))
    const { result } = renderHook(() => useCheckInWindow(18))
    expect(result.current).toBe('morning')
    act(() => { vi.setSystemTime(new Date(2026, 8, 18, 10, 0)); vi.advanceTimersByTime(20 * 60_000) })
    expect(result.current).toBeNull()
    // The hourly tick fires with the clock at 6 PM.
    act(() => { vi.setSystemTime(new Date(2026, 8, 18, 17, 0)); vi.advanceTimersByTime(60 * 60_000) })
    expect(result.current).toBe('evening')
  })
})
