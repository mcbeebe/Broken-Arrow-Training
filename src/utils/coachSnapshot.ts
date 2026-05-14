import type {
  CoachSnapshot,
  CoachSnapshotAnalytics,
  CoachHealthToday,
  GarminHealthData,
  GarminActivityDetail,
  PerformanceMetrics,
  PlannedDay,
  ReadinessScore,
  TrainingWeek,
  ActualWorkout,
  AthleteProfile,
  HRZone,
  RaceInfo,
  DailyTRIMP,
  StravaActivity,
  GarminActivity,
} from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'
import type { SorenessLevel } from '../hooks/useSoreness'
import { computeRaceProjection } from './raceProjection'
import { localDateStr } from './format'
import { buildProgression, suggestNextTarget } from './strengthProgression'

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
  zones?: HRZone[]
  plannedToday?: PlannedDay
  plannedTomorrow?: PlannedDay
  readiness: ReadinessScore | null
  performance: PerformanceMetrics[]
  dailyTrimp: DailyTRIMP[]
  compliance: OverallCompliance
  todaySoreness?: SorenessLevel | null
  sorenessLog?: { date: string; level: SorenessLevel }[]
  planStartDate: string  // YYYY-MM-DD
  /** Raw Garmin health data for today (sleep hours, HRV ms, RHR bpm,
   *  body battery). The readiness engine already normalizes these into
   *  components, but the coach needs the raw units for human answers. */
  todayHealth?: GarminHealthData | null
  /** Raw Strava activities — NOT filtered to plan days. Necessary so
   *  the coach can see workouts that happened BEFORE the plan started
   *  (pre-plan base miles) or on non-plan days (bonus runs, cross-
   *  training not on the calendar). */
  stravaActivities?: StravaActivity[]
  /** Raw Garmin activities — same rationale as Strava. When both
   *  are present, we dedup by matching start timestamps. */
  garminActivities?: GarminActivity[]
  /** Garmin activity details keyed by date — enriches activities with
   *  distance, HR zones, training effects, VO2max. */
  garminActivityDetails?: Record<string, GarminActivityDetail[]>
}

