import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { TrainingPlan } from '../types'

// Render the letter from a known markdown body by stubbing the coach API +
// insight hook. The fix under test: the letter must render markdown (**bold**,
// # headings, - bullets) instead of printing the raw asterisks/hashes.
const { insightRef, capturedRef } = vi.hoisted(() => ({
  insightRef: { current: null as { text: string } | null },
  capturedRef: { current: null as { snapshot?: Record<string, unknown> } | null },
}))
vi.mock('../utils/coachApi', () => ({ coachApiAvailable: () => true }))
vi.mock('../hooks/useCoachInsight', () => ({
  useCoachInsight: (opts: { snapshot?: Record<string, unknown> }) => {
    capturedRef.current = opts
    return { insight: insightRef.current, loading: false, error: null }
  },
}))

import CoachLetter from '../components/CoachLetter'

beforeEach(() => cleanup())

const plan = {
  athlete: { name: 'Rita', maxHR: 175, currentBase: '~10 mi/wk', weeklyStructure: '5 days/week' },
  weeks: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, dates: '', miles: 10, focus: 'Build', days: [] })),
  zones: [],
  race: { name: 'MDI Half', date: '2026-10-18', distance: 'Half Marathon', distanceMiles: 13.1 },
} as unknown as TrainingPlan

const config = {
  raceType: 'road', raceName: 'MDI Half', raceDate: '2026-10-18',
  experienceLevel: 'beginner', trainingDaysPerWeek: 5, wearable: 'none',
  athleteName: 'Rita', age: 45, completedAt: '',
} as unknown as OnboardingConfig

const renderLetter = () =>
  render(<CoachLetter plan={plan} config={config} athleteId="a1" onContinue={() => {}} />)

describe('CoachLetter markdown rendering', () => {
  it('renders **bold** sections as <strong>, not literal asterisks', () => {
    insightRef.current = {
      text: 'Here is the plan.\n\n- **5 days/week**, built around your base\n- **Progressive long runs** that build your engine',
    }
    const { container } = renderLetter()
    expect(container.querySelectorAll('strong').length).toBeGreaterThanOrEqual(2)
    expect(container.textContent).not.toContain('**')
    expect(screen.getByText('5 days/week')).toBeInTheDocument()
  })

  it('renders a # heading without the literal hash', () => {
    insightRef.current = { text: '# Welcome to Your MDI Half Campaign\n\nLet us get to work.' }
    const { container } = renderLetter()
    expect(container.textContent).not.toContain('# Welcome')
    expect(screen.getByText('Welcome to Your MDI Half Campaign')).toBeInTheDocument()
  })
})


// ── The letter must see the WHOLE season (field bug: an athlete listed 4
//    races and the letter only talked about one) ─────────────────────────

describe('CoachLetter season context', () => {
  it('hands the coach every season race with format, priority, and integration', () => {
    insightRef.current = { text: 'ok' }
    const seasonConfig = {
      ...config,
      goalMode: 'season',
      athleteGoal: 'sub-1:45 and a strong first Hyrox',
      additionalRaces: [
        { name: 'Anaheim Open', date: '2026-12-12', priority: 'A', format: 'hyrox', integration: 'layered', description: 'first Hyrox, finish strong' },
        { name: 'Turkey Trot', date: '2026-11-26', priority: 'C', format: 'road' },
        { name: 'CIM Marathon', date: '2027-04-11', priority: 'A', format: 'road' },
      ],
    } as unknown as OnboardingConfig
    render(<CoachLetter plan={plan} config={seasonConfig} athleteId="a1" onContinue={() => {}} />)

    const season = String((capturedRef.current?.snapshot as { seasonContext?: string })?.seasonContext ?? '')
    expect(season).toContain('4-race season')
    expect(season).toContain('MDI Half')          // anchor, race 1
    expect(season).toContain('Anaheim Open')
    expect(season).toContain('LAYERED into the current build')
    expect(season).toContain('Turkey Trot')
    expect(season).toContain('CIM Marathon')
    expect(season).toContain('first Hyrox, finish strong') // descriptions travel too
  })

  it('GUARD: a single-race athlete sends no season context (no phantom season)', () => {
    insightRef.current = { text: 'ok' }
    render(<CoachLetter plan={plan} config={config} athleteId="a1" onContinue={() => {}} />)
    expect((capturedRef.current?.snapshot as { seasonContext?: string })?.seasonContext).toBeUndefined()
  })
})
