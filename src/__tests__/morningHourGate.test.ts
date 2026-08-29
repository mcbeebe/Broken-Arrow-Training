/**
 * P7 — the autopilot acts on the athlete's clock, not on a constant.
 *
 * The gate existed so the engine never rewrites a day at 2am off
 * incomplete overnight data. It was hardcoded to 5am, which is a fine
 * guess for someone who wakes at 6 and useless for someone who does not.
 * A night-shift nurse whose morning starts at 2pm was adjusted at 5am —
 * before the night they had just slept through had even been recorded.
 */
import { describe, it, expect } from 'vitest'
import { shouldActNow, ACT_HOUR } from '../hooks/useMorningOutlook'
import type { MorningOutlook } from '../engines/adaptive/morningOutlook'

const at = (hour: number) => new Date(`2026-08-29T${String(hour).padStart(2, '0')}:30:00`)

const outlook = (): MorningOutlook => ({
  dateIso: '2026-08-29',
  verdict: 'trim',
  headline: 'Rough night — I made today easy.',
  why: 'HRV under baseline three mornings running.',
  before: 'Tempo · 50 min',
  after: 'Easy run · 40 min',
  evidence: [],
  ops: [{ op: { kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: { time: '40 min' } }, rationale: 'eased' }],
})

describe('the athlete decides when their morning starts', () => {
  it('holds off until a night-shift athlete has actually woken up', () => {
    // Morning declared at 2pm. 5am is the middle of their night.
    expect(shouldActNow(null, outlook(), at(5), 14)).toBe(false)
    expect(shouldActNow(null, outlook(), at(13), 14)).toBe(false)
    expect(shouldActNow(null, outlook(), at(14), 14)).toBe(true)
  })

  it('acts from an early riser\'s declared hour', () => {
    expect(shouldActNow(null, outlook(), at(4), 5)).toBe(false)
    expect(shouldActNow(null, outlook(), at(5), 5)).toBe(true)
  })

  it('falls back to the old constant when nothing is declared', () => {
    expect(shouldActNow(null, outlook(), at(ACT_HOUR - 1))).toBe(false)
    expect(shouldActNow(null, outlook(), at(ACT_HOUR))).toBe(true)
  })
})

describe('the other guarantees are unchanged', () => {
  it('still never acts twice in a day', () => {
    const state = { dateIso: '2026-08-29', card: { ...outlook() }, batchId: 'b1' }
    expect(shouldActNow(state, outlook(), at(9), 7)).toBe(false)
  })

  it('still does nothing on a confirm verdict or with no ops', () => {
    expect(shouldActNow(null, { ...outlook(), verdict: 'confirm' }, at(9), 7)).toBe(false)
    expect(shouldActNow(null, { ...outlook(), ops: [] }, at(9), 7)).toBe(false)
  })

  it('still refuses to act on a card built for another day', () => {
    expect(shouldActNow(null, { ...outlook(), dateIso: '2026-08-28' }, at(9), 7)).toBe(false)
  })
})
