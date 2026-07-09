import { describe, it, expect } from 'vitest'
import type { PlannedDay } from '../types'
import { generateDayCardNote } from '../utils/coachNotes'

/**
 * Field bug: generic type-keyed coach one-liners ("Quality day — hit the
 * zone splits", "Plan has drills prescribed") rendered on days the athlete
 * had rewritten into hikes. day.type is not a description of content once
 * the athlete has edited the day — the generics must stay quiet.
 */

function day(over: Partial<PlannedDay>): PlannedDay {
  return {
    day: 'Thu 9/24', type: 'quality', workout: 'Intervals', detail: '6×800',
    zone: 'Z4', route: '', time: '50 min', ...over,
  }
}

describe('generateDayCardNote on user-edited days', () => {
  it('stays silent on a quality day the athlete rewrote into a hike', () => {
    const edited = day({ workout: 'Tiger Mtn 3', detail: 'Tiger Mtn 3 climb · Poles', userEdited: true })
    expect(generateDayCardNote(edited, 5, undefined, false)).toBeNull()
  })

  it('NEGATIVE GUARD: an unedited quality day still gets the priming note', () => {
    const note = generateDayCardNote(day({}), 5, undefined, false)
    expect(note?.text).toContain('Quality day')
  })

  it('readiness warnings still fire on edited days (effort caution is content-independent)', () => {
    const edited = day({ workout: 'Tiger Mtn 3', userEdited: true })
    const red = { status: 'RED', displayScore: 38, adjustment: 'Take it easy today.' } as never
    const note = generateDayCardNote(edited, 5, red, false)
    expect(note?.tone).toBe('flag')
    expect(note?.text).toContain('38/100')
  })
})
