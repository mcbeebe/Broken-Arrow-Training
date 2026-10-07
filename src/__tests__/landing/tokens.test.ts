/**
 * Initiative 003: tokens.ts is the Signal palette from tokens.json, whose text
 * pairs were contrast-checked. A color edited in one and not the other would
 * ship an unchecked pair.
 */
import { describe, it, expect } from 'vitest'
import tokens from '../../../docs/initiatives/003-landing-page/tokens.json'
import { SIGNAL } from '../../landing/tokens'

describe('tokens.ts', () => {
  it('is the approved palette', () => {
    expect(tokens.palette.approved).toBe('signal')
  })

  it('matches tokens.json’s Signal palette exactly', () => {
    expect(SIGNAL).toEqual(tokens.palette.signal)
  })
})
