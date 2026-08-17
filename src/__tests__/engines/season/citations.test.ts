import { describe, it, expect } from 'vitest'
import { bridgeEmphasis, EV_INTENSITY_PRESERVES, EV_FREQUENCY_HOLDS } from '../../../engines/season/residuals'
import { bridgeDayStream } from '../../../engines/season/blockWeeks'

// P0.7 — the intensity-preserves-fitness claim must cite Hickson 1985
// (PMID 3156841), not Hickson & Rosenkoetter 1981 (PMID 7219129), which
// is the reduced-frequency study. The v1 plan shipped the wrong year.
describe('season citations (P0.7)', () => {
  it('binds the intensity claim to Hickson 1985 via the evidence layer', () => {
    expect(EV_INTENSITY_PRESERVES.value).toBe('Hickson 1985')
    expect(EV_INTENSITY_PRESERVES.citation).toContain('3156841')
    expect(EV_FREQUENCY_HOLDS.citation).toContain('7219129')
  })

  it('bridge emphasis copy carries the corrected citation', () => {
    const toHyrox = bridgeEmphasis(true)
    expect(toHyrox.holdDose).toContain('Hickson 1985')
    expect(toHyrox.holdDose).not.toContain('Hickson 1981')
  })

  it('no athlete-facing bridge day cites Hickson 1981 for the intensity claim', () => {
    const stream = bridgeDayStream('2026-10-28', '2026-11-08', true)
    const text = stream.map(s => `${s.day.workout} ${s.day.detail} ${s.focus}`).join('\n')
    expect(text).toContain('Hickson 1985')
    expect(text).not.toContain('Hickson 1981')
  })
})
