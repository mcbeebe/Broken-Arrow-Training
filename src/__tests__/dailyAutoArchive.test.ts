import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDailyAutoArchive } from '../hooks/useDailyAutoArchive'
import { markCoachActivity } from '../utils/coachActivity'
import { localDateStr } from '../utils/format'
import type { ConversationTurn } from '../types'

function turn(ts: number, role: ConversationTurn['role'] = 'user'): ConversationTurn {
  return { id: `t_${ts}`, role, content: 'hi', ts }
}

const GUARD_KEY = 'ba_coach_last_rollover:mike'
const FIVE_MIN = 5 * 60 * 1000

function mount(
  conversation: ConversationTurn[],
  rolloverDay: (date: string) => void,
  opts: Partial<{ enabled: boolean; loaded: boolean }> = {},
) {
  return renderHook(() =>
    useDailyAutoArchive({
      athleteId: 'mike',
      enabled: opts.enabled ?? true,
      loaded: opts.loaded ?? true,
      conversation,
      rolloverDay,
    }),
  )
}

describe('useDailyAutoArchive — catch-up on launch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('archives a thread whose newest turn is from a prior day', () => {
    const rollover = vi.fn()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mount([turn(yesterday.getTime())], rollover)
    expect(rollover).toHaveBeenCalledTimes(1)
    expect(rollover).toHaveBeenCalledWith(localDateStr(yesterday))
    // Guard is stamped so a second mount the same day is a no-op.
    expect(localStorage.getItem(GUARD_KEY)).toBe(localDateStr())
  })

  it('does not archive a same-day thread', () => {
    const rollover = vi.fn()
    mount([turn(Date.now())], rollover)
    expect(rollover).not.toHaveBeenCalled()
  })

  it('does not archive before memory has loaded', () => {
    const rollover = vi.fn()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mount([turn(yesterday.getTime())], rollover, { loaded: false })
    expect(rollover).not.toHaveBeenCalled()
  })

  it('is a no-op when disabled', () => {
    const rollover = vi.fn()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mount([turn(yesterday.getTime())], rollover, { enabled: false })
    expect(rollover).not.toHaveBeenCalled()
  })

  it('does not double-archive once the day is already guarded', () => {
    localStorage.setItem(GUARD_KEY, localDateStr())
    const rollover = vi.fn()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mount([turn(yesterday.getTime())], rollover)
    expect(rollover).not.toHaveBeenCalled()
  })

  it('ignores system-handoff-only threads', () => {
    const rollover = vi.fn()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mount([turn(yesterday.getTime(), 'system-handoff')], rollover)
    expect(rollover).not.toHaveBeenCalled()
  })
})

describe('useDailyAutoArchive — midnight timer', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T23:50:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('archives at midnight when the athlete is idle', () => {
    markCoachActivity() // last active at 23:50 — idle by midnight
    const rollover = vi.fn()
    // Same-day turn so catch-up stays out of the way.
    mount([turn(new Date('2026-05-25T23:00:00').getTime())], rollover)
    expect(rollover).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000 + 2000) }) // → 00:00:02
    expect(rollover).toHaveBeenCalledTimes(1)
    expect(rollover).toHaveBeenCalledWith('2026-05-25')
  })

  it('defers the rollover while the athlete is mid-conversation', () => {
    markCoachActivity()
    const rollover = vi.fn()
    mount([turn(new Date('2026-05-25T23:00:00').getTime())], rollover)

    // Athlete is still typing at 23:59 — one minute before midnight.
    act(() => { vi.advanceTimersByTime(9 * 60 * 1000) }) // → 23:59:00
    markCoachActivity()

    // Midnight passes, but they were active <5 min ago → no archive yet.
    act(() => { vi.advanceTimersByTime(60 * 1000 + 1000) }) // → 00:00:01
    expect(rollover).not.toHaveBeenCalled()

    // Once the 5-min inactivity window clears, the rollover fires.
    act(() => { vi.advanceTimersByTime(FIVE_MIN + 1000) })
    expect(rollover).toHaveBeenCalledTimes(1)
  })
})
