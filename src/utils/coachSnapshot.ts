import type {
  CoachSnapshot,
  CoachSnapshotAnalytics,
  PerformanceMetrics,
  PlannedDay,
  ReadinessScore,
  TrainingWeek,
  ActualWorkout,
  AthleteProfile,
  RaceInfo,
  DailyTRIMP,
} from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'
import type { SorenessLevel } from '../hooks/useSoreness'
import { computeRaceProjection } from './raceProjection'

/**
 * Assemble the CoachSnapshot that's sent with every LLM call. The goal is
 * a compact, serializable view of everything the coach reasonably needs
 * to reason about today + recent history.
 */

interface Inputs {
  athleteProfile: AthleteProfile
  race: RaceInfo
  raceDistanceMiles: number
  raceElevationFt: number
  currentWeekNum: number
  weeks: TrainingWeek[]
  plannedToday?: PlannedDay
  plannedTomorrow?: PlannedDay
  readiness: ReadinessScore | null
  performance: PerformanceMetrics[]
  dailyTrimp: DailyTRIMP[]
  compliance: OverallCompliance
  todaySoreness?: SorenessLevel | null
  sorenessLog?: { date: string; level: SorenessLevel }[]
  planStartDate: string  // YYYY-MM-DD
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function zonesFromActual(a: ActualWorkout): { z1: number; z2: number; z3: number; z4: number; z5: number } {
  const z = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
  const sum = a.hrZoneSummary
  if (!sum) return z
  for (const s of sum) {
    if (s.zone >= 1 && s.zone <= 5) {
      z[`z${s.zone}` as keyof typeof z] += s.seconds || 0
    }
  }
  return z
}

function isoWeekStart(d: Date): Date {
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(d)
  start.setDate(d.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

export function buildAnalytics(inputs: Inputs): CoachSnapshotAnalytics {
  const {
    weeks,
    performance,
    dailyTrimp,
    compliance,
    currentWeekNum,
    raceDistanceMiles,
    raceElevationFt,
  } = inputs

  // Gather all actuals from the weeks
  const actuals: { date: string; a: ActualWorkout }[] = []
  for (const w of weeks) {
    for (const d of w.days) {
      if (d.actual?.startDate) {
        actuals.push({ date: d.actual.startDate.slice(0, 10), a: d.actual })
      }
    }
  }

  // Week-to-date (ISO week starting Monday)
  const weekStartStr = isoWeekStart(new Date()).toISOString().slice(0, 10)
  const wtdActuals = actuals.filter(x => x.date >= weekStartStr)
  const wtdMiles = wtdActuals.reduce((s, x) => s + (x.a.distance || 0), 0)
  const wtdDurationSec = wtdActuals.reduce((s, x) => s + (x.a.movingTime || 0), 0)
  const wtdTrimp = dailyTrimp
    .filter(d => d.date >= weekStartStr)
    .reduce((s, d) => s + d.total, 0)
  const wtdZones = wtdActuals.reduce(
    (acc, x) => {
      const z = zonesFromActual(x.a)
      return {
        z1: acc.z1 + z.z1,
        z2: acc.z2 + z.z2,
        z3: acc.z3 + z.z3,
        z4: acc.z4 + z.z4,
        z5: acc.z5 + z.z5,
      }
    },
    { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
  )

  // Last 7d zones
  const sevenAgo = daysAgoISO(7)
  const last7 = actuals.filter(x => x.date >= sevenAgo)
  const last7Zones = last7.reduce(
    (acc, x) => {
      const z = zonesFromActual(x.a)
      return {
        z1Sec: acc.z1Sec + z.z1,
        z2Sec: acc.z2Sec + z.z2,
        z3Sec: acc.z3Sec + z.z3,
        z4Sec: acc.z4Sec + z.z4,
        z5Sec: acc.z5Sec + z.z5,
      }
    },
    { z1Sec: 0, z2Sec: 0, z3Sec: 0, z4Sec: 0, z5Sec: 0 },
  )

  // Compliance summary — use current week's aggregates
  const currentWeekCompliance = compliance.weeks.find(w => w.weekNum === currentWeekNum)
  const complianceSummary = currentWeekCompliance
    ? {
        distancePct: currentWeekCompliance.distanceCompliancePct / 100,
        durationPct: currentWeekCompliance.durationCompliancePct / 100,
        hrPct: currentWeekCompliance.hrCompliance / 100,
        flagged: currentWeekCompliance.flaggedCount,
      }
    : {
        distancePct: compliance.overallDistanceCompliance / 100,
        durationPct: compliance.overallDurationCompliance / 100,
        hrPct: compliance.overallHRCompliance / 100,
        flagged: compliance.totalFlagged,
      }

  // Load trend
  const latest = performance.length ? performance[performance.length - 1] : null
  const sevenDaysAgoPerf =
    performance.find(p => p.date === sevenAgo) ||
    performance[Math.max(0, performance.length - 8)]
  const loadTrend = latest
    ? {
        ctl: latest.ctl,
        atl: latest.atl,
        tsb: latest.tsb,
        acwr: latest.acwr,
        ctlDelta7d: sevenDaysAgoPerf ? latest.ctl - sevenDaysAgoPerf.ctl : 0,
      }
    : { ctl: 0, atl: 0, tsb: 0, acwr: 0, ctlDelta7d: 0 }

  // Race projection — pull vo2max from most recent actual that has it
  const recentVo2 = [...actuals]
    .reverse()
    .find(x => x.a.vo2max && x.a.vo2max > 0)?.a.vo2max
  const raceProjection = computeRaceProjection({
    performance,
    distanceMiles: raceDistanceMiles,
    elevationFt: raceElevationFt,
    vo2max: recentVo2,
  })

  // Plan progress
  const totalWeeks = weeks.length
  const weeksElapsed = Math.max(0, Math.min(totalWeeks, currentWeekNum - 1))
  const weeksRemaining = Math.max(0, totalWeeks - currentWeekNum + 1)
  // On-track heuristic: CTL is trending up OR compliance for this week >= 0.7
  const trending = loadTrend.ctlDelta7d >= 0
  const compOk = complianceSummary.distancePct >= 0.7
  const onTrack = trending || compOk
  const planProgress = {
    weeksElapsed,
    weeksRemaining,
    onTrack,
    reason: onTrack
      ? trending
        ? 'CTL trending up'
        : 'Meeting weekly distance targets'
      : 'CTL declining and distance compliance below 70%',
  }

  return {
    weekToDate: {
      miles: Math.round(wtdMiles * 10) / 10,
      durationSec: wtdDurationSec,
      trimp: Math.round(wtdTrimp),
      timeInZones: wtdZones,
    },
    last7dPerZone: last7Zones,
    complianceSummary,
    loadTrend,
    raceProjection: {
      estimatedSeconds: raceProjection.estimatedSeconds,
      confidence: raceProjection.confidence,
      basis: raceProjection.basis,
    },
    planProgress,
  }
}

export function buildCoachSnapshot(inputs: Inputs): CoachSnapshot {
  const { weeks, plannedToday, plannedTomorrow, readiness, performance, athleteProfile, race, currentWeekNum } = inputs

  const sevenAgo = daysAgoISO(7)
  const thirtyAgo = daysAgoISO(30)

  // Collect recent activities
  const acts: NonNullable<CoachSnapshot['recentActivities']> = []
  for (const w of weeks) {
    for (const d of w.days) {
      const a = d.actual
      if (!a?.startDate) continue
      const date = a.startDate.slice(0, 10)
      if (date < thirtyAgo) continue
      acts.push({
        startDate: a.startDate,
        name: a.name || '',
        distance: a.distance || 0,
        movingTime: a.movingTime || 0,
        avgHR: a.avgHR,
        elevationGain: a.elevationGain,
        rpe: a.rpe,
      })
    }
  }
  acts.sort((a, b) => b.startDate.localeCompare(a.startDate))

  // Only include the 7d window in the primary snapshot (30d is available via
  // re-building; the chat endpoint can expand depth server-side).
  const recentActivities = acts.filter(a => a.startDate.slice(0, 10) >= sevenAgo)

  const recentSoreness =
    (inputs.sorenessLog || [])
      .filter(s => s.date >= sevenAgo)
      .slice(-5)
      .map(s => ({ date: s.date, summary: `level ${s.level}` }))

  const analytics = buildAnalytics(inputs)

  return {
    today: { date: todayISO() },
    currentWeekNum,
    readiness,
    performance: performance.length ? performance[performance.length - 1] : null,
    plannedToday: plannedToday ?? null,
    plannedTomorrow: plannedTomorrow ?? null,
    recentActivities,
    recentSoreness,
    athleteProfile,
    race,
    analytics,
  }
}
