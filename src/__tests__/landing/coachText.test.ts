/**
 * Initiative 003: the demo coach's header text (design-spec.md § Shared state).
 */
import { describe, it, expect } from 'vitest'
import { coachDisplayName, coachStatus } from '../../landing/coachText'
import { COACH, type TraitId } from '../../landing/content'

describe('coachDisplayName', () => {
  it.each([
    ['Mira', 'Mira'],
    ['  kip  ', 'kip'],
    ['', COACH.fallbackName],
    ['   ', COACH.fallbackName],
  ])('%j → %j', (input, shown) => {
    expect(coachDisplayName(input)).toBe(shown)
  })
})

describe('coachStatus', () => {
  it('lists traits in canonical order with a trailing period', () => {
    expect(coachStatus(new Set<TraitId>(['chill', 'funny', 'nerdy']))).toBe('Your coach. Funny, Data Nerd, Chill.')
  })

  it('is exactly copy.md’s prompt with no traits', () => {
    expect(coachStatus(new Set())).toBe(COACH.noTraits)
  })
})
