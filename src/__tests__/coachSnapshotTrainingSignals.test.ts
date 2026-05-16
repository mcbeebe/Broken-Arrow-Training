import { describe, it, expect } from 'vitest'
import { buildCoachSnapshot } from '../utils/coachSnapshot'
import type {
  AthleteProfile,
  DailyTRIMP,
  PerformanceMetrics,
  RaceInfo,
  ReadinessScore,
  TrainingWeek,
} from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'

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
    overallDistanceCompliance: 0,
    overallDurationCompliance: 0,
    totalFlagged: 0,
  }
}

function balancedPerf(): PerformanceMetrics[] {
  return [
    { date: '2026-05-09', ctl: 72, atl: 78, tsb: -6, acwr: 1.05 },
    { date: '2026-05-16', ctl: 73, atl: 73, tsb: 0, acwr: 1.0 },
  ]
}

function readinessOf(status: ReadinessScore['status']): ReadinessScore {
  return {
    date: '2026-05-16',
    composite: status === 'GREEN' ? 0.5 : 0,
    displayScore: status === 'GREEN' ? 70 : 45,
    status,
    trainingState: 'B',
    components: { hrv: 0, rhr: 0, sleep: 0, trainingLoad: 0 },
    message: '',
  }
}

function weeks(): TrainingWeek[] {
  return [{ num: 1, dates: '', miles: 0, focus: '', days: [] }]
}

function trimp(): DailyTRIMP[] {
  return [{ date: '2026-05-16', total: 50, records: [] }]
}

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('buildCoachSnapshot — trainingSignals attachment', () => {
  it('always emits a trainingSignals object', () => {
    const snap = buildCoachSnapshot({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: weeks(),
      readiness: readinessOf('GREEN'),
      performance: balancedPerf(),
      dailyTrimp: trimp(),
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
    })
    expect(snap.trainingSignals).toBeDefined()
    expect(snap.trainingSignals?.todayCall).toBeDefined()
    expect(snap.trainingSignals?.coherence).toBeDefined()
  })

  it('returns aligned coherence when load, body, and damage all green', () => {
    const snap = buildCoachSnapshot({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: weeks(),
      readiness: readinessOf('GREEN'),
      performance: balancedPerf(),
      dailyTrimp: trimp(),
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
      sorenessLoadByDate: new Map(),
    })
    expect(snap.trainingSignals?.coherence).toBe('aligned')
    expect(snap.trainingSignals?.todayCall).toBe('train')
  })

  it('returns mixed coherence in the user case (balanced load + YELLOW body)', () => {
    // Reproduce the screenshot scenario: load balanced (TSB 0, ACWR 1.0),
    // body YELLOW (5.8h sleep, HRV drop), soreness fine.
    const snap = buildCoachSnapshot({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: weeks(),
      readiness: readinessOf('YELLOW'),
      performance: balancedPerf(),
      dailyTrimp: trimp(),
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
      sorenessLoadByDate: new Map(),
    })
    expect(snap.trainingSignals?.coherence).toBe('mixed')
    expect(snap.trainingSignals?.dominant).toBe('body')
    expect(snap.trainingSignals?.todayCall).toBe('easy')
  })

  it('escalates to rest with damage axis when soreness trends up', () => {
    const sore = new Map<string, number>()
    sore.set(todayKey(), 35)
    sore.set(yesterdayKey(), 35)
    // Two more days back, both elevated and non-decreasing → trending.
    const d2 = new Date(); d2.setDate(d2.getDate() - 2)
    const d2k = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`
    sore.set(d2k, 15)
    const snap = buildCoachSnapshot({
      athleteProfile: athlete,
      race,
      raceDistanceMiles: 11.2,
      raceElevationFt: 3000,
      currentWeekNum: 1,
      weeks: weeks(),
      readiness: readinessOf('GREEN'),
      performance: balancedPerf(),
      dailyTrimp: trimp(),
      compliance: emptyCompliance(),
      planStartDate: '2026-04-13',
      sorenessLoadByDate: sore,
    })
    expect(snap.trainingSignals?.coherence).toBe('mixed')
    expect(snap.trainingSignals?.dominant).toBe('damage')
    expect(snap.trainingSignals?.todayCall).toBe('rest')
  })
})
