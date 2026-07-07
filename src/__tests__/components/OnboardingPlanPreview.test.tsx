import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnboardingPlanPreview, { buildPreview } from '../../components/OnboardingPlanPreview'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

/**
 * G3 — the live preview must be REAL (the athlete's actual generated week 1,
 * not a template) and must never be able to block onboarding (bad partial
 * config → null → the flow continues).
 */

function partialConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Broken Arrow 18K',
    raceDate: '2026-10-18',
    raceDistance: 'marathon',
    experienceLevel: 'intermediate',
    detailLevel: 'balanced',
    trainingDaysPerWeek: 4, // provisional default — DAYS not asked yet
    wearable: 'none',
    athleteName: '',
    age: 40,
    maxHR: 180,
    fitnessAnchor: { type: 'race_5k', valueSeconds: 21 * 60 + 30 },
    completedAt: '',
    ...overrides,
  } as OnboardingConfig
}

describe('buildPreview (G3)', () => {
  it('generates a real plan + method match from a partial trail config', () => {
    const p = buildPreview(partialConfig())!
    expect(p).not.toBeNull()
    expect(p.plan.weeks.length).toBeGreaterThan(0)
    expect(p.plan.weeks[0].days.length).toBeGreaterThan(0)
    expect(p.methodName).toBeTruthy() // a named method, not a house template
  })

  it('handles the hyrox path (no method library)', () => {
    const p = buildPreview(partialConfig({ raceType: 'hyrox', raceDistance: undefined }))!
    expect(p).not.toBeNull()
    expect(p.plan.weeks.length).toBeGreaterThan(0)
  })

  it('handles the general-fitness path', () => {
    const p = buildPreview(partialConfig({
      raceType: 'general', raceDistance: undefined, generalGoal: 'stay_healthy',
    }))!
    expect(p).not.toBeNull()
    expect(p.plan.weeks.length).toBeGreaterThan(0)
  })

  it('GUARD: an unusable partial config returns null, never throws', () => {
    expect(buildPreview(partialConfig({ raceType: 'trail', raceDistance: undefined }))).toBeNull()
  })
})

describe('<OnboardingPlanPreview />', () => {
  it('renders the week-1 preview with the method name', () => {
    render(<OnboardingPlanPreview config={partialConfig()} />)
    expect(screen.getByTestId('plan-preview')).toBeInTheDocument()
    expect(screen.getByText(/week 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Best-fit training system/i)).toBeInTheDocument()
  })

  it('renders the keep-going fallback instead of crashing on a bad config', () => {
    render(<OnboardingPlanPreview config={partialConfig({ raceDistance: undefined })} />)
    expect(screen.queryByTestId('plan-preview')).toBeNull()
    expect(screen.getByText(/Keep going/)).toBeInTheDocument()
  })
})
