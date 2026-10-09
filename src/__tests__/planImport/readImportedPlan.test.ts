import { describe, it, expect } from 'vitest'
import { IMPORT_LIMITS, readImportedPlan, type ImportedPlanV1 } from '../../utils/planImport/types'
import { isImportedPlan, type OnboardingConfig } from '../../hooks/useOnboarding'

function plan(overrides: Partial<ImportedPlanV1> = {}): ImportedPlanV1 {
  return {
    v: 1,
    source: { name: 'Marathon-18wk-plan.pdf', kind: 'pdf', importedAt: '2026-10-08T12:00:00.000Z' },
    title: 'Spring Marathon Plan',
    sport: 'road',
    raceDistance: 'Marathon',
    weeks: [
      {
        focus: 'Base',
        sessions: [
          { day: 2, type: 'run', title: 'Easy run', detail: 'Conversational pace', distanceMi: 6, intensity: 'easy' },
          { day: 4, type: 'quality', title: 'Tempo', detail: '4 mi at tempo', distanceMi: 7, intensity: 'tempo' },
          { day: 7, type: 'long', title: 'Long run', distanceMi: 14, durationMin: 130 },
        ],
      },
    ],
    notes: ['Week 6 lists two sessions on Wednesday.'],
    ...overrides,
  }
}

describe('readImportedPlan', () => {
  it('reads back a clean plan unchanged', () => {
    const p = plan()
    expect(readImportedPlan(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('returns a copy and never mutates what it was given', () => {
    const raw = JSON.parse(JSON.stringify(plan({ title: '  Padded title  ' })))
    const before = JSON.stringify(raw)
    const read = readImportedPlan(raw)
    expect(read?.title).toBe('Padded title')
    expect(JSON.stringify(raw)).toBe(before)
  })

  it.each([
    ['null', null],
    ['a string', 'plan'],
    ['an array', []],
    ['another version', { ...plan(), v: 2 }],
    ['no source', { ...plan(), source: undefined }],
    ['an unknown source kind', { ...plan(), source: { name: 'x.pages', kind: 'pages', importedAt: '2026-10-08' } }],
    ['a blank source name', { ...plan(), source: { name: '  ', kind: 'pdf', importedAt: '2026-10-08' } }],
    ['no import time', { ...plan(), source: { name: 'x.pdf', kind: 'pdf' } }],
    ['an unknown sport', { ...plan(), sport: 'swimming' }],
    ['no weeks', { ...plan(), weeks: [] }],
    ['weeks that are not an array', { ...plan(), weeks: { 1: [] } }],
    ['a week without a sessions list', { ...plan(), weeks: [{ focus: 'Base' }] }],
  ])('refuses a plan with %s', (_label, raw) => {
    expect(readImportedPlan(raw)).toBeNull()
  })

  it('refuses more weeks than the limit allows', () => {
    const weeks = Array.from({ length: IMPORT_LIMITS.maxWeeks + 1 }, () => ({ sessions: [] }))
    expect(readImportedPlan({ ...plan(), weeks })).toBeNull()
    expect(readImportedPlan({ ...plan(), weeks: weeks.slice(1) })?.weeks).toHaveLength(IMPORT_LIMITS.maxWeeks)
  })

  it('refuses a week with more sessions than the limit allows', () => {
    const sessions = Array.from({ length: IMPORT_LIMITS.maxSessionsPerWeek + 1 }, () => ({ day: 1, type: 'run', title: 'Run' }))
    expect(readImportedPlan({ ...plan(), weeks: [{ sessions }] })).toBeNull()
  })

  it('drops a malformed session but keeps the plan around it', () => {
    const good = { day: 3, type: 'run', title: 'Kept' }
    const read = readImportedPlan({
      ...plan(),
      weeks: [{
        sessions: [
          good,
          { day: 0, type: 'run', title: 'Day zero' },
          { day: 8, type: 'run', title: 'Day eight' },
          { day: 2.5, type: 'run', title: 'Half a day' },
          { day: 2, type: 'swim', title: 'Unknown type' },
          { day: 2, type: 'run', title: '   ' },
          { day: 2, type: 'run' },
          'not a session',
          null,
        ],
      }],
    })
    expect(read?.weeks[0].sessions).toEqual([good])
  })

  it('caps text, strips control characters and falls back to the file name for a title', () => {
    const read = readImportedPlan({
      ...plan(),
      title: 123,
      weeks: [{
        focus: 'x'.repeat(500),
        sessions: [{ day: 1, type: 'run', title: `Easy\u0007 run${'!'.repeat(300)}`, detail: 'Line one\nLine two' }],
      }],
    })
    expect(read?.title).toBe('Marathon-18wk-plan.pdf')
    expect(read?.weeks[0].focus).toHaveLength(IMPORT_LIMITS.focus)
    const s = read!.weeks[0].sessions[0]
    expect(s.title.startsWith('Easy run')).toBe(true)
    expect(s.title).toHaveLength(IMPORT_LIMITS.title)
    expect(s.detail).toBe('Line one\nLine two')
  })

  it('never cuts an emoji in half at the length cap', () => {
    const title = `${'a'.repeat(IMPORT_LIMITS.title - 1)}🏃 and more`
    const read = readImportedPlan({ ...plan(), title })
    expect(read?.title).toBe('a'.repeat(IMPORT_LIMITS.title - 1))
    expect(read?.title).not.toMatch(/[\uD800-\uDBFF]$/)
  })

  it('drops numbers that are not positive and finite, and caps huge ones', () => {
    const read = readImportedPlan({
      ...plan(),
      weeks: [{
        sessions: [
          { day: 1, type: 'run', title: 'Negative', distanceMi: -3, durationMin: 0 },
          { day: 2, type: 'run', title: 'Not numbers', distanceMi: '6', durationMin: Number.NaN },
          { day: 3, type: 'run', title: 'Huge', distanceMi: 9999, durationMin: 99999 },
          { day: 4, type: 'run', title: 'Unknown effort', intensity: 'brutal' },
        ],
      }],
    })
    const [neg, str, huge, effort] = read!.weeks[0].sessions
    expect(neg.distanceMi).toBeUndefined()
    expect(neg.durationMin).toBeUndefined()
    expect(str.distanceMi).toBeUndefined()
    expect(str.durationMin).toBeUndefined()
    expect(huge.distanceMi).toBe(IMPORT_LIMITS.maxDistanceMi)
    expect(huge.durationMin).toBe(IMPORT_LIMITS.maxDurationMin)
    expect(effort.intensity).toBeUndefined()
  })

  it('keeps only usable notes, up to the limit', () => {
    const notes = ['  ', 7, 'Real note', ...Array.from({ length: 30 }, (_, i) => `Note ${i}`)]
    const read = readImportedPlan({ ...plan(), notes })
    expect(read?.notes?.[0]).toBe('Real note')
    expect(read?.notes).toHaveLength(IMPORT_LIMITS.maxNotes)
    expect(readImportedPlan({ ...plan(), notes: 'one note' })?.notes).toBeUndefined()
  })
})

describe('isImportedPlan', () => {
  const base = { raceType: 'road', athleteName: 'A' } as OnboardingConfig
  it('is true only when the config carries an uploaded plan, readable or not', () => {
    expect(isImportedPlan(null)).toBe(false)
    expect(isImportedPlan(undefined)).toBe(false)
    expect(isImportedPlan(base)).toBe(false)
    expect(isImportedPlan({ ...base, importedPlan: plan() })).toBe(true)
    expect(isImportedPlan({ ...base, importedPlan: { v: 9 } as unknown as ImportedPlanV1 })).toBe(true)
  })
})
