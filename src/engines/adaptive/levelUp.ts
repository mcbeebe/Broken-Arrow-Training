import type { PlannedDay, TrainingWeek } from '../../types'
import { analyzeSimSplits } from '../../utils/simAnalysis'
import { parsePlannedTargets, parseDistance } from '../../utils/targets'
import { scoreWeekExecution, longestRunCapMi } from './execution'
import { buildAthleteModel } from './athleteModel'

/**
 * Level Up (Adaptive Engine phase 2, PR 6) — the accelerator. At any
 * moment, the top levers that would move the athlete to the next level,
 * ranked from their own evidence. The defensive layers say "back off";
 * this answers the question every athlete actually asks: what should I
 * do to get better, faster?
 *
 * House rules from the approved design:
 *  - Never more than 3, never filler — a lever with no evidence simply
 *    doesn't fire, and an athlete with nothing to fix sees nothing.
 *  - Every lever carries its measured evidence and its expected payoff.
 *  - Anything that ADDS load states its headroom check — "faster" never
 *    becomes "reckless".
 *
 * v1 levers use signals the app already holds. The sleep-before-hard-
 * days lever from the mockup joins when the daily-health join lands
 * (phase 3), with the same contract.
 */

export interface LevelUpLever {
  id: 'weak-station' | 'easy-day-discipline' | 'extend-long-run'
  title: string
  /** The measured fact this lever stands on. */
  evidence: string
  /** What doing it buys, concretely. */
  payoff: string
  /** The one-tap action (v1: opens the coach with this ask). */
  actionLabel: string
  /** Seed handed to the coach conversation when tapped. */
  coachSeed: string
  kind: 'structure' | 'execution'
}

const RUN_TYPES = new Set(['run', 'quality', 'long', 'race'])

function fmtLost(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/** The most recent simulation's weak-station analysis, if any. */
function weakStationLever(weeks: TrainingWeek[], todayIso: string, headroom: boolean): LevelUpLever | null {
  let latest: { iso: string; day: PlannedDay } | null = null
  for (const week of weeks) {
    for (const day of week.days) {
      const splits = day.actual?.stationSplits
      const iso = day.actual?.startDate?.slice(0, 10)
      if (!splits || !iso || iso > todayIso) continue
      if (!splits.some(s => s.kind === 'run') || !splits.some(s => s.kind === 'station')) continue
      if (!latest || iso > latest.iso) latest = { iso, day }
    }
  }
  if (!latest) return null
  const analysis = analyzeSimSplits(latest.day.actual!.stationSplits!)
  const weak = analysis.weakStation
  if (!weak) return null
  const station = weak.label.split(' — ')[0]
  return {
    id: 'weak-station',
    title: `Extra ${station.toLowerCase()} work`,
    evidence: `Your ${latest.iso} simulation lost ~${fmtLost(weak.lostSec)} on ${station.toLowerCase()} against your own race shape.`,
    payoff: headroom
      ? `The biggest race-time lever you have — and your training load has headroom for one more station session.`
      : `The biggest race-time lever you have. Load is near your cap, so swap it INTO an easy day rather than adding on top.`,
    actionLabel: headroom ? `Add a weekly ${station.toLowerCase()} session` : `Swap an easy day for ${station.toLowerCase()} work`,
    coachSeed: `My last simulation lost ~${fmtLost(weak.lostSec)} on ${station}. ${headroom ? 'Add a weekly station session focused on it.' : 'Swap one easy day for station work focused on it — my load is near cap.'}`,
    kind: 'structure',
  }
}

/** Easy days drifting above their zone — the polarization lever. */
function easyDayLever(weeks: TrainingWeek[], todayIso: string): LevelUpLever | null {
  const windowStart = new Date(`${todayIso}T12:00:00`)
  windowStart.setDate(windowStart.getDate() - 28)
  const startIso = windowStart.toISOString().slice(0, 10)

  let easyRuns = 0
  let hotRuns = 0
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.type !== 'run') continue
      const a = day.actual
      const iso = a?.startDate?.slice(0, 10)
      if (!a || !iso || iso < startIso || iso > todayIso || !a.avgHR) continue
      const t = parsePlannedTargets(day)
      if (t.hrHigh == null) continue
      easyRuns += 1
      if (a.avgHR > t.hrHigh + 2) hotRuns += 1
    }
  }
  if (easyRuns < 3 || hotRuns / easyRuns < 0.4) return null
  return {
    id: 'easy-day-discipline',
    title: 'Make easy days actually easy',
    evidence: `${hotRuns} of your last ${easyRuns} easy runs came in above their heart-rate zone.`,
    payoff: 'That hidden fatigue is taxing your quality days — capping easy runs buys harder hard days for free.',
    actionLabel: 'Cap my easy runs at zone',
    coachSeed: `${hotRuns} of my last ${easyRuns} easy runs were above zone. Help me keep easy days honest — what pace should I actually hold?`,
    kind: 'execution',
  }
}

/** Clean execution streak + spike-cap headroom → earn a longer long run. */
function extendLongRunLever(weeks: TrainingWeek[], todayIso: string): LevelUpLever | null {
  // The last two FINISHED weeks (all days dated before today) must both
  // come back 'advance'.
  const finished = weeks
    .filter(w => w.days.length > 0 && w.days.every(d => {
      const iso = d.actual?.startDate?.slice(0, 10)
      return d.type === 'rest' || d.actual == null || (iso != null && iso < todayIso)
    }))
    .filter(w => w.days.some(d => d.actual))
    .slice(-2)
  if (finished.length < 2) return null
  if (!finished.every(w => scoreWeekExecution(w, todayIso).verdict === 'advance')) return null

  const cap = longestRunCapMi(weeks, todayIso)
  if (cap == null) return null
  // The next unlogged long run, if it sits below the cap, has headroom.
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.type !== 'long' || day.actual) continue
      const planned = parseDistance(day.zone)
      if (!planned || planned >= cap) return null
      const target = Math.min(cap, Math.round((planned + 1) * 10) / 10)
      return {
        id: 'extend-long-run',
        title: 'Extend the long run',
        evidence: 'Two clean weeks in a row — every session done, targets held, drift in range.',
        payoff: `You've earned headroom: up to ${cap} mi stays inside the +10% single-run guard (planned: ${planned} mi).`,
        actionLabel: `Stretch it to ${target} mi`,
        coachSeed: `I've had two clean weeks. Extend my next long run from ${planned} to ${target} mi — it stays under my ${cap} mi spike cap.`,
        kind: 'structure',
      }
    }
  }
  return null
}

/**
 * The top levers right now, ranked: quantified race-time levers first,
 * execution discipline second, earned progression third.
 */
export function buildLevelUp(weeks: TrainingWeek[], todayIso: string): LevelUpLever[] {
  const model = buildAthleteModel(weeks, todayIso)
  // Headroom for ADDING load: measured trailing volume at or under the
  // current planned week's target.
  const currentWeek = weeks.find(w =>
    w.days.some(d => !d.actual) && w.days.some(d => d.actual),
  ) ?? weeks.find(w => w.days.some(d => !d.actual))
  const headroom = model.weeklyRunMiles4wk != null && currentWeek != null
    ? model.weeklyRunMiles4wk <= currentWeek.miles
    : false

  const levers = [
    weakStationLever(weeks, todayIso, headroom),
    easyDayLever(weeks, todayIso),
    extendLongRunLever(weeks, todayIso),
  ].filter((l): l is LevelUpLever => l != null)

  return levers.slice(0, 3)
}
