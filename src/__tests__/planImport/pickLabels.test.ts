import { describe, it, expect, vi, afterEach } from 'vitest'
import { badgeFor, sameUpload, sizeLabel } from '../../utils/planImport/pickLabels'
import { planImportOpenTo } from '../../utils/planImport/access'

/**
 * Initiative 004, PR 7: the picker's helpers, and the one gate both ways in
 * ask. `sameUpload` decides whether onboarding reads a plan again, and each
 * read is one of the day's uploads.
 */

afterEach(() => vi.unstubAllEnvs())

const file = (name: string, opts: { body?: string; type?: string; lastModified?: number } = {}) =>
  new File([opts.body ?? '%PDF-1.7'], name, { type: opts.type ?? 'application/pdf', lastModified: opts.lastModified ?? 1_760_000_000_000 })

describe('sameUpload', () => {
  it('the same file, or one chosen again, is the same pick', () => {
    const f = file('Plan.pdf')
    expect(sameUpload({ file: f }, { file: f })).toBe(true)
    expect(sameUpload({ file: f }, { file: file('Plan.pdf') })).toBe(true)
  })

  it('a file that differs in name, size, type or last edit is another pick', () => {
    const f = file('Plan.pdf')
    expect(sameUpload({ file: f }, { file: file('Plan 2.pdf') })).toBe(false)
    expect(sameUpload({ file: f }, { file: file('Plan.pdf', { body: '%PDF-1.7 edited' }) })).toBe(false)
    expect(sameUpload({ file: f }, { file: file('Plan.pdf', { type: 'text/plain' }) })).toBe(false)
    expect(sameUpload({ file: f }, { file: file('Plan.pdf', { lastModified: 1_760_000_000_001 }) })).toBe(false)
  })

  it('the note counts as it is sent, trimmed', () => {
    const f = file('Plan.pdf')
    expect(sameUpload({ file: f, hint: 'Intermediate' }, { file: f, hint: ' Intermediate ' })).toBe(true)
    expect(sameUpload({ file: f }, { file: f, hint: '  ' })).toBe(true)
    expect(sameUpload({ file: f, hint: 'Intermediate' }, { file: f, hint: 'Advanced' })).toBe(false)
  })

  it('pasted text counts exactly, and is never the same as a file', () => {
    expect(sameUpload({ text: 'Week 1' }, { text: 'Week 1' })).toBe(true)
    expect(sameUpload({ text: 'Week 1' }, { text: 'Week 1 ' })).toBe(false)
    expect(sameUpload({ text: 'Week 1' }, { file: file('Week 1') })).toBe(false)
    expect(sameUpload({ file: file('Week 1') }, { text: 'Week 1' })).toBe(false)
  })
})

describe('badgeFor and sizeLabel', () => {
  it('labels a file by its extension, a photo as IMG, and anything else as FILE', () => {
    expect(badgeFor(file('Plan.xlsx'))).toBe('XLSX')
    expect(badgeFor(file('IMG_0412.HEIC', { type: 'image/heic' }))).toBe('IMG')
    expect(badgeFor(file('plan'))).toBe('FILE')
    expect(badgeFor(file('plan.numbers'))).toBe('FILE')
  })

  it('states sizes in decimal units, as the limits are stated', () => {
    expect(sizeLabel(999)).toBe('999 B')
    expect(sizeLabel(15_000)).toBe('15 KB')
    expect(sizeLabel(15_000_000)).toBe('15.0 MB')
  })
})

describe('planImportOpenTo', () => {
  it('opens to the owner when the coach API is there, and to no one else', () => {
    vi.stubEnv('VITE_COACH_API_URL', 'https://api.example.test')
    expect(planImportOpenTo('mike')).toBe(true)
    expect(planImportOpenTo('jim')).toBe(false)
    expect(planImportOpenTo(undefined)).toBe(false)
  })

  it('stays shut without the coach API, even for the owner', () => {
    vi.stubEnv('VITE_COACH_API_URL', '')
    vi.stubEnv('VITE_GARMIN_API_URL', '')
    expect(planImportOpenTo('mike')).toBe(false)
  })
})
