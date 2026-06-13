import { describe, it, expect } from 'vitest'
import { menopauseSummaryLine, hasMenopauseContext, menopauseStrengthCue } from '../utils/menopause'

describe('menopauseStrengthCue (heavy bone-loading)', () => {
  it('returns a bone-loading cue for the active bone-loss stages', () => {
    for (const s of ['perimenopause', 'menopause', 'postmenopause'] as const) {
      const cue = menopauseStrengthCue({ menopauseStatus: s })
      expect(cue).not.toBeNull()
      expect(cue!.gymFinisher.length).toBeGreaterThan(0)
      expect(cue!.bodyweightFinisher.length).toBeGreaterThan(0)
      expect(cue!.framing).toMatch(/bone/i)
    }
  })
  it('returns a distinct bank-the-base cue for premenopause (not the active-loss finisher)', () => {
    const cue = menopauseStrengthCue({ menopauseStatus: 'premenopause' })
    expect(cue).not.toBeNull()
    expect(cue!.gymFinisher.join(' ')).not.toMatch(/Farmer Carry/)
    expect(cue!.framing).toMatch(/bank|base/i)
  })
  it('returns null for non-answers and unset', () => {
    expect(menopauseStrengthCue({ menopauseStatus: 'not_applicable' })).toBeNull()
    expect(menopauseStrengthCue({ menopauseStatus: 'prefer_not_to_say' })).toBeNull()
    expect(menopauseStrengthCue({})).toBeNull()
    expect(menopauseStrengthCue(null)).toBeNull()
  })
})

describe('menopauseSummaryLine', () => {
  it('returns null for missing, empty, or non-answers', () => {
    expect(menopauseSummaryLine(null)).toBeNull()
    expect(menopauseSummaryLine(undefined)).toBeNull()
    expect(menopauseSummaryLine({})).toBeNull()
    expect(menopauseSummaryLine({ menopauseStatus: 'not_applicable' })).toBeNull()
    expect(menopauseSummaryLine({ menopauseStatus: 'prefer_not_to_say' })).toBeNull()
  })

  it('summarizes a bare stage with a sentence-ready phrase', () => {
    expect(menopauseSummaryLine({ menopauseStatus: 'premenopause' })).toBe('premenopausal')
    expect(menopauseSummaryLine({ menopauseStatus: 'perimenopause' })).toBe('in perimenopause')
    expect(menopauseSummaryLine({ menopauseStatus: 'menopause' })).toBe('in menopause')
    expect(menopauseSummaryLine({ menopauseStatus: 'postmenopause' })).toBe('postmenopausal')
  })

  it('appends symptoms and a free-text note', () => {
    const line = menopauseSummaryLine({
      menopauseStatus: 'perimenopause',
      menopauseSymptoms: ['hot_flashes', 'sleep_disruption'],
      menopauseNote: 'mornings are rough',
    })
    expect(line).toBe(
      'in perimenopause · managing hot flashes and sleep disruption · mornings are rough',
    )
  })

  it('joins three or more symptoms with commas and a trailing "and"', () => {
    const line = menopauseSummaryLine({
      menopauseStatus: 'menopause',
      menopauseSymptoms: ['hot_flashes', 'joint_pain', 'low_energy'],
    })
    expect(line).toBe('in menopause · managing hot flashes, joint pain, and low energy')
  })

  it('ignores symptoms/note when status is a non-answer', () => {
    expect(
      menopauseSummaryLine({
        menopauseStatus: 'not_applicable',
        menopauseSymptoms: ['hot_flashes'],
        menopauseNote: 'should be ignored',
      }),
    ).toBeNull()
  })
})

describe('hasMenopauseContext', () => {
  it('is true only for a real stage', () => {
    expect(hasMenopauseContext({ menopauseStatus: 'premenopause' })).toBe(true)
    expect(hasMenopauseContext({ menopauseStatus: 'perimenopause' })).toBe(true)
    expect(hasMenopauseContext({ menopauseStatus: 'menopause' })).toBe(true)
    expect(hasMenopauseContext({ menopauseStatus: 'postmenopause' })).toBe(true)
  })

  it('is false for non-answers and absence', () => {
    expect(hasMenopauseContext({ menopauseStatus: 'not_applicable' })).toBe(false)
    expect(hasMenopauseContext({ menopauseStatus: 'prefer_not_to_say' })).toBe(false)
    expect(hasMenopauseContext({})).toBe(false)
    expect(hasMenopauseContext(null)).toBe(false)
    expect(hasMenopauseContext(undefined)).toBe(false)
  })
})
