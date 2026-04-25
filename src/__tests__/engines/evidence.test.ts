import { describe, it, expect } from 'vitest'
import {
  TIER_LABELS,
  tier,
  type EvidenceTier,
  type TieredValue,
} from '../../engines/evidence'

describe('EvidenceTier (PR-02)', () => {
  it('TIER_LABELS covers all four tiers', () => {
    const keys = Object.keys(TIER_LABELS).sort()
    expect(keys).toEqual(['T1', 'T2', 'T3', 'T4'])
    for (const k of keys) {
      expect(TIER_LABELS[k as EvidenceTier]).toMatch(/.+/)
    }
  })

  it('tier() builds a TieredValue with the supplied fields (AC1)', () => {
    const v: TieredValue<number> = tier(0.45, 'T1', 'Hyldahl 2017 PMID 27782911')
    expect(v.value).toBe(0.45)
    expect(v.tier).toBe('T1')
    expect(v.citation).toBe('Hyldahl 2017 PMID 27782911')
    expect(v.url).toBeUndefined()
  })

  it('tier() accepts an optional url and threads it through', () => {
    const v = tier(2.0, 'T3', 'Minetti 2002', 'https://pubmed.ncbi.nlm.nih.gov/12183501/')
    expect(v.url).toBe('https://pubmed.ncbi.nlm.nih.gov/12183501/')
  })

  it('tier() accepts non-numeric value types (generic T)', () => {
    const v: TieredValue<string> = tier('GREEN', 'T4', 'coaching heuristic')
    expect(v.value).toBe('GREEN')
    expect(v.tier).toBe('T4')
  })

  it('AC2: assigning a non-T1..T4 tier is a type error at compile time', () => {
    // @ts-expect-error — 'T5' is not assignable to EvidenceTier
    const bad: EvidenceTier = 'T5'
    // runtime side: the assertion above is purely type-level; we still touch
    // `bad` so the variable is not flagged unused.
    expect(typeof bad).toBe('string')
  })
})
