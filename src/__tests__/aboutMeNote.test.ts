import { describe, it, expect } from 'vitest'
import { appendAboutMeNote } from '../utils/aboutMeNote'

describe('appendAboutMeNote', () => {
  it('writes the first note into an empty profile', () => {
    expect(appendAboutMeNote(null, 'Runs hot on the erg.')).toBe('Runs hot on the erg.')
    expect(appendAboutMeNote('', 'Runs hot on the erg.')).toBe('Runs hot on the erg.')
    expect(appendAboutMeNote('   ', 'Runs hot on the erg.')).toBe('Runs hot on the erg.')
  })

  it('adds a line without disturbing what is there', () => {
    expect(appendAboutMeNote('Line one.', 'Line two.')).toBe('Line one.\nLine two.')
  })

  it('does not repeat a note it has already written', () => {
    // Accepting the same calibration twice should not turn the profile into
    // a transcript of one fact.
    const once = appendAboutMeNote('Line one.', 'Line two.')
    expect(appendAboutMeNote(once, 'Line two.')).toBe(once)
  })

  it('matches an existing line even when it was stored with stray spacing', () => {
    expect(appendAboutMeNote('Line one.\n  Line two.  ', 'Line two.')).toBe('Line one.\n  Line two.')
  })

  it('ignores an empty note rather than adding a blank line', () => {
    expect(appendAboutMeNote('Line one.', '')).toBe('Line one.')
    expect(appendAboutMeNote('Line one.', '   ')).toBe('Line one.')
  })

  it('trims the profile it was handed, so a stored trailing newline cannot compound', () => {
    expect(appendAboutMeNote('Line one.\n\n', 'Line two.')).toBe('Line one.\nLine two.')
  })
})
