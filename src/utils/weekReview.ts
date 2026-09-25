/**
 * The last-7-days review on the Today tab: a few numbers, then what is
 * going well and what to change.
 *
 * Field feedback (2026-09-25): "What Changed This Week" was a stack of
 * up to seven emoji sentences in load-model jargon ("Biggest load: Sat
 * run (142 adjusted TRIMP)"), mixing wins and warnings in one list, and
 * its window was eight days, not seven. Nothing in it said what to do.
 *
 * Now: the window is exactly today and the six days before it; the
 * numbers come first; every line is sorted into Going well or To improve,
 * and every To-improve line ends in something to do.
 *
 * Honesty rules carried over from the old narrative (narrativeHonesty
 * tests): a planned session with nothing logged is "not logged", never
 * "missed" (it may have happened off-watch); unlogged sessions are never
 * credited as recovery; with no dated plan we cannot tell rest from
 * skipped, so we make no rest claim at all. Today's session is not due
 * until today is over, so it only counts once it is done.
 */
import { dayIsoInWeek, isoFromLocalDate } from './planDates'
import { localDateStr } from './format'
import { tsbZone } from './loadZones'
import type { PerformanceMetrics, DailyTRIMP, TrainingWeek, PlannedDay, WorkoutType } from '../types'
import type { TrainingSignals } from './trainingSignals'

/** Lines per section — past three, nobody reads the fourth. */
export const WEEK_REVIEW_MAX_LINES = 3

export interface WeekReviewStats {
  /** Planned sessions done, of those due (past days, plus today once done).
   *  Null with no dated plan to compare against. */
  planned: { done: number; due: number } | null
  /** Days in the window with any logged training. */
  daysTrained: number
  /** Moving time of the plan's logged sessions, in minutes. Null when no
   *  logged session carries a time. */
  trainingMinutes: number | null
  /** Fitness (CTL) change across the window, rounded. */
  fitnessDelta: number
  /** The window's hardest day, by training load. */
  hardest: { iso: string; name: string } | null
}

export interface WeekReview {
  /** First and last day of the window (ISO). */
  fromIso: string
  toIso: string
  stats: WeekReviewStats
  /** ✚ Going well. At most WEEK_REVIEW_MAX_LINES, most important first. */
  wins: string[]
  /** △ To improve. Each line ends in an action. */
  fixes: string[]
}

interface WindowDay {
  iso: string
  day: PlannedDay
}

const shiftIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return isoFromLocalDate(d)
}

const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })

/** Planned days inside [fromIso, toIso], with their real dates. Legacy
 *  plans without `startIso` contribute nothing.
 *
 *  Dates come from the day's own label, as everywhere else in the app:
 *  a coach edit that adds a second Tuesday session splices the array, so
 *  the index stops being the date. A date the first week already covers
 *  is skipped in any later, overlapping week, so nothing counts twice. */
function planDaysBetween(weeks: TrainingWeek[] | undefined, fromIso: string, toIso: string): WindowDay[] {
  const out: WindowDay[] = []
  const claimed = new Set<string>()
  for (const week of weeks ?? []) {
    if (!week.startIso) continue
    const mine = new Set<string>()
    week.days.forEach((day, i) => {
      const iso = dayIsoInWeek(day.day, week) ?? shiftIso(week.startIso!, i)
      if (iso < fromIso || iso > toIso || claimed.has(iso)) return
      mine.add(iso)
      out.push({ iso, day })
    })
    mine.forEach(iso => claimed.add(iso))
  }
  return out
}

/** Weeks where a falling load is the plan, not a problem. */
function isEasingWeek(week: TrainingWeek): boolean {
  const kind = week.seasonRace?.blockKind
  if (kind === 'TAPER' || kind === 'RACE' || kind === 'RECOVER') return true
  return /taper|recover|race week|deload/i.test(week.focus ?? '')
}

const KEY_TYPES: ReadonlySet<WorkoutType> = new Set<WorkoutType>(['quality', 'long', 'race'])

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A short session name for a line: the plan's own words, trimmed. */
function sessionName(day: PlannedDay): string {
  const name = day.workout.trim() || day.type
  return name.length > 28 ? `${name.slice(0, 27).trimEnd()}…` : name
}

