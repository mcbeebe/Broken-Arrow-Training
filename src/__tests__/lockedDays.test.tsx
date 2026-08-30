/**
 * Locked days (P12) — a pinned day is fixed: every scheduler leaves it
 * exactly as authored, and the day card offers the pin toggle.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react'
import type { PlannedDay, TrainingPlan, TrainingWeek } from '../types'
import { useLockedDays, applyLocks, pruneStaleLocks } from '../hooks/useLockedDays'
import { replanMissedKeySession, replanShortGap } from '../engines/planGenerator/replan'
import { buildTravelBatch } from '../engines/planGenerator/travelMode'
import DayCard from '../components/DayCard'

afterEach(cleanup)

function day(over: Partial<PlannedDay>): PlannedDay {
  return { day: 'Mon 9/7', type: 'run', workout: 'Easy run', detail: '', zone: '4 mi · Z2', route: '', time: '40 min', ...over }
}
function week(days: PlannedDay[]): TrainingWeek {
  return { num: 1, dates: 'Sep 7–13', startIso: '2026-09-07', miles: 20, focus: 'Build', days }
}

describe('useLockedDays store', () => {
  it('toggles a lock on and off and stamps day.locked by ISO', () => {
    localStorage.clear()
    const { result } = renderHook(() => useLockedDays('mike'))
    act(() => result.current.toggleLock('2026-09-09'))
    expect(result.current.isLocked('2026-09-09')).toBe(true)
    const w = result.current.applyLocksToWeeks([week([
      day({ day: 'Mon 9/7' }), day({ day: 'Wed 9/9', type: 'quality' }), day({ day: 'Fri 9/11' }),
    ])])
    expect(w[0].days[1].locked).toBe(true)   // Wed 9/9 pinned
    expect(w[0].days[0].locked).toBeUndefined()
    act(() => result.current.toggleLock('2026-09-09'))
    expect(result.current.isLocked('2026-09-09')).toBe(false)
  })

  it('prunes locks older than the plan generation', () => {
    const gen = '2026-09-01T00:00:00Z'
    const kept = pruneStaleLocks(
      [{ id: 'a', dateIso: '2026-09-09', appliedAt: Date.parse('2026-08-20') },
       { id: 'b', dateIso: '2026-09-10', appliedAt: Date.parse('2026-09-05') }],
      gen,
    )
    expect(kept.map(r => r.id)).toEqual(['b'])
  })
})

describe('schedulers leave a locked day alone', () => {
  const lockedWeek = week([
    day({ day: 'Mon 9/7', type: 'quality', workout: 'Intervals', locked: true }),
    day({ day: 'Tue 9/8', type: 'run' }),
    day({ day: 'Wed 9/9', type: 'rest', zone: '—', time: '—' }),
    day({ day: 'Thu 9/10', type: 'run' }),
    day({ day: 'Fri 9/11', type: 'run' }),
    day({ day: 'Sat 9/12', type: 'long', zone: '10 mi · Z2', workout: 'Long run', locked: true }),
    day({ day: 'Sun 9/13', type: 'rest', zone: '—', time: '—' }),
  ])
  const plan = { weeks: [lockedWeek] } as unknown as TrainingPlan

  it('replan never moves or skips a locked missed key session', () => {
    const out = replanMissedKeySession(plan, '2026-09-07') // the pinned Mon quality
    expect(out).toBe(plan) // untouched — returns the same plan
    expect(out.weeks[0].days[0].workout).toBe('Intervals')
  })

  it('replanShortGap never marks a locked day skipped', () => {
    const out = replanShortGap(plan, ['2026-09-07'])
    expect(out.weeks[0].days[0].workout).toBe('Intervals') // not "Missed and skipped…"
    expect(out.weeks[0].days[0].locked).toBe(true)
  })

  it('travel mode never adapts a locked day', () => {
    // A trip Mon–Sat covers both pinned days; kit rest would otherwise
    // convert everything to travel and relocate the long run.
    const res = buildTravelBatch([lockedWeek], { startIso: '2026-09-07', endIso: '2026-09-12', kit: 'rest' })
    const touchedIdx = res.ops.filter(o => o.op.kind === 'updateDay').map(o => o.op.kind === 'updateDay' && o.op.dayIndex)
    expect(touchedIdx).not.toContain(0) // Mon quality pinned
    expect(touchedIdx).not.toContain(5) // Sat long pinned — not moved either
    expect(res.longRunMoved).toBeUndefined()
  })
})

describe('DayCard lock toggle', () => {
  it('shows the pin state and calls back on tap', () => {
    const onToggleLock = vi.fn()
    const { rerender } = render(<DayCard day={day({})} onTap={() => {}} locked={false} onToggleLock={onToggleLock} />)
    const btn = screen.getByTestId('day-lock-toggle')
    expect(btn.textContent).toBe('🔓')
    fireEvent.click(btn)
    expect(onToggleLock).toHaveBeenCalledTimes(1)
    rerender(<DayCard day={day({})} onTap={() => {}} locked onToggleLock={onToggleLock} />)
    expect(screen.getByTestId('day-lock-toggle').textContent).toBe('🔒')
    expect(screen.getByTestId('day-card').getAttribute('data-locked')).toBe('true')
  })
})

// keep applyLocks importable-and-pure sanity
describe('applyLocks', () => {
  it('is a no-op with no locks', () => {
    const w = [week([day({})])]
    expect(applyLocks(w, new Set())).toBe(w)
  })
})