function currentDayPeriod(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
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

/** Parse "Mon 4/15" into an ISO date using the plan start year so we
 *  can compare against today / ranges. Returns null if the label
 *  doesn't contain an M/D pair. */
export function dayLabelToISO(label: string, planStartDate: string): string | null {
  const m = label.match(/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  const year = parseInt((planStartDate || '').slice(0, 4), 10) || new Date().getFullYear()
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Compact one-line summary of a planned day for the full-plan dump. */
function compactPlannedDay(d: PlannedDay, iso?: string): { day: string; date?: string; type: string; workout: string; zone: string } {
  return {
    day: d.day,
    date: iso,
    type: d.type,
    workout: d.workout,
    zone: d.zone,
  }
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
  const weekStartStr = localDateStr(isoWeekStart(new Date()))
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

/**
 * Project raw GarminHealthData into the compact CoachHealthToday shape.
 * Returns null when there is no meaningful health data for today.
 */
function projectHealth(h: GarminHealthData | null | undefined): CoachHealthToday | null {
  if (!h) return null
  const out: CoachHealthToday = { date: h.date }
  if (h.sleep) {
    if (h.sleep.durationSeconds > 0) {
      out.sleepHours = Math.round((h.sleep.durationSeconds / 3600) * 10) / 10
    }
    if (typeof h.sleep.score === 'number') out.sleepScore = h.sleep.score
    if (h.sleep.quality) out.sleepQuality = h.sleep.quality
  }
  if (typeof h.rhr === 'number') out.rhr = h.rhr
  if (h.hrv) {
    if (typeof h.hrv.lastNightAvg === 'number') out.hrvLastNightMs = h.hrv.lastNightAvg
    if (typeof h.hrv.weeklyAvg === 'number') out.hrvWeeklyAvgMs = h.hrv.weeklyAvg
    if (h.hrv.status) out.hrvStatus = h.hrv.status
  }
  if (h.bodyBattery) {
    if (typeof h.bodyBattery.current === 'number') out.bodyBatteryCurrent = h.bodyBattery.current
    if (typeof h.bodyBattery.charged === 'number') out.bodyBatteryCharged = h.bodyBattery.charged
    if (typeof h.bodyBattery.drained === 'number') out.bodyBatteryDrained = h.bodyBattery.drained
  }
  // If we have nothing beyond the date, treat as null so the coach doesn't
  // pretend it has data.
  const hasAny =
    out.sleepHours !== undefined ||
    out.rhr !== undefined ||
    out.hrvLastNightMs !== undefined ||
    out.bodyBatteryCurrent !== undefined
  return hasAny ? out : null
}

export function buildCoachSnapshot(inputs: Inputs): CoachSnapshot {
  const { weeks, plannedToday, plannedTomorrow, readiness, performance, athleteProfile, race, currentWeekNum, todayHealth, planStartDate, stravaActivities, garminActivities } = inputs

  const sevenAgo = daysAgoISO(7)
  const thirtyAgo = daysAgoISO(30)
  // 120 days of actuals is our max lookback — roughly 4 months. Keeps
  // token budget reasonable (~120 lines worst case) while giving the
  // coach real trend visibility when asked about "the last few months"
  // or "earlier in the block."
  const oneTwentyAgo = daysAgoISO(120)
  const today = todayISO()
  // 2-week look-ahead window (today inclusive)
  const ahead14 = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 13)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  })()

  // Planned upcoming: every planned day between today and today+13, in order.
  const plannedUpcoming: PlannedDay[] = []
  for (const w of weeks) {
    for (const d of w.days) {
      const iso = dayLabelToISO(d.day, planStartDate)
      if (!iso) continue
      if (iso >= today && iso <= ahead14) {
        plannedUpcoming.push(d)
      }
    }
  }

  // Full plan skeleton (always emitted on the snapshot — cheap in bytes,
  // and the brief only renders it when the user asks for it). One line
  // per planned day + a compact per-week focus/miles header.
  const fullPlan: NonNullable<CoachSnapshot['fullPlan']> = {
    weeks: weeks.map(w => ({ num: w.num, dates: w.dates, miles: w.miles, focus: w.focus })),
    days: weeks.flatMap(w => w.days.map(d => compactPlannedDay(d, dayLabelToISO(d.day, planStartDate) ?? undefined))),
  }

  // Collect ALL activities from the last 120 days — matched AND
  // unmatched. Three sources, merged + deduped:
  //   1. weeks[*].days[*].actual — activities matched to plan days
  //   2. stravaActivities — raw Strava feed (catches pre-plan rides,
  //      non-plan-day bonus runs, etc.)
  //   3. garminActivities — raw Garmin feed (same reasoning)
  //
  // Dedup key: the start-date minute for raw Strava/Garmin activities,
  // but DATE-level for plan-matched actuals. This prevents the manual log
  // (which generates a new startDate at 8 AM) from appearing as a second
  // activity alongside the Garmin bike ride on the same day.
  type ActEntry = NonNullable<CoachSnapshot['recentActivities']>[number]
  const actsByKey = new Map<string, { entry: ActEntry; priority: number }>()
  const putAct = (entry: ActEntry, priority: number, dayLevel = false) => {
    if (!entry.startDate) return
    const iso = entry.startDate.slice(0, 10)
    if (iso < oneTwentyAgo) return
    const key = dayLevel ? iso : entry.startDate.slice(0, 16)
    const existing = actsByKey.get(key)
    if (!existing || priority > existing.priority) {
      actsByKey.set(key, { entry, priority })
    }
  }

  // Garmin activity details keyed by date — used to enrich activities
  // with distance, HR zones, training effects, and VO2max.
  const gDetails = inputs.garminActivityDetails || {}

  // Source 1: plan-matched actuals (highest priority — has RPE,
  // drill status, manual notes, and Garmin-enriched fields)
  for (const w of weeks) {
    for (const d of w.days) {
      const a = d.actual
      if (!a?.startDate) continue
      putAct({
        startDate: a.startDate,
        name: a.name || '',
        distance: a.distance || 0,
        movingTime: a.movingTime || 0,
        avgHR: a.avgHR,
        maxHR: a.maxHR,
        elevationGain: a.elevationGain,
        rpe: a.rpe,
        laps: a.laps?.map(l => ({
          distance: l.distance,
          movingTime: 0,
          avgHR: l.hr,
          elev: l.elev,
        })),
        hrZones: a.hrZoneSummary?.filter(z => z.seconds > 0).map(z => ({
          zone: z.zone,
          seconds: z.seconds,
        })),
        aerobicTE: a.aerobicTE,
        anaerobicTE: a.anaerobicTE,
        vo2max: a.vo2max,
      }, 3, true)
    }
  }

  // Source 2: raw Strava activities (catches pre-plan + non-plan days)
  for (const s of stravaActivities || []) {
    if (!s.start_date) continue
    putAct({
      startDate: s.start_date,
      name: s.name || s.sport_type || 'Activity',
      distance: s.distance ? s.distance / 1609.344 : 0,
      movingTime: s.moving_time || 0,
      avgHR: s.average_heartrate,
      maxHR: s.max_heartrate,
      elevationGain: s.total_elevation_gain
        ? Math.round(s.total_elevation_gain * 3.28084)
        : 0,
      rpe: undefined,
      laps: s.laps?.map(l => ({
        distance: l.distance / 1609.344,
        movingTime: l.moving_time,
        avgHR: l.average_heartrate,
        avgSpeed: l.average_speed,
        elev: l.total_elevation_gain ? Math.round(l.total_elevation_gain * 3.28084) : undefined,
      })),
    }, 2)
  }

  // Source 3: raw Garmin activities — enrich from activity details
  // when available to get distance, HR zones, and training effects.
  for (const g of garminActivities || []) {
    if (!g.date) continue
    const dateKey = g.date.slice(0, 10)
    const details = gDetails[dateKey]
    const detail = details?.[0]
    putAct({
      startDate: g.date.includes('T') ? g.date : `${g.date}T00:00:00`,
      name: g.name || g.type || 'Activity',
      distance: detail
        ? Math.round((detail.distanceMeters / 1609.344) * 100) / 100
        : 0,
      movingTime: detail
        ? (detail.movingDurationSeconds || detail.durationSeconds)
        : (g.durationMinutes ? g.durationMinutes * 60 : 0),
      avgHR: detail?.averageHR ?? g.avgHR,
      maxHR: detail?.maxHR ?? g.maxHR,
      elevationGain: detail
        ? Math.round(detail.elevationGainMeters * 3.28084)
        : (g.elevationGainFt || 0),
      rpe: undefined,
      hrZones: detail?.hrZones?.filter(z => z.secsInZone > 0).map(z => ({
        zone: z.zoneNumber,
        seconds: z.secsInZone,
      })),
      aerobicTE: detail?.aerobicTrainingEffect,
      anaerobicTE: detail?.anaerobicTrainingEffect,
      vo2max: detail?.vO2MaxValue,
    }, 1)
  }

  const recentActivities = Array.from(actsByKey.values())
    .map(x => x.entry)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  void sevenAgo
  void thirtyAgo

  const recentSoreness =
    (inputs.sorenessLog || [])
      .filter(s => s.date >= sevenAgo)
      .slice(-5)
      .map(s => ({ date: s.date, summary: `level ${s.level}` }))

  const analytics = buildAnalytics(inputs)

  // Per-exercise strength progression — compact, only includes exercises
  // logged in the last 60 days so the snapshot doesn't bloat token use.
  // Each entry carries first/latest sessions + the linear-progression
  // suggested next target so the coach can call out specific numbers.
  const progressionMap = buildProgression(inputs.weeks)
  const sixtyAgo = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 60)
    return localDateStr(d)
  })()
  const strengthProgression = Array.from(progressionMap.values())
    .filter(p => p.last && p.last.date >= sixtyAgo)
    .map(p => {
      const first = p.first!
      const last = p.last!
      const firstAvgReps = first.sets.length > 0 ? Math.round(first.totalReps / first.sets.length) : 0
      const lastAvgReps = last.sets.length > 0 ? Math.round(last.totalReps / last.sets.length) : 0
      const weeksSinceFirst = Math.max(0, last.weekNum - first.weekNum)
      // Use the latest session's sets/reps as the planned input for the
      // suggestion (we don't know the upcoming planned numbers here).
      const tgt = suggestNextTarget(p, last.sets.length, lastAvgReps)
      return {
        name: p.displayName,
        sessions: p.sessions.length,
        isBodyweight: p.isBodyweight,
        peakWeightLb: p.peakWeightLb,
        weeksSinceFirst,
        firstSession: { weekNum: first.weekNum, topWeightLb: first.topWeightLb, avgReps: firstAvgReps, sets: first.sets.length },
        latestSession: { weekNum: last.weekNum, topWeightLb: last.topWeightLb, avgReps: lastAvgReps, sets: last.sets.length },
        suggestedTarget: tgt
          ? { weightLb: tgt.weightLb, reps: tgt.reps, sets: tgt.sets, tier: tgt.tier, rationale: tgt.rationale }
          : undefined,
      }
    })
    // Sort by sessions descending so the coach sees the best-tracked
    // exercises first when token budgets force truncation.
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 12)

  return {
    today: { date: todayISO(), period: currentDayPeriod() },
    currentWeekNum,
    readiness,
    performance: performance.length ? performance[performance.length - 1] : null,
    todayHealth: projectHealth(todayHealth),
    plannedToday: plannedToday ?? null,
    plannedTomorrow: plannedTomorrow ?? null,
    plannedUpcoming,
    fullPlan,
    recentActivities,
    recentSoreness,
    athleteProfile,
    race,
    zones: inputs.zones,
    analytics,
    strengthProgression: strengthProgression.length > 0 ? strengthProgression : undefined,
  }
}