/**
 * Review the trailing seven days (today and the six before it).
 * Returns null when there is not enough load history to say anything.
 *
 * @param performance daily fitness/fatigue series, oldest first
 * @param dailyTrimp  daily training load, any order
 * @param signals     today's load / body / soreness reading
 * @param weeks       the dated plan, with logged actuals merged in
 * @param today       ISO date to treat as today (tests)
 */
export function buildWeekReview(
  performance: PerformanceMetrics[],
  dailyTrimp: DailyTRIMP[],
  signals: TrainingSignals,
  weeks?: TrainingWeek[],
  today: string = localDateStr(),
): WeekReview | null {
  const fromIso = shiftIso(today, -6)
  // The latest reading on or before today, against the last one on or
  // before the day the window opened — by date, not by position, so a gap
  // in the series can't shrink the week.
  const upTo = (iso: string) => {
    for (let i = performance.length - 1; i >= 0; i--) if (performance[i].date <= iso) return performance[i]
    return null
  }
  const latest = upTo(today)
  const weekAgo = upTo(shiftIso(today, -7)) ?? performance[0]
  if (!latest || !weekAgo || latest === weekAgo) return null

  const loadDays = dailyTrimp.filter(d => d.date >= fromIso && d.date <= today && d.total > 0)
  const trainedDates = new Set(loadDays.map(d => d.date))

  // ── Plan comparison ────────────────────────────────────────────
  const planDays = planDaysBetween(weeks, fromIso, today)
  const knowThePlan = planDays.length > 0
  // Done means a workout was matched to the session. Other load that day
  // (an e-bike commute the matcher refused to claim for a track session)
  // doesn't make the session done — but it isn't "not logged" either.
  const isDone = (w: WindowDay) => !!w.day.actual
  const hasLoad = (w: WindowDay) => !!w.day.actual || trainedDates.has(w.iso)
  const sessions = planDays.filter(w => w.day.type !== 'rest')
  const due = sessions.filter(w => w.iso < today || isDone(w))
  const matched = due.filter(isDone)
  const unlogged = due.filter(w => !hasLoad(w)).length
  const restDays = planDays.filter(w => w.day.type === 'rest' && w.iso <= today)
  const rested = restDays.filter(w => w.iso < today)
  const trainedOnRest = restDays.filter(isDone).length
  // A session done on a rest day while another sits unlogged is almost
  // always a swap: credit it as done and say nothing about either.
  const swaps = Math.min(unlogged, trainedOnRest)
  const notLogged = unlogged - swaps
  const trainedThroughRest = trainedOnRest - swaps
  const doneCount = matched.length + swaps
  const keyDone = matched.filter(w => KEY_TYPES.has(w.day.type))
  const easing = (weeks ?? []).some(w => w.startIso && w.startIso <= today && shiftIso(w.startIso, 6) >= fromIso && isEasingWeek(w))
    || planDays.some(w => w.day.type === 'race')

  const minutes = planDays.reduce((sum, w) => {
    const all = [w.day.actual, ...(w.day.secondaryActuals ?? [])]
    return sum + all.reduce((s, a) => s + (a?.movingTime ?? 0), 0)
  }, 0) / 60

  let hardest: WeekReviewStats['hardest'] = null
  if (loadDays.length > 0) {
    const top = loadDays.reduce((a, b) => (b.total > a.total ? b : a))
    const record = top.records.length
      ? top.records.reduce((a, b) => (b.adjustedTRIMP > a.adjustedTRIMP ? b : a))
      : null
    const planned = planDays.find(w => w.iso === top.date && w.day.actual)
    const name = record?.activityName?.trim()
      || (planned ? sessionName(planned.day) : '')
      || record?.sportType.replace(/_/g, ' ')
      || 'Workout'
    hardest = { iso: top.date, name }
  }

  const fitnessDelta = Math.round(latest.ctl - weekAgo.ctl)
  const tsbDelta = latest.tsb - weekAgo.tsb
  const bodyLow = signals.body.severity >= 2
  const soreness = signals.damage.severity >= 2
  const loadState = signals.load.noData ? null : signals.load.state

  // ── ✚ Going well ───────────────────────────────────────────────
  const wins: string[] = []
  if (due.length > 0 && doneCount === due.length) {
    wins.push(due.length === 1
      ? '✅ Your planned session is done.'
      : `✅ All ${due.length} planned sessions done.`)
  } else if (due.length > 0 && doneCount / due.length >= 0.8) {
    wins.push(`✅ ${doneCount} of ${due.length} planned sessions done — solid consistency.`)
  }
  if (keyDone.length > 0) {
    const names = keyDone.slice(-2).map(w => `${weekday(w.iso)} ${sessionName(w.day)}`).join(', ')
    wins.push(`🎯 ${keyDone.length === 1 ? 'Key session' : 'Key sessions'} landed: ${names}.`)
  }
  if (fitnessDelta >= 1) {
    wins.push(`📈 Fitness up ${fitnessDelta} ${fitnessDelta === 1 ? 'point' : 'points'} — the work is adding up.`)
  }
  if (loadState && ['balanced', 'productive', 'build'].includes(loadState) && !signals.rampAlert && loadDays.length > 0) {
    wins.push('⚖️ Your training load is in a safe range for your base.')
  }
  // Fresher only counts as a win when nothing planned went unlogged —
  // otherwise it is the skipped sessions talking — and the body agrees.
  if (tsbDelta >= 3 && loadDays.length > 0 && notLogged === 0 && !bodyLow && !soreness) {
    wins.push(`🌱 Fresher than a week ago (Recovery Balance +${Math.round(tsbDelta)}).`)
  }
  if (knowThePlan && rested.length > 0 && trainedThroughRest === 0 && notLogged === 0) {
    wins.push('😴 Rest days taken as planned.')
  }

  // ── △ To improve ───────────────────────────────────────────────
  const fixes: string[] = []
  if (loadState === 'danger') {
    fixes.push(tsbZone(latest.tsb).key === 'overreaching'
      ? '🛑 Fatigue has outrun your fitness — make the next 2–3 days easy or off.'
      : '🛑 Load jumped too fast this week — cut the next few days back to easy.')
  } else if (loadState === 'ramping' || signals.rampAlert) {
    fixes.push('⚠️ Load is climbing fast — hold next week’s volume flat rather than adding more.')
  }
  if (bodyLow) {
    fixes.push('💤 Recovery signals (HRV, sleep, resting HR) are below your baseline — keep today easy.')
  }
  if (soreness) {
    fixes.push('🦵 Soreness is building — skip heavy leg work until it settles.')
  }
  if (notLogged > 0) {
    const it = notLogged === 1 ? 'it' : 'them'
    fixes.push(`⭕ ${plural(notLogged, 'planned session isn’t', 'planned sessions aren’t')} logged — if you did ${it}, log ${it}; if not, don’t cram ${it} in.`)
  } else if (loadDays.length === 0 && !knowThePlan) {
    // With a dated plan the line above says it better; a plan that was
    // all rest needs no nudge.
    fixes.push('🗓️ No training logged in 7 days — if you trained, sync your watch; if not, restart with an easy 20–30 minutes.')
  }
  if (trainedDates.size >= 7) {
    fixes.push('🔥 No rest day in 7 days — take one in the next 48 hours.')
  } else if (trainedThroughRest > 0) {
    fixes.push(`😴 Trained through ${trainedThroughRest === 1 ? 'a planned rest day' : `${trainedThroughRest} planned rest days`} — keep the next one fully easy.`)
  }
  if (loadState === 'detrained' && loadDays.length > 0 && !easing) {
    fixes.push('📉 Your load has dropped below your base — add volume back gradually, about 10% a week.')
  }

  return {
    fromIso,
    toIso: today,
    stats: {
      planned: knowThePlan ? { done: doneCount, due: due.length } : null,
      daysTrained: trainedDates.size,
      trainingMinutes: minutes > 0 ? Math.round(minutes) : null,
      fitnessDelta,
      hardest,
    },
    wins: wins.slice(0, WEEK_REVIEW_MAX_LINES),
    fixes: fixes.slice(0, WEEK_REVIEW_MAX_LINES),
  }
}

/** "5h 20m", "45m". */
export function formatTrainingTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "Sep 19 – 25", or "Sep 29 – Oct 5" across a month boundary. */
export function formatReviewRange(fromIso: string, toIso: string): string {
  const from = new Date(`${fromIso}T12:00:00`)
  const to = new Date(`${toIso}T12:00:00`)
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return from.getMonth() === to.getMonth()
    ? `${month(from)} ${from.getDate()} – ${to.getDate()}`
    : `${month(from)} ${from.getDate()} – ${month(to)} ${to.getDate()}`
}
