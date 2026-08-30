/**
 * P8 — the state × clock matrix.
 *
 * The Evening Close is the second state machine on this page with no card
 * behind it to catch a wrong state, so every hour of every window shape is
 * asserted rather than sampled.
 */
import { describe, it, expect } from 'vitest'
import { dayPhase, hoursUntilClose } from '../utils/dayPhase'

const at = (h: number) => new Date(2026, 7, 29, h, 30)
const phases = (morningHour: number, eveningHour: number) =>
  Array.from({ length: 24 }, (_, h) => dayPhase(at(h), { morningHour, eveningHour }))

describe('an ordinary day — wake 7, close 20', () => {
  const p = phases(7, 20)

  it('is morning from the declared wake hour until the close', () => {
    for (let h = 7; h < 20; h++) expect(p[h], `hour ${h}`).toBe('morning')
  })

  it('is evening from the close until midnight, and no further', () => {
    for (let h = 20; h < 24; h++) expect(p[h], `hour ${h}`).toBe('evening')
  })

  it('shows today early rather than last night, before the declared wake', () => {
    // Shipped getting this wrong: an athlete up at 7:47 with a wake hour of
    // 8 was handed the previous evening's close instead of the day's answer.
    // Before the declared wake, the day is simply ready early — that is the
    // friendlier reading and the truthful one, since the close it would
    // otherwise show is about a calendar day that has already ended.
    for (let h = 0; h < 7; h++) expect(p[h], `hour ${h}`).toBe('morning')
  })

  it('does not hand back the close the moment midnight passes', () => {
    const w = { morningHour: 7, eveningHour: 20 }
    expect(dayPhase(new Date(2026, 7, 29, 23, 59), w)).toBe('evening')
    expect(dayPhase(new Date(2026, 7, 30, 0, 0), w)).toBe('morning')
  })

  it('flips exactly on the hour, never a minute early', () => {
    expect(dayPhase(new Date(2026, 7, 29, 19, 59), { morningHour: 7, eveningHour: 20 })).toBe('morning')
    expect(dayPhase(new Date(2026, 7, 29, 20, 0), { morningHour: 7, eveningHour: 20 })).toBe('evening')
  })
})

describe('a night-shift day — wake 14, close 02', () => {
  const p = phases(14, 2)

  it('treats the small hours as the close, not as a new morning', () => {
    for (let h = 2; h < 14; h++) expect(p[h], `hour ${h}`).toBe('evening')
  })

  it('is morning from the 2pm wake through to midnight', () => {
    for (let h = 14; h < 24; h++) expect(p[h], `hour ${h}`).toBe('morning')
    // ...and through midnight until the 2am close.
    expect(p[0]).toBe('morning')
    expect(p[1]).toBe('morning')
  })
})

describe('every hour resolves to exactly one phase', () => {
  it('never leaves an hour undecided, whatever the window', () => {
    for (let m = 0; m < 24; m++) {
      for (let e = 0; e < 24; e++) {
        for (const p of phases(m, e)) {
          expect(p === 'morning' || p === 'evening', `window ${m}/${e}`).toBe(true)
        }
      }
    }
  })

  it('holds the morning when the two hours are identical, rather than flickering', () => {
    expect(phases(9, 9).every(x => x === 'morning')).toBe(true)
  })
})

describe('the lights-out countdown', () => {
  it('counts the hours left before the close', () => {
    expect(hoursUntilClose(at(17), { morningHour: 7, eveningHour: 20 })).toBe(3)
  })

  it('says nothing once the close has already begun', () => {
    expect(hoursUntilClose(at(21), { morningHour: 7, eveningHour: 20 })).toBeNull()
  })

  it('counts a full day ahead when you are up before your wake hour', () => {
    // 03:30 with a close at 20:00 — still today's close, sixteen hours out.
    expect(hoursUntilClose(at(3), { morningHour: 7, eveningHour: 20 })).toBe(17)
  })

  it('wraps correctly for a night-shift window', () => {
    // 22:30, closing at 02:00 — three and a half hours, reported as 4.
    expect(hoursUntilClose(at(22), { morningHour: 14, eveningHour: 2 })).toBe(4)
  })
})
