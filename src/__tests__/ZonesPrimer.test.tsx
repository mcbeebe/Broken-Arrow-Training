import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ZonesPrimer from '../components/ZonesPrimer'
import type { TrainingPlan } from '../types'
import type { TrainingMethod } from '../types/training-method'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import fitzgerald from '../data/methods/fitzgerald_8020.json'

beforeEach(() => cleanup())

const fitzgeraldMethod = fitzgerald as unknown as TrainingMethod

function basePlan(maxHR: number): TrainingPlan {
  return {
    athlete: {
      name: 'Mike',
      maxHR,
      currentBase: '~20 mi/wk',
      weeklyStructure: '5 days/week',
    },
    weeks: [],
    zones: [
      { zone: 'Z1 – Recovery', hr: `${Math.round(maxHR * 0.6)}–${Math.round(maxHR * 0.7)}`, pct: '60–70%', desc: 'Recovery' },
      { zone: 'Z2 – Aerobic',  hr: `${Math.round(maxHR * 0.71)}–${Math.round(maxHR * 0.78)}`, pct: '71–78%', desc: 'Aerobic' },
      { zone: 'Z3 – Tempo',    hr: `${Math.round(maxHR * 0.78)}–${Math.round(maxHR * 0.83)}`, pct: '78–83%', desc: 'Tempo' },
      { zone: 'Z4 – Threshold', hr: `${Math.round(maxHR * 0.83)}–${Math.round(maxHR * 0.88)}`, pct: '83–88%', desc: 'Threshold' },
      { zone: 'Z5 – VO2 / Max', hr: `${Math.round(maxHR * 0.88)}–${maxHR}`, pct: '88–100%', desc: 'VO2' },
    ],
    race: { name: 'Test', date: '', startTime: '', distance: 'Marathon', distanceMiles: 26.2, elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '' },
  }
}

function baseConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test',
    raceDate: '',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 35,
    maxHR: 200,
    completedAt: '',
    ...overrides,
  }
}

describe('ZonesPrimer', () => {
  it("renders every zone the method defines with bpm + % of max HR", () => {
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig()}
      onContinue={vi.fn()}
      onRefineZones={vi.fn()}
    />)
    // Fitzgerald 8020's zone names appear, not generic Z1–Z5 labels.
    expect(screen.getByText(/Zone 2 \(Aerobic\)/i)).toBeInTheDocument()
    // bpm values render
    const bpmEls = screen.getAllByText(/\d+–\d+ bpm/)
    expect(bpmEls.length).toBeGreaterThanOrEqual(4)
    // Percent-of-max appears alongside the bpm
    expect(screen.getAllByText(/% of max HR/).length).toBeGreaterThan(0)
  })

  it("uses method-specific framing in zone descriptions", () => {
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig()}
      onContinue={vi.fn()}
      onRefineZones={vi.fn()}
    />)
    // Fitzgerald's Z2 purpose mentions 80/20 framing.
    expect(screen.getAllByText(/80\/20/i).length).toBeGreaterThan(0)
  })

  it("explains how zones were derived when only maxHR was provided", () => {
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig({ fitnessAnchor: undefined })}
      onContinue={vi.fn()}
      onRefineZones={vi.fn()}
    />)
    expect(screen.getByText(/max HR \(200 bpm\)/)).toBeInTheDocument()
    expect(screen.getByText(/estimate your lactate threshold at 88%/)).toBeInTheDocument()
  })

  it("explains differently when LTHR was provided directly", () => {
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig({ fitnessAnchor: { type: 'lthr', bpm: 175 } })}
      onContinue={vi.fn()}
      onRefineZones={vi.fn()}
    />)
    expect(screen.getByText(/LTHR is 175 bpm/i)).toBeInTheDocument()
    expect(screen.getByText(/calibrated to you/i)).toBeInTheDocument()
  })

  it("explains differently when a race time was provided", () => {
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig({ fitnessAnchor: { type: 'race_5k', valueSeconds: 1290 } })}
      onContinue={vi.fn()}
      onRefineZones={vi.fn()}
    />)
    expect(screen.getByText(/recent 5K/i)).toBeInTheDocument()
    expect(screen.getByText(/VDOT/i)).toBeInTheDocument()
  })

  it("fires onContinue when the primary CTA is tapped", () => {
    const onContinue = vi.fn()
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig()}
      onContinue={onContinue}
      onRefineZones={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it("fires onRefineZones when the 'refine' card is tapped", () => {
    const onRefineZones = vi.fn()
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={fitzgeraldMethod}
      config={baseConfig()}
      onContinue={vi.fn()}
      onRefineZones={onRefineZones}
    />)
    fireEvent.click(screen.getByText(/Want tighter zones/i))
    expect(onRefineZones).toHaveBeenCalledTimes(1)
  })

  it("falls back to plan.zones when no method is provided", () => {
    render(<ZonesPrimer
      plan={basePlan(200)}
      method={undefined}
      config={baseConfig()}
      onContinue={vi.fn()}
      onRefineZones={vi.fn()}
    />)
    expect(screen.getByText(/Z2 – Aerobic/)).toBeInTheDocument()
  })
})
