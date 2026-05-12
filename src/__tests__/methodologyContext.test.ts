import { describe, it, expect } from 'vitest'
import {
  buildMethodologyContext,
  formatVertRange,
  formatWeekRange,
} from '../utils/methodologyContext'
import mikePlan from '../data/mike-18k-plan'
import joelPlan from '../data/joel-18k-plan'
import jimPlan from '../data/jim-11k-plan'
import loriPlan from '../data/lori-11k-plan'

describe('buildMethodologyContext — Mike 18K', () => {
  const ctx = buildMethodologyContext(mikePlan)

  it('reports the right total weeks and race metadata', () => {
    expect(ctx.totalWeeks).toBe(10)
    expect(ctx.raceName).toBe('Broken Arrow Skyrace 18K')
    expect(ctx.raceDistance).toBe('18K (~11 mi)')
    expect(ctx.raceElevation).toBe('~3,800 ft climbing')
    expect(ctx.raceElevationRange).toMatch(/9,000/)
  })

  it('detects high altitude', () => {
    expect(ctx.hasAltitude).toBe(true)
  })

  it('builds four phases anchored on the recovery week and taper', () => {
    const ids = ctx.phases.map(p => p.id)
    expect(ids).toEqual(['base', 'build', 'peak', 'taper'])
    const base = ctx.phases.find(p => p.id === 'base')!
    const build = ctx.phases.find(p => p.id === 'build')!
    const peak = ctx.phases.find(p => p.id === 'peak')!
    const taper = ctx.phases.find(p => p.id === 'taper')!
    expect(base.weekStart).toBe(1)
    expect(base.weekEnd).toBe(4) // Wk 5 is the recovery week, so base ends Wk 4
    expect(build.weekStart).toBe(5)
    expect(build.weekEnd).toBe(6)
    expect(peak.weekStart).toBe(7)
    expect(peak.weekEnd).toBe(8)
    expect(taper.weekStart).toBe(9)
    expect(taper.weekEnd).toBe(10)
  })

  it('derives per-phase vert ranges from long-run details', () => {
    const base = ctx.phases.find(p => p.id === 'base')!
    expect(base.vertRangeFt?.min).toBe(760)
    expect(base.vertRangeFt?.max).toBe(1528) // first poles week (Wk 4) sits in this segment
  })

  it('identifies the recovery week (Wk 5, ~27%)', () => {
    expect(ctx.recoveryWeek?.num).toBe(5)
    expect(ctx.recoveryWeek?.volumeDropPct).toBe(27)
  })

  it('identifies the taper window (Wk 9-10)', () => {
    expect(ctx.taper?.startWeek).toBe(9)
    expect(ctx.taper?.endWeek).toBe(10)
    expect(ctx.taper?.volumeDropPct).toBeGreaterThan(0)
  })

  it('finds the first poles week from day mentions', () => {
    expect(ctx.polesStartWeek).toBe(4)
    expect(ctx.hasPoles).toBe(true)
  })

  it('detects eccentric strength focus and the Shirley Canyon descent landmark', () => {
    expect(ctx.eccentricFocus).toBe(true)
    expect(ctx.descentLandmark).toBe('Shirley Canyon')
  })

  it('reports the plan has both strength and cross-training', () => {
    expect(ctx.hasStrength).toBe(true)
    expect(ctx.hasCrossTraining).toBe(true)
  })
})

describe('buildMethodologyContext — Joel 18K', () => {
  const ctx = buildMethodologyContext(joelPlan)
  it('finds Joel-specific recovery and taper markers', () => {
    expect(ctx.recoveryWeek?.num).toBe(5)
    expect(ctx.recoveryWeek?.volumeDropPct).toBe(28)
    expect(ctx.taper?.startWeek).toBe(9)
    expect(ctx.hasPoles).toBe(true)
  })
})

describe('buildMethodologyContext — Jim 11K (two race weeks, no recovery week marker)', () => {
  const ctx = buildMethodologyContext(jimPlan)
  it('does not hallucinate a recovery week when none is labeled', () => {
    expect(ctx.recoveryWeek).toBeUndefined()
  })
  it('still finds poles in the plan', () => {
    expect(ctx.hasPoles).toBe(true)
  })
})

