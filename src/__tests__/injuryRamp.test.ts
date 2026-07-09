import { describe, it, expect } from 'vitest'
import { INJURY_LEADIN_WEEKS, injuryRampNote, injurySummaryLine } from '../utils/injuryRamp'

describe('INJURY_LEADIN_WEEKS', () => {
  it('matches the plan generator policy (returning=2, current=4, none=0)', () => {
    expect(INJURY_LEADIN_WEEKS.none).toBe(0)
    expect(INJURY_LEADIN_WEEKS.returning).toBe(2)
    expect(INJURY_LEADIN_WEEKS.current).toBe(4)
  })
})

describe('injuryRampNote', () => {
  it('returns null for healthy athletes', () => {
    expect(injuryRampNote('none', 1, 'run')).toBeNull()
    expect(injuryRampNote(undefined, 1, 'run')).toBeNull()
  })

  it('returns null on rest days and completed workouts', () => {
    expect(injuryRampNote('returning', 1, 'rest')).toBeNull()
    expect(injuryRampNote('returning', 1, 'run', true)).toBeNull()
  })

  it('shows a heads-up note during the returning lead-in', () => {
    const note = injuryRampNote('returning', 1, 'run')
    expect(note).not.toBeNull()
    expect(note!.tone).toBe('heads_up')
    expect(note!.text).toMatch(/Week 1 of 2/)
  })

  it('shows a recovery-first flag during the currently-injured lead-in', () => {
    const note = injuryRampNote('current', 2, 'long')
    expect(note).not.toBeNull()
    expect(note!.tone).toBe('flag')
    expect(note!.text).toMatch(/Week 2 of 4/)
  })

  it('softens to an info note just past the lead-in, then goes quiet', () => {
    const justAfter = injuryRampNote('returning', 3, 'quality')
    expect(justAfter?.tone).toBe('info')
    expect(injuryRampNote('returning', 10, 'run')).toBeNull()
  })

  it('only annotates running-type days', () => {
    expect(injuryRampNote('returning', 1, 'strength')).toBeNull()
    expect(injuryRampNote('returning', 1, 'cross')).toBeNull()
    expect(injuryRampNote('returning', 1, 'limited')).not.toBeNull()
  })
})

describe('injurySummaryLine', () => {
  it('returns null for healthy / missing config', () => {
    expect(injurySummaryLine(null)).toBeNull()
    expect(injurySummaryLine({ injuryStatus: 'none' })).toBeNull()
  })

  it('builds a returning summary with area, timeframe, and note', () => {
    const line = injurySummaryLine({
      injuryStatus: 'returning',
      injuryArea: 'knee',
      injuryTimeframe: 'Cleared 1-2 weeks ago',
      injuryNote: 'cautious on downhills',
    })
    expect(line).toMatch(/coming back from a knee injury/)
    expect(line).toMatch(/cleared 1-2 weeks ago/)
    expect(line).toMatch(/cautious on downhills/)
  })

  it('handles a currently-injured athlete with no extra detail', () => {
    const line = injurySummaryLine({ injuryStatus: 'current' })
    expect(line).toMatch(/currently managing an injury/)
  })
})

// ── Fixture honesty: the "intensity stays easy" claim may only render on
//    content that IS easy (field bug: the note sat over a pinned VO2 body).

describe('injuryRampNote — eased-content honesty', () => {
  it('a lead-in QUALITY day the generator did not ease gets NO note', () => {
    expect(injuryRampNote('returning', 1, 'quality', false, undefined)).toBeNull()
    expect(injuryRampNote('returning', 2, 'quality', false, false)).toBeNull()
  })

  it('a lead-in quality day the generator DID ease keeps the note', () => {
    const note = injuryRampNote('returning', 1, 'quality', false, true)
    expect(note).not.toBeNull()
    expect(note!.text).toMatch(/intensity stays easy/)
  })

  it('plain run/long days never needed the stamp — note unaffected', () => {
    expect(injuryRampNote('returning', 1, 'run', false, undefined)).not.toBeNull()
    expect(injuryRampNote('returning', 2, 'long', false, undefined)).not.toBeNull()
  })

  it('past the lead-in the honesty gate no longer applies (info note)', () => {
    expect(injuryRampNote('returning', 3, 'quality', false, undefined)?.tone).toBe('info')
  })
})
