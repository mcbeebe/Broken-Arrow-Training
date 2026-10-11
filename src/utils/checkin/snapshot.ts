import type { PerformanceMetrics, TrainingPlan, TrainingWeek } from '../../types'
import type { TrainingMethod } from '../../types/training-method'
import { buildMethodologyContext } from '../methodologyContext'
import { dayIsoInWeek } from '../planDates'
import { plannedMinutes } from '../markDone'
import { parseRaceDate } from '../raceCountdown'
import { shiftDate, valueOnOrBefore } from '../metricTrend'
import { acwrZone, tsbZone, type AcwrBounds } from '../loadZones'

/**
 * The check-in snapshot (initiative 005): what the server needs to write the
 * Sunday/Wednesday Coach check-in email, and later to keep Google Calendar in
 * step. The plan exists only here in the app, so the app materialises it and
 * uploads it whenever it changes. The server's schema is
 * `api/coach/_checkin.clean_snapshot`; keep the two in step.
 */

/** Days of history the email reviews. */
export const CHECKIN_PAST_DAYS = 14
/** Days of plan ahead: the email's next 2 weeks plus the "further ahead"
 *  weeks, and the calendar's window (D9). */
export const CHECKIN_AHEAD_DAYS = 42

const METERS_PER_MILE = 1609.344

export interface CheckinDay {
  date: string
  week: number
  type: string
  workout: string
  detail: string
  zone: string
  /** Planned minutes, when the day names a duration. */
  minutes: number | null
  actual?: { miles: number; minutes: number; name: string }
}

export interface CheckinSnapshot {
  v: 1
  /** The athlete's local date when the snapshot was built. */
  asOf: string
  /** When it was built, as an instant. */
  generatedAt: string
  /** The device's IANA zone; the server schedules in it. */
  timezone: string
  days: CheckinDay[]
  weeks: { num: number; startIso: string; focus: string; plannedMiles: number | null }[]
  race: { name: string; date: string | null } | null
  block: {
    currentPhase: string
    weekNum: number
    totalWeeks: number
    phases: { label: string; weekStart: number; weekEnd: number }[]
  } | null
  load: {
    date: string
    fitness: number
    fitnessChange: number | null
    fatigue: number
    balance: number
    balanceLabel: string
    ratio: number
    ratioLabel: string
  } | null
}

export interface CheckinInputs {
  /** The plan as the app shows it: `activePlan` with the derived `weeks`. */
  plan: TrainingPlan
  currentWeekNum: number
  performance: PerformanceMetrics[]
  method?: TrainingMethod
  acwrBounds?: AcwrBounds
  todayIso: string
  now: Date
  timezone: string
}

const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp

function plannedMiles(w: TrainingWeek): number | null {
  const n = typeof w.miles === 'number' ? w.miles : parseFloat(String(w.miles))
  return Number.isFinite(n) ? n : null
}

/**
 * Build the snapshot from what the app already has. Pure: the same inputs
 * always give the same snapshot, which is what makes `checkinHash` a reliable
 * "did anything change?" test.
 */
export function buildCheckinSnapshot(inputs: CheckinInputs): CheckinSnapshot {
  const { plan, currentWeekNum, performance, method, todayIso, now, timezone } = inputs
  const from = shiftDate(todayIso, -CHECKIN_PAST_DAYS)
  const to = shiftDate(todayIso, CHECKIN_AHEAD_DAYS - 1)

  const days: CheckinDay[] = []
  const weekStarts = new Map<number, string>()
  for (const week of plan.weeks) {
    for (const d of week.days) {
      const iso = dayIsoInWeek(d.day, week, todayIso)
      if (!iso || iso < from || iso > to) continue
      const start = week.startIso ?? iso
      if (!weekStarts.has(week.num) || start < (weekStarts.get(week.num) as string)) weekStarts.set(week.num, start)
      const day: CheckinDay = {
        date: iso,
        week: week.num,
        type: d.type,
        workout: d.workout,
        detail: d.detail ?? '',
        zone: d.zone ?? '',
        minutes: plannedMinutes(d.time),
      }
      if (d.actual) {
        day.actual = {
          miles: round((d.actual.distance || 0) / METERS_PER_MILE, 2),
          minutes: Math.round((d.actual.movingTime || 0) / 60),
          name: d.actual.name ?? '',
        }
      }
      days.push(day)
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const weeks = plan.weeks
    .filter(w => weekStarts.has(w.num))
    .map(w => ({ num: w.num, startIso: weekStarts.get(w.num) as string, focus: w.focus, plannedMiles: plannedMiles(w) }))
    .sort((a, b) => (a.startIso < b.startIso ? -1 : 1))

  let block: CheckinSnapshot['block'] = null
  let isRace = true
  try {
    const ctx = buildMethodologyContext(plan, method)
    isRace = ctx.goalKind !== 'general'
    const phases = ctx.phases.map(p => ({ label: p.label, weekStart: p.weekStart, weekEnd: p.weekEnd }))
    block = {
      currentPhase: phases.find(p => currentWeekNum >= p.weekStart && currentWeekNum <= p.weekEnd)?.label ?? '',
      weekNum: currentWeekNum,
      totalWeeks: ctx.totalWeeks,
      // A general-fitness plan is a rolling block, not a countdown (as in
      // coachSnapshot's planBlocks): no phase arc, no race.
      phases: isRace ? phases : [],
    }
  } catch {
    block = null
  }

  let race: CheckinSnapshot['race'] = null
  if (isRace && plan.race?.name) {
    const d = parseRaceDate(plan.race.date)
    const iso = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : null
    race = { name: plan.race.name, date: iso }
  }

  let load: CheckinSnapshot['load'] = null
  const latest = performance.length ? performance[performance.length - 1] : null
  if (latest) {
    const before = valueOnOrBefore(performance, 'ctl', shiftDate(latest.date, -CHECKIN_PAST_DAYS))
    load = {
      date: latest.date,
      fitness: round(latest.ctl),
      fitnessChange: before == null ? null : round(latest.ctl - before),
      fatigue: round(latest.atl),
      balance: round(latest.tsb),
      balanceLabel: tsbZone(latest.tsb).label,
      ratio: round(latest.acwr, 2),
      ratioLabel: acwrZone(latest.acwr, inputs.acwrBounds).label,
    }
  }

  return {
    v: 1,
    asOf: todayIso,
    generatedAt: now.toISOString(),
    timezone,
    days,
    weeks,
    race,
    block,
    load,
  }
}

/**
 * Stable content hash (djb2 over JSON) of everything but `generatedAt`, so a
 * re-render with the same plan and numbers never re-uploads. Not
 * cryptographic: it only answers "did anything change?".
 */
export function checkinHash(snap: CheckinSnapshot): string {
  const { generatedAt: _ignored, ...rest } = snap
  const canonical = JSON.stringify(rest)
  let h = 5381
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h + canonical.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
