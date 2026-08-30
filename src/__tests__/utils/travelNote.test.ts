import { describe, it, expect } from 'vitest'
import { mentionsTravel, parseTravelNote } from '../../utils/travelNote'

const TODAY = '2026-05-01'

describe('mentionsTravel', () => {
  it('detects trip vocabulary and ignores unrelated notes', () => {
    expect(mentionsTravel('Travel May 15–22, no equipment')).toBe(true)
    expect(mentionsTravel('vacation in June')).toBe(true)
    expect(mentionsTravel('work crunch, no time')).toBe(false)
    expect(mentionsTravel(undefined)).toBe(false)
  })
})

describe('parseTravelNote', () => {
  it('parses the onboarding placeholder example incl. the equipment guess', () => {
    expect(parseTravelNote('Travel May 15–22, no equipment', TODAY)).toEqual({
      startIso: '2026-05-15',
      endIso: '2026-05-22',
      kit: 'bodyweight',
    })
  })

  it('parses an ASCII hyphen range', () => {
    const p = parseTravelNote('away May 15-22', TODAY)
    expect(p.startIso).toBe('2026-05-15')
    expect(p.endIso).toBe('2026-05-22')
  })

  it('parses a cross-month named range', () => {
    const p = parseTravelNote('trip May 28 – Jun 3', TODAY)
    expect(p.startIso).toBe('2026-05-28')
    expect(p.endIso).toBe('2026-06-03')
  })

  it('parses a numeric M/D range', () => {
    const p = parseTravelNote('travel 5/15 to 5/22', TODAY)
    expect(p.startIso).toBe('2026-05-15')
    expect(p.endIso).toBe('2026-05-22')
  })

  it('rolls a past month into next year', () => {
    const p = parseTravelNote('Travel Jan 10-15', TODAY) // Jan already passed in May
    expect(p.startIso).toBe('2027-01-10')
  })

  it('returns only a kit guess when no date is present', () => {
    expect(parseTravelNote('travelling, no equipment', TODAY)).toEqual({ kit: 'bodyweight' })
  })

  it('returns empty for an empty note', () => {
    expect(parseTravelNote(undefined, TODAY)).toEqual({})
  })
})
