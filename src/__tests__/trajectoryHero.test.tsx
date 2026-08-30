/**
 * The trajectory hero renders the honest number and never over-claims.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TrajectoryHero from '../components/TrajectoryHero'
import { buildTrajectory } from '../utils/trajectory'

const clk = (h: number, m: number) => h * 3600 + m * 60
const base = { raceMiles: 13.1, weeksElapsed: 4, totalWeeks: 8, raceLabel: 'half' }

describe('TrajectoryHero', () => {
  it('leads with the projected time and the closing headline', () => {
    render(<TrajectoryHero trajectory={buildTrajectory({ ...base, currentVdot: 45, goalSeconds: clk(1, 35) })!} />)
    const hero = screen.getByTestId('trajectory-hero')
    expect(hero.getAttribute('data-status')).toBe('closing')
    expect(hero.textContent).toContain('closing on 1:35:00')
  })

  it('states plainly that it is not a race prediction', () => {
    render(<TrajectoryHero trajectory={buildTrajectory({ ...base, currentVdot: 45, goalSeconds: null })!} />)
    expect(screen.getByTestId('trajectory-hero').textContent).toContain('Not a course-adjusted race prediction')
  })

  it('shows the honest target when the goal is a reach', () => {
    const t = buildTrajectory({ ...base, currentVdot: 45, goalSeconds: clk(1, 20) })!
    render(<TrajectoryHero trajectory={t} />)
    const hero = screen.getByTestId('trajectory-hero')
    expect(hero.getAttribute('data-status')).toBe('reach')
    expect(hero.textContent).toContain(t.realisticClock)
  })

  it('marks a met goal, and hides the goal bar when there is no goal', () => {
    const met = buildTrajectory({ ...base, currentVdot: 50, goalSeconds: clk(1, 35) })!
    const { rerender } = render(<TrajectoryHero trajectory={met} />)
    expect(screen.getByTestId('trajectory-hero').textContent).toContain('at your goal')
    rerender(<TrajectoryHero trajectory={buildTrajectory({ ...base, currentVdot: 45, goalSeconds: null })!} />)
    // No goal → no goal bar (the "goal <clock> ↑" progress label is gone).
    expect(screen.getByTestId('trajectory-hero').textContent).not.toContain('↑')
  })
})

describe('the wiring stays honest (source guard)', () => {
  const DASH = Object.values(import.meta.glob('../components/Dashboard.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
  it('mounts the hero from trajectoryFromConfig, above the Hyrox projection', () => {
    expect(DASH).toMatch(/trajectoryFromConfig\(onboardingConfig/)
    expect(DASH).toMatch(/<TrajectoryHero/)
    expect(DASH.indexOf('<TrajectoryHero')).toBeLessThan(DASH.indexOf('<HyroxProjectionCard'))
  })
})
