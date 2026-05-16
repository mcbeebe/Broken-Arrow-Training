import { describe, it, expect } from 'vitest'
import { buildBlockVerdict, classifyWeek } from '../utils/complianceNarrative'
import type { WeekCompliance, OverallCompliance } from '../hooks/useCompliance'

function week(overrides: Partial<WeekCompliance> = {}): WeekCompliance {
  return {
    weekNum: 1,
    completed: 5,
    missed: 0,
    restDays: 2,
    totalWorkouts: 5,
    plannedMiles: 20,
    actualMiles: 20,
    plannedElevation: 1000,
    actualElevation: 1000,
    hrCompliance: 85,
    hrCheckedWorkouts: 5,
    hrInZoneTotal: 425,
    days: [],
    distanceCompliancePct: 100,
    durationCompliancePct: 100,
    flaggedCount: 0,
    ...overrides,
  }
}

function compliance(weeks: WeekCompliance[]): OverallCompliance {
  return {
    weeks,
    totalCompleted: weeks.reduce((s, w) => s + w.completed, 0),
    totalMissed: weeks.reduce((s, w) => s + w.missed, 0),
    totalWorkouts: weeks.reduce((s, w) => s + w.totalWorkouts, 0),
    completionRate: 0,
    totalPlannedMiles: weeks.reduce((s, w) => s + w.plannedMiles, 0),
    totalActualMiles: weeks.reduce((s, w) => s + w.actualMiles, 0),
    totalPlannedElevation: weeks.reduce((s, w) => s + w.plannedElevation, 0),
    totalActualElevation: weeks.reduce((s, w) => s + w.actualElevation, 0),
    overallHRCompliance: 0,
    overallDistanceCompliance: 0,
    overallDurationCompliance: 0,
    totalFlagged: weeks.reduce((s, w) => s + w.flaggedCount, 0),
  }
}

// ─── Per-week ──────────────────────────────────────────────────

describe('classifyWeek', () => {
  it('returns null when no workouts attempted', () => {
    expect(classifyWeek(week({ completed: 0, missed: 0 }))).toBeNull()
  })

  it('says "nailed it" when all three axes are strong', () => {
    const v = classifyWeek(week({ completed: 5, missed: 0, actualMiles: 20, plannedMiles: 20, hrCompliance: 90, hrCheckedWorkouts: 5, hrInZoneTotal: 450 }))!
    expect(v.tone).toBe('win')
    expect(v.headline).toMatch(/nailed it/i)
    expect(v.headline).toContain('Wk 1')
  })

  it('says "cold" when fewer than half the sessions were completed', () => {
    const v = classifyWeek(week({ completed: 1, missed: 4 }))!
    expect(v.tone).toBe('cold')
    expect(v.headline).toMatch(/cold/i)
  })

  it('leads with "missed sessions" when completion is between cold and on-track', () => {
    // 4/6 = 67%, below ON_TRACK (75) and above COLD (50)
    const v = classifyWeek(week({ completed: 4, missed: 2 }))!
    expect(v.tone).toBe('mixed')
    expect(v.headline).toMatch(/missed sessions/i)
    expect(v.headline).toContain('4/6')
  })

  it('says "short on miles" when completion is high but distance is low', () => {
    const v = classifyWeek(week({
      completed: 5, missed: 0,
      plannedMiles: 30, actualMiles: 20,
      hrCompliance: 85,
    }))!
    expect(v.tone).toBe('mixed')
    expect(v.headline).toMatch(/short on miles/i)
    expect(v.headline).toContain('20/30 mi')
  })

  it('says "right miles, wrong zone" when distance hit but HR drifted', () => {
    const v = classifyWeek(week({
      completed: 5, missed: 0,
      plannedMiles: 20, actualMiles: 20,
      hrCompliance: 55, hrCheckedWorkouts: 5, hrInZoneTotal: 275,
    }))!
    expect(v.tone).toBe('mixed')
    expect(v.headline).toMatch(/wrong zone/i)
  })

  it('says "showed up but soft" when distance AND HR are both weak', () => {
    const v = classifyWeek(week({
      completed: 5, missed: 0,
      plannedMiles: 30, actualMiles: 22,
      hrCompliance: 60, hrCheckedWorkouts: 5, hrInZoneTotal: 300,
    }))!
    expect(v.tone).toBe('mixed')
    expect(v.headline).toMatch(/soft/i)
  })

  it('says "on track" when completion is above ON_TRACK but below nailed', () => {
    // 4/5 = 80%, above ON_TRACK (75) but missing one. Distance fine, HR fine.
    const v = classifyWeek(week({
      completed: 4, missed: 1,
      plannedMiles: 20, actualMiles: 20,
      hrCompliance: 85, hrCheckedWorkouts: 4, hrInZoneTotal: 340,
    }))!
    expect(v.tone).toBe('on-track')
    expect(v.headline).toMatch(/on track/i)
  })
})

// ─── Block verdict ─────────────────────────────────────────────

describe('buildBlockVerdict', () => {
  it('returns null when no attempted weeks exist', () => {
    expect(buildBlockVerdict(compliance([]))).toBeNull()
    // Future-only week (no completed, no missed) is excluded.
    const futureOnly = week({ completed: 0, missed: 0, totalWorkouts: 5 })
    expect(buildBlockVerdict(compliance([futureOnly]))).toBeNull()
  })

  it('says "nailed it" when 4 strong weeks roll up', () => {
    const weeks = [1, 2, 3, 4].map(n =>
      week({ weekNum: n, completed: 5, missed: 0, actualMiles: 20, plannedMiles: 20, hrCompliance: 90, hrCheckedWorkouts: 5, hrInZoneTotal: 450 }),
    )
    const v = buildBlockVerdict(compliance(weeks))!
    expect(v.tone).toBe('win')
    expect(v.headline).toMatch(/nailed it/i)
    expect(v.detail).toContain('20/20 sessions')
    expect(v.detail).toContain('HR in zone')
  })

  it('says "cold streak" when most sessions were missed', () => {
    const weeks = [1, 2, 3, 4].map(n =>
      week({ weekNum: n, completed: 1, missed: 4, actualMiles: 4, plannedMiles: 20, hrCheckedWorkouts: 0, hrInZoneTotal: 0, hrCompliance: 0 }),
    )
    const v = buildBlockVerdict(compliance(weeks))!
    expect(v.tone).toBe('cold')
    expect(v.headline).toMatch(/cold streak/i)
  })

  it('detects an upward trend across 4 weeks', () => {
    const weeks = [
      week({ weekNum: 1, completed: 2, missed: 3 }),
      week({ weekNum: 2, completed: 2, missed: 3 }),
      week({ weekNum: 3, completed: 5, missed: 0 }),
      week({ weekNum: 4, completed: 5, missed: 0 }),
    ]
    const v = buildBlockVerdict(compliance(weeks))!
    expect(v.headline.toLowerCase()).toContain('trending up')
  })

  it('limits the rollup to the most recent N weeks', () => {
    const oldFails = [1, 2].map(n => week({ weekNum: n, completed: 0, missed: 5 }))
    const recentWins = [3, 4, 5, 6].map(n =>
      week({ weekNum: n, completed: 5, missed: 0, actualMiles: 20, plannedMiles: 20, hrCompliance: 90, hrCheckedWorkouts: 5, hrInZoneTotal: 450 }),
    )
    const v = buildBlockVerdict(compliance([...oldFails, ...recentWins]), 4)!
    expect(v.weeksConsidered).toBe(4)
    expect(v.tone).toBe('win')
  })
})
