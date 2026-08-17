/**
 * The Hyrox heuristics registry: every prescription constant the engine
 * uses must be tiered, cited, and actually consumed — so the unverified
 * surface stays enumerable and behavior can't drift from the documented
 * values (the methodology-audit contract, docs/hyrox-evidence-audit.md).
 */
import { describe, it, expect } from 'vitest'
import { HYROX_HEURISTICS, STATION_RAMP, FULL_SIM_DAYS_OUT, HALF_SIM_DAYS_OUT, SPEC_DAY_DAYS_OUT } from '../../../engines/hyrox/heuristics'
import { HYROX_SPEC_EVIDENCE } from '../../../engines/hyrox/spec'

describe('hyrox heuristics registry', () => {
  it('every constant carries a tier and a non-trivial citation', () => {
    const entries = Object.entries(HYROX_HEURISTICS)
    expect(entries.length).toBeGreaterThanOrEqual(8)
    for (const [name, tv] of entries) {
      expect(['T1', 'T2', 'T3', 'T4'], `${name} tier`).toContain(tv.tier)
      expect(tv.citation.length, `${name} citation`).toBeGreaterThan(40)
    }
    expect(HYROX_SPEC_EVIDENCE.tier).toBe('T3')
  })

  it('simulation windows are ordered and non-overlapping (spec day > half sim > full sim > race)', () => {
    expect(FULL_SIM_DAYS_OUT.value.min).toBeGreaterThanOrEqual(7)
    expect(HALF_SIM_DAYS_OUT.value.min).toBeGreaterThan(FULL_SIM_DAYS_OUT.value.max)
    expect(SPEC_DAY_DAYS_OUT.value.min).toBeGreaterThanOrEqual(HALF_SIM_DAYS_OUT.value.min)
  })

  it('the station ramp opens submaximal and finishes at race spec', () => {
    const r = STATION_RAMP.value
    expect(r.startPct).toBeGreaterThan(0.2)
    expect(r.startPct).toBeLessThan(1)
    expect(r.endPct).toBe(1)
    expect(r.recoveryMult).toBeLessThan(1)
  })
})
