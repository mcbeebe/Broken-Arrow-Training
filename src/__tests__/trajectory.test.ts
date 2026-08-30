/**
 * The road/trail trajectory — the fitness-equivalent "where this is heading"
 * number for a runner. Values are grounded in the real VDOT model
 * (predictRaceTime): at a half, VDOT 45 → ~1:40, VDOT 48 → ~1:35, VDOT 50 →
 * ~1:31; a realistic block adds ~8% VDOT.
 */
import { describe, it, expect } from 'vitest'
import { buildTrajectory, trajectoryFromConfig, formatClock } from '../utils/trajectory'
import type { OnboardingConfig } from '../hooks/useOnboarding'

const HALF = 13.1
const clk = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s

describe('formatClock', () => {
  it('renders h:mm:ss and m:ss', () => {
    expect(formatClock(clk(1, 35, 0))).toBe('1:35:00')
    expect(formatClock(clk(0, 24, 5))).toBe('24:05')
    expect(formatClock(-10)).toBe('0:00')
  })
})

describe('buildTrajectory — status against a goal', () => {
  const base = { raceMiles: HALF, weeksElapsed: 4, totalWeeks: 8, raceLabel: 'half' }

  it('is "closing" when the goal sits within a realistic block gain', () => {
    // VDOT 45: today ~1:40, realistic ~1:33:43 — a 1:35 goal is in between.
    const t = buildTrajectory({ ...base, currentVdot: 45, goalSeconds: clk(1, 35) })!
    expect(t.status).toBe('closing')
    expect(t.headline).toBe('Closing on 1:35:00')
    expect(t.note).toContain('within a strong block')
    expect(t.projectedSeconds).toBeGreaterThan(t.goalSeconds!)   // not there yet
    expect(t.realisticSeconds).toBeLessThanOrEqual(t.goalSeconds!) // but reachable
  })

  it('is "met" when today’s fitness already achieves the goal', () => {
    // VDOT 50: today ~1:31:27 — already under a 1:35 goal.
    const t = buildTrajectory({ ...base, currentVdot: 50, goalSeconds: clk(1, 35) })!
    expect(t.status).toBe('met')
    expect(t.headline).toContain('at 1:35:00 today')
    expect(t.projectedSeconds).toBeLessThanOrEqual(t.goalSeconds!)
  })

  it('is "reach" — and offers the honest target — when the goal beats a full block', () => {
    // VDOT 45, goal 1:20: realistic is only ~1:33:43, so 1:20 is beyond reach.
    const t = buildTrajectory({ ...base, currentVdot: 45, goalSeconds: clk(1, 20) })!
    expect(t.status).toBe('reach')
    expect(t.headline).toBe('1:20:00 is a reach from here')
    expect(t.note).toContain(t.realisticClock)   // names the honest target
    expect(t.realisticSeconds).toBeGreaterThan(t.goalSeconds!)
  })

  it('just projects when there is no goal', () => {
    const t = buildTrajectory({ ...base, currentVdot: 45, goalSeconds: null })!
    expect(t.status).toBeNull()
    expect(t.headline).toMatch(/^On pace for \d/)
    expect(t.goalClock).toBeNull()
  })
})

describe('buildTrajectory — confidence sharpens over the block', () => {
  const g = { currentVdot: 45, raceMiles: HALF, goalSeconds: clk(1, 35) }
  it('is building in the first weeks', () => {
    expect(buildTrajectory({ ...g, weeksElapsed: 1, totalWeeks: 8 })!.confidence).toBe('building')
    expect(buildTrajectory({ ...g, weeksElapsed: 2, totalWeeks: 8 })!.confidence).toBe('building')
  })
  it('firms up mid-block, then settles late', () => {
    expect(buildTrajectory({ ...g, weeksElapsed: 4, totalWeeks: 8 })!.confidence).toBe('firming')
    expect(buildTrajectory({ ...g, weeksElapsed: 6, totalWeeks: 8 })!.confidence).toBe('settled')
  })
})

describe('buildTrajectory — refuses a number it cannot honestly make', () => {
  it('returns null without fitness', () => {
    expect(buildTrajectory({ currentVdot: 0, raceMiles: HALF, goalSeconds: null, weeksElapsed: 1, totalWeeks: 8 })).toBeNull()
  })
  it('returns null without a distance', () => {
    expect(buildTrajectory({ currentVdot: 45, raceMiles: 0, goalSeconds: null, weeksElapsed: 1, totalWeeks: 8 })).toBeNull()
  })
})

describe('trajectoryFromConfig', () => {
  const cfg = (over: Partial<OnboardingConfig> = {}): OnboardingConfig => ({
    raceType: 'road', raceDistance: 'half_marathon',
    goalRaceTimeSeconds: clk(1, 35),
    fitnessAnchor: { type: 'race_10k', valueSeconds: clk(0, 43, 0) },
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5,
    athleteName: 'Mike', age: 45, completedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as OnboardingConfig)

  it('produces a trajectory for a road race with a fitness anchor', () => {
    const t = trajectoryFromConfig(cfg(), 3, 8)
    expect(t).not.toBeNull()
    expect(t!.goalClock).toBe('1:35:00')
  })

  it('stays out of Hyrox’s lane', () => {
    expect(trajectoryFromConfig(cfg({ raceType: 'hyrox' }), 3, 8)).toBeNull()
  })

  it('returns null without a fitness anchor — no number invented from nothing', () => {
    expect(trajectoryFromConfig(cfg({ fitnessAnchor: undefined }), 3, 8)).toBeNull()
  })

  it('returns null for an unmeasurable distance (mountain ultra)', () => {
    expect(trajectoryFromConfig(cfg({ raceDistance: 'mountain_ultra' }), 3, 8)).toBeNull()
  })

  it('projects with no goal set, rather than refusing', () => {
    const t = trajectoryFromConfig(cfg({ goalRaceTimeSeconds: undefined }), 3, 8)
    expect(t).not.toBeNull()
    expect(t!.status).toBeNull()
  })
})
