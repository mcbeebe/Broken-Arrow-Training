/**
 * P14 — the plan-advisory pile.
 *
 * From the device: seven advisory cards stacked above the day's answer on
 * Today, every morning, about a plan generated weeks earlier. These tests pin
 * the two properties that make the move safe — the notes are never lost, and
 * "already read" is keyed to the notes themselves rather than to a flag.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { PlanAdvisory } from '../types'
import {
  sortNotes, notesSignature, notesSeen, markNotesSeen, clearNotesSeen, notesRowText,
  shouldShowNotesRow,
} from '../utils/planNotes'

const note = (id: string, severity: PlanAdvisory['severity'] = 'info'): PlanAdvisory => ({
  id, severity, title: id, detail: `detail for ${id}`,
})

/** The seven from Mike's Oakland Hills build, in the order they arrived. */
const SEVEN: PlanAdvisory[] = [
  note('experience_vs_mileage', 'caution'),
  note('tight_runway', 'caution'),
  note('under_race_ready_volume', 'critical'),
  note('workload_fit', 'caution'),
  note('one_extra_day', 'info'),
  note('three_hard_days', 'caution'),
  note('heavy_strength_before_hard', 'caution'),
]

beforeEach(() => { localStorage.clear() })

describe('sortNotes', () => {
  it('puts the serious ones first', () => {
    expect(sortNotes(SEVEN)[0].id).toBe('under_race_ready_volume')
  })

  it('holds the engine’s own order within a severity', () => {
    const cautions = sortNotes(SEVEN).filter(n => n.severity === 'caution').map(n => n.id)
    expect(cautions).toEqual([
      'experience_vs_mileage', 'tight_runway', 'workload_fit',
      'three_hard_days', 'heavy_strength_before_hard',
    ])
  })

  it('loses nothing — every note survives the move', () => {
    expect(sortNotes(SEVEN).map(n => n.id).sort()).toEqual(SEVEN.map(n => n.id).sort())
  })

  it('does not mutate the caller’s array', () => {
    // Built fresh and compared to a literal: comparing against the shared
    // fixture hid an in-place sort, because an earlier test had already
    // re-ordered the fixture through the same bug.
    const input = [note('a', 'info'), note('b', 'critical'), note('c', 'caution')]
    sortNotes(input)
    expect(input.map(n => n.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('notesSignature', () => {
  it('ignores order — a re-sort is not new news', () => {
    expect(notesSignature([...SEVEN].reverse())).toBe(notesSignature(SEVEN))
  })

  it('changes when a note is added or removed', () => {
    expect(notesSignature(SEVEN.slice(1))).not.toBe(notesSignature(SEVEN))
    expect(notesSignature([...SEVEN, note('new_one')])).not.toBe(notesSignature(SEVEN))
  })

  it('is unmoved by a duplicated id', () => {
    expect(notesSignature([...SEVEN, SEVEN[0]])).toBe(notesSignature(SEVEN))
  })
})

describe('reading the notes', () => {
  it('starts unread', () => {
    expect(notesSeen('mike', SEVEN)).toBe(false)
  })

  it('stays read once read', () => {
    markNotesSeen('mike', SEVEN)
    expect(notesSeen('mike', SEVEN)).toBe(true)
  })

  it('asks again when the plan is regenerated with different notes', () => {
    markNotesSeen('mike', SEVEN)
    expect(notesSeen('mike', [...SEVEN, note('new_runway_problem', 'critical')])).toBe(false)
  })

  it('does not carry one athlete’s reading over to another', () => {
    markNotesSeen('mike', SEVEN)
    expect(notesSeen('jim', SEVEN)).toBe(false)
  })

  it('has nothing to ask about when there are no notes', () => {
    expect(notesSeen('mike', [])).toBe(true)
  })

  it('can be reset', () => {
    markNotesSeen('mike', SEVEN)
    clearNotesSeen('mike')
    expect(notesSeen('mike', SEVEN)).toBe(false)
  })
})

describe('the Today row’s sentence', () => {
  it('counts, and says when something is serious', () => {
    expect(notesRowText(SEVEN)).toBe('Your plan has 7 things to flag — some are serious')
  })

  it('stays plain when nothing is critical', () => {
    const mild = SEVEN.filter(n => n.severity !== 'critical')
    expect(notesRowText(mild)).toBe('Your plan has 6 things worth knowing')
  })

  it('gets the singular right', () => {
    expect(notesRowText([note('tight_runway', 'caution')])).toBe('Your plan has 1 thing worth knowing')
    expect(notesRowText([note('under_volume', 'critical')])).toBe('Your plan has 1 thing to flag — one is serious')
  })

  it('never uses a word that blames the athlete', () => {
    const text = `${notesRowText(SEVEN)} ${notesRowText([note('a')])}`.toLowerCase()
    for (const banned of ['missed', 'failed', 'behind', 'should have']) {
      expect(text, banned).not.toContain(banned)
    }
  })
})

describe('whether Today says anything at all', () => {
  it('speaks once, when there are unread notes', () => {
    expect(shouldShowNotesRow(SEVEN, false)).toBe(true)
  })

  it('goes quiet once they have been read', () => {
    // This is the whole point: the pile came down and does not reassemble.
    expect(shouldShowNotesRow(SEVEN, true)).toBe(false)
  })

  it('says nothing about a plan with nothing to flag', () => {
    expect(shouldShowNotesRow([], false)).toBe(false)
    expect(shouldShowNotesRow([], true)).toBe(false)
  })

  it('speaks again for a regenerated plan, because the reading is per set', () => {
    markNotesSeen('mike', SEVEN)
    const rebuilt = [...SEVEN, note('new_runway_problem', 'critical')]
    expect(shouldShowNotesRow(rebuilt, notesSeen('mike', rebuilt))).toBe(true)
    expect(shouldShowNotesRow(SEVEN, notesSeen('mike', SEVEN))).toBe(false)
  })
})
