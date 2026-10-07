/**
 * Initiative 003: the demo coach's header text (design-spec.md § Shared state).
 */
import { describe, it, expect } from 'vitest'
import { coachDisplayName, coachStatus } from '../../landing/coachText'
import { COACH, MAKE } from '../../landing/content'

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
  it.each(MAKE.traits.map(t => [t.id, t.label] as const))('%s → “Your coach. %s.”', (id, label) => {
    expect(coachStatus(id)).toBe(`Your coach. ${label}.`)
  })
})
