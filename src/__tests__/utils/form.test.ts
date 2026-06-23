/**
 * R9 (PR-6) — form & cadence cues.
 */
import { describe, it, expect } from 'vitest'
import { formSummaryLine } from '../../utils/form'

describe('formSummaryLine', () => {
  it('gives concrete cadence + posture cues', () => {
    const line = formSummaryLine()
    expect(line).toMatch(/170.?180/)
    expect(line).toMatch(/hip.?hinge/i)
    expect(line).toMatch(/center of mass|overstride|brak/i)
  })
})
