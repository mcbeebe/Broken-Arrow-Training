/**
 * P10 — a resolved day writes itself into the athlete's own record.
 */
import { describe, it, expect } from 'vitest'
import { resolutionNote, FORBIDDEN_IN_NOTES } from '../utils/resolutionNote'

describe('what the journal records', () => {
  it('names where a moved session actually went', () => {
    expect(resolutionNote({ kind: 'move', workout: 'Station intervals', movedToDay: 'Sunday' }))
      .toBe('Moved Station intervals to Sunday. The week rebalanced around it.')
  })

  it('is honest when a move could not find a home', () => {
    // The engine falls back to a skip; the record says so rather than
    // claiming a move that never happened.
    expect(resolutionNote({ kind: 'move', workout: 'Tempo', movedToDay: null }))
      .toContain('no later day this week had room — skipped instead')
  })

  it('records a deliberate skip as a decision, with the doctrine attached', () => {
    const note = resolutionNote({ kind: 'skip', workout: 'Long run' })
    expect(note).toContain('on purpose')
    expect(note).toContain('bends forward')
  })

  it('records illness without penalty language', () => {
    const note = resolutionNote({ kind: 'illness', workout: 'Repeats' })
    expect(note).toContain('Easing back')
  })

  it('falls back to neutral wording when the plan named nothing', () => {
    expect(resolutionNote({ kind: 'skip', workout: '' })).toContain('The planned session')
  })
})

describe('the vocabulary rule', () => {
  it('never writes a word that reads as blame', () => {
    const kinds = ['skip', 'move', 'illness'] as const
    for (const kind of kinds) {
      for (const movedToDay of [null, 'Sunday']) {
        const note = resolutionNote({ kind, workout: 'Station intervals', movedToDay }).toLowerCase()
        for (const banned of FORBIDDEN_IN_NOTES) {
          expect(note, `${kind} note contained "${banned}"`).not.toContain(banned)
        }
      }
    }
  })

  it('writes in the first person — it is the athlete\'s record, not a report on them', () => {
    expect(resolutionNote({ kind: 'illness', workout: 'Repeats' })).toMatch(/\bI\b|my |sat .* out/i)
  })
})

/**
 * The wiring: resolving a day from Today has to actually reach the record.
 */
describe('where the note is written', () => {
  const APP = Object.values(import.meta.glob('../App.tsx', {
    query: '?raw', import: 'default', eager: true,
  }))[0] as string

  it('adds a journal note when a day is resolved', () => {
    expect(APP).toMatch(/journalNotes\.addNote\(\{[\s\S]*?resolutionNote\(/)
  })

  it('dates the note to the day being resolved, not to today', () => {
    // A Thursday resolved on Saturday belongs to Thursday in the record.
    expect(APP).toMatch(/dateISO: resolving\.iso/)
  })

  it('asks the engine where a move actually landed before claiming one', () => {
    expect(APP).toMatch(/kind === 'move' \? moveOutcomeFor\(weeks, resolving\.iso\) : null/)
  })
})
