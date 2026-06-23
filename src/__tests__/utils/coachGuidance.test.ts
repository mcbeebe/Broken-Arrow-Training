/**
 * R6 / R10 / R11 / R12 (PR-7) — coach guidance lines + their gating.
 */
import { describe, it, expect } from 'vitest'
import {
  raceExecutionSummaryLine, mentalSummaryLine, cycleContextLine, mastersContextLine,
} from '../../utils/coachGuidance'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

const cfg = (o: Partial<OnboardingConfig> = {}): OnboardingConfig => ({
  raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
  athleteName: 'T', age: 35, completedAt: '', ...o,
})

describe('R6 — race execution / pacing', () => {
  it('gives a Rule-of-Thirds line for long races', () => {
    expect(raceExecutionSummaryLine(26.2, false)).toMatch(/rule of thirds/i)
  })
  it('adds a power-hike note for trail races only', () => {
    expect(raceExecutionSummaryLine(50, true)).toMatch(/power-?hike/i)
    expect(raceExecutionSummaryLine(26.2, false)).not.toMatch(/power-?hike/i)
  })
  it('GUARD: null for a short race', () => {
    expect(raceExecutionSummaryLine(6.2, false)).toBeNull()
  })
})

describe('R10 — mental skills', () => {
  it('gives concrete, rehearsable skills', () => {
    const line = mentalSummaryLine()
    expect(line).toMatch(/mantra/i)
    expect(line).toMatch(/process/i)
  })
})

describe('R11 — cycle awareness (gated)', () => {
  it('applies to a premenopausal female with a RED-S flag', () => {
    const line = cycleContextLine(cfg({ sex: 'female', age: 30 }))
    expect(line).toMatch(/RED-S/i)
  })
  it('GUARD: not for males', () => {
    expect(cycleContextLine(cfg({ sex: 'male', age: 30 }))).toBeNull()
  })
  it('GUARD: not for menopausal athletes (handled by the menopause overlay)', () => {
    expect(cycleContextLine(cfg({ sex: 'female', age: 50, menopauseStatus: 'menopause' }))).toBeNull()
  })
})

describe('R12 — masters load (gated)', () => {
  it('applies at age ≥ 50', () => {
    expect(mastersContextLine(cfg({ age: 55 }))).toMatch(/recover/i)
  })
  it('GUARD: not for a younger athlete', () => {
    expect(mastersContextLine(cfg({ age: 30 }))).toBeNull()
  })
})
