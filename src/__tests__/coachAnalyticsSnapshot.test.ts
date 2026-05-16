import { describe, it, expect } from 'vitest'
import { buildAnalytics } from '../utils/coachSnapshot'
import type {
  AthleteProfile,
  DailyTRIMP,
  PerformanceMetrics,
  RaceInfo,
  TrainingWeek,
} from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function isoWeekStartStr(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

const athlete: AthleteProfile = {
  name: 'Test',
  maxHR: 185,
  currentBase: '',
  weeklyStructure: '',
}
const race: RaceInfo = {
  name: 'Test',
  date: '2026-06-20',
  startTime: '',
  distance: '18K',
  distanceMiles: 11.2,
  elevation: '',
  elevationRange: '',
  course: '',
  cutoff: '',
  landmarks: [],
  gear: [],
  nutrition: '',
  loriNote: '',
}

function week(num: number, days: TrainingWeek['days']): TrainingWeek {
  return { num, dates: '', miles: 0, focus: '', days }
}

function emptyCompliance(): OverallCompliance {
  return {
    weeks: [],
    totalCompleted: 0,
    totalMissed: 0,
    totalWorkouts: 0,
    completionRate: 0,
    totalPlannedMiles: 0,
    totalActualMiles: 0,
    totalPlannedElevation: 0,
    totalActualElevation: 0,
    overallHRCompliance: 0,
    overallDistanceCompliance: 60,
    overallDurationCompliance: 50,
    totalFlagged: 2,
  }
}

describe('buildAnalytics', () => {
  it('rolls up time-in-zones for week-to-date and last 7 days', () => {
    const wkStart = isoWeekStartStr()
    const weeks: TrainingWeek[] = [
      week(1, [
        {
          day: 'Mon',
          type: 'run',
          workout: '',
          detail: '',
          zone: '',
          route: '',
          time: '',
          actual: {
            stravaId: 1,
            distance: 3.2,
            movingTime: 1800,
            elapsedTime: 1800,
            elevationGain: 100,
            type: 'run',
            name: 'Run A',
            startDate: `${wkStart}T10:00:00Z`,
            hrZoneSummary: [
              { zone: 1, seconds: 300 },
              { zone: 2, seconds: 1200 },
              { zone: 3, seconds: 300 },
            ],
          },
        },
      ]),
    ]
    const perf: PerformanceMetrics[] = [
      { date: isoDaysAgo(7), ctl: 40, atl: 35, tsb: 5, acwr: 0.9 },
      { date: isoDaysAgo(0), ctl: 45, atl: 40, tsb: 5, acwr: 0.95 },
    ]
    const trimp: DailyTRIMP[] = [{ date: wkStart, total: 123, records: [] }]

    const a = buildAnalytics({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks,
      readiness: null,
      performance: perf,
      dailyTrimp: trimp,
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
    })
    expect(a.weekToDate.miles).toBeCloseTo(3.2, 1)
    expect(a.weekToDate.durationSec).toBe(1800)
    expect(a.weekToDate.trimp).toBe(123)
    expect(a.weekToDate.timeInZones.z2).toBe(1200)
    expect(a.last7dPerZone.z2Sec).toBe(1200)
  })

  it('computes ctlDelta7d from performance history', () => {
    const perf: PerformanceMetrics[] = [
      { date: isoDaysAgo(7), ctl: 40, atl: 35, tsb: 5, acwr: 0.9 },
      { date: isoDaysAgo(0), ctl: 46, atl: 40, tsb: 6, acwr: 1.0 },
    ]
    const a = buildAnalytics({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: [week(1, [])],
      readiness: null,
      performance: perf,
      dailyTrimp: [],
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
    })
    expect(a.loadTrend.ctl).toBe(46)
    expect(a.loadTrend.ctlDelta7d).toBe(6)
  })

  it('falls back to overall compliance when current week has no entry', () => {
    const a = buildAnalytics({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: [week(1, [])],
      readiness: null,
      performance: [],
      dailyTrimp: [],
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
    })
    expect(a.complianceSummary.distancePct).toBeCloseTo(0.6, 2)
    expect(a.complianceSummary.flagged).toBe(2)
  })

  it('marks plan on-track when CTL trends up even with weak compliance', () => {
    const perf: PerformanceMetrics[] = [
      { date: isoDaysAgo(7), ctl: 40, atl: 35, tsb: 5, acwr: 0.9 },
      { date: isoDaysAgo(0), ctl: 44, atl: 40, tsb: 4, acwr: 1.0 },
    ]
    const comp = emptyCompliance()
    comp.overallDistanceCompliance = 40
    const a = buildAnalytics({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: [week(1, [])],
      readiness: null,
      performance: perf,
      dailyTrimp: [],
      compliance: comp,
      planStartDate: '2026-04-13',
    })
    expect(a.planProgress.onTrack).toBe(true)
    expect(a.planProgress.reason).toContain('CTL')
  })

  it('marks plan off-track when CTL falling and compliance below 70%', () => {
    const perf: PerformanceMetrics[] = [
      { date: isoDaysAgo(7), ctl: 50, atl: 40, tsb: 10, acwr: 0.8 },
      { date: isoDaysAgo(0), ctl: 45, atl: 50, tsb: -5, acwr: 1.1 },
    ]
    const comp = emptyCompliance()
    comp.overallDistanceCompliance = 50
    const a = buildAnalytics({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: [week(1, [])],
      readiness: null,
      performance: perf,
      dailyTrimp: [],
      compliance: comp,
      planStartDate: '2026-04-13',
    })
    expect(a.planProgress.onTrack).toBe(false)
  })
})