describe('buildMethodologyContext — Lori 11K (no poles)', () => {
  const ctx = buildMethodologyContext(loriPlan)
  it('reports no trekking-poles usage', () => {
    expect(ctx.hasPoles).toBe(false)
    expect(ctx.polesStartWeek).toBeUndefined()
  })
  it('still identifies the recovery week and taper', () => {
    expect(ctx.recoveryWeek?.num).toBe(5)
    expect(ctx.taper?.startWeek).toBe(9)
  })
})

describe('buildMethodologyContext — method overlay', () => {
  it('layers in method narrative + intensity distribution when supplied', () => {
    const fakeMethod = {
      id: 'fake',
      name: 'Fake Method',
      coach: 'Coach X',
      keyBook: 'Book Y',
      yearOfOrigin: 2020,
      description: '',
      signature: '',
      philosophyNarrative: 'Lots of easy running.',
      phases: [
        {
          id: 'p1',
          name: 'P1',
          order: 1,
          pctOfPlan: { min: 0.3, default: 0.5, max: 0.5 },
          weekBounds: { minWeeks: 1, maxWeeks: 10 },
          focus: '',
          intensityDistribution: { easyPct: 90, moderatePct: 5, hardPct: 5 },
          keyWorkoutIds: [],
          mileageBehavior: 'build' as const,
        },
        {
          id: 'p2',
          name: 'P2',
          order: 2,
          pctOfPlan: { min: 0.3, default: 0.5, max: 0.5 },
          weekBounds: { minWeeks: 1, maxWeeks: 10 },
          focus: '',
          intensityDistribution: { easyPct: 70, moderatePct: 10, hardPct: 20 },
          keyWorkoutIds: [],
          mileageBehavior: 'peak' as const,
        },
      ],
      // Required fields below — minimal stubs are fine for this helper.
      citations: [],
      primaryAnchor: 'none' as const,
      fallbackAnchor: 'none' as const,
      paceZones: [],
      workouts: [],
      weeklyPatterns: [],
      mileageProgression: {
        startMileagePctOfPeak: 0.5,
        peakMileageRule: { type: 'absolute' as const, value: 0 },
        maxWeeklyIncreasePct: 10,
        cutbackEveryNWeeks: 4,
        cutbackPct: 25,
        longRunPctCap: 0.3,
      },
      taper: { durationWeeks: 2, weeklyVolumePcts: [70, 50], preserveIntensity: true, raceWeekSchedule: [] },
      strengthRecommendation: { daysPerWeek: { min: 0, default: 0, max: 0 }, workoutIds: [], philosophy: '' },
      crossTrainingRecommendation: { approvedModalities: [], daysPerWeek: { min: 0, default: 0, max: 0 }, intensityGuidance: '' },
      applicability: { byDistance: {}, byExperience: {}, byTerrain: {} },
      restrictions: [],
      generationRules: {
        defaultPlanWeeks: 10,
        supportedPlanWeeks: [10],
        qualityWorkoutsPerWeek: { min: 0, default: 1, max: 2 },
        minDaysBetweenHardSessions: 2,
        allowsDoubles: false,
        compressionPriority: [],
        expansionPriority: [],
      },
      schemaVersion: '1.0',
      lastUpdated: '2025-01-01',
    }
    const ctx = buildMethodologyContext(mikePlan, fakeMethod)
    expect(ctx.methodName).toBe('Fake Method')
    expect(ctx.methodCoach).toBe('Coach X')
    expect(ctx.intensityDistribution).toEqual({ easyPct: 80, moderatePct: 8, hardPct: 13 })
  })
})

describe('formatters', () => {
  it('formats week ranges', () => {
    expect(formatWeekRange(1, 3)).toBe('Wk 1-3')
    expect(formatWeekRange(5, 5)).toBe('Wk 5')
  })

  it('formats vert ranges', () => {
    expect(formatVertRange({ min: 760, max: 912 })).toBe('760-912 ft')
    expect(formatVertRange({ min: 1528, max: 1528 })).toBe('~1,528 ft')
    expect(formatVertRange({ min: 1528, max: 2000 })).toBe('1,528-2,000 ft')
  })
})
