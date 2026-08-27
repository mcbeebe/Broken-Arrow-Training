import type { GarminHealthData, PlannedDay, TrainingWeek } from '../../types'
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
 * v1 levers use signals the app already holds; the sleep-before-hard-
 * days lever joined with phase 3's daily-health join, same contract.
 */

export interface LevelUpLever {
  id: 'weak-station' | 'easy-day-discipline' | 'sleep-before-hard-days' | 'extend-long-run'
    | 'benchmark-engine' | 'race-rehearsal'
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

/** Short nights before hard sessions — the lifestyle lever from the
 *  mockup ("roll at night and get sleep"), live now that the daily-
 *  health join exists. Same-date join: a health record's sleep IS the
 *  night before that day's session. */
function sleepBeforeHardDaysLever(
  weeks: TrainingWeek[],
  todayIso: string,
  health: GarminHealthData[],
): LevelUpLever | null {
  if (health.length === 0) return null
  const windowStart = new Date(`${todayIso}T12:00:00`)
  windowStart.setDate(windowStart.getDate() - 28)
  const startIso = windowStart.toISOString().slice(0, 10)
  const sleepByDate = new Map(
    health.filter(h => h.sleep?.durationSeconds).map(h => [h.date, h.sleep!.durationSeconds]),
  )

  let hardWithData = 0
  let shortNights = 0
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.type !== 'quality' && day.type !== 'long') continue
      const iso = day.actual?.startDate?.slice(0, 10)
      if (!iso || iso < startIso || iso > todayIso) continue
      const sleepSec = sleepByDate.get(iso)
      if (sleepSec == null) continue
      hardWithData += 1
      if (sleepSec < 7 * 3600) shortNights += 1
    }
  }
  if (hardWithData < 3 || shortNights / hardWithData < 0.4) return null
  return {
    id: 'sleep-before-hard-days',
    title: 'Protect sleep before hard days',
    evidence: `${shortNights} of your last ${hardWithData} hard sessions came after less than 7 hours of sleep.`,
    payoff: 'The hard day you already scheduled hits harder when it lands on real recovery — free fitness from the same plan.',
    actionLabel: 'Plan my nights before hard days',
    coachSeed: `${shortNights} of my last ${hardWithData} hard sessions came after under 7 hours of sleep. Help me set up a night-before routine so quality days land on real recovery.`,
    kind: 'execution',
  }
}

/** The doing-fine lever: when nothing is broken, the fastest way up is
 *  sharper inputs. Fires while critical speed is missing or still a
 *  best-effort floor — but only once there IS running history, so a
 *  brand-new athlete isn't lectured about data they haven't made. */
function benchmarkEngineLever(model: ReturnType<typeof buildAthleteModel>): LevelUpLever | null {
  const cs = model.criticalSpeed
  const hasHistory = model.weeklyRunMiles4wk != null || cs != null
  if (!hasHistory || (cs != null && cs.method === 'linear-fit')) return null
  return {
    id: 'benchmark-engine',
    title: 'Benchmark your engine',
    evidence: cs == null
      ? 'Your paces still rest on onboarding estimates — no sustained hard effort in your log yet.'
      : `Your critical speed is a best-effort floor from ${cs.effortCount} run${cs.effortCount === 1 ? '' : 's'} — a real test would sharpen it.`,
    payoff: 'One 20-minute time trial upgrades every training pace, the spike caps, and the race projection at once.',
    actionLabel: 'Schedule a benchmark time trial',
    coachSeed: 'My critical speed is still a best-effort estimate. Schedule a 20-minute benchmark time trial into my plan so my paces come from a real test.',
    kind: 'structure',
  }
}

/** Hyrox plans: a fresh simulation is the sharpest signal the station
 *  intelligence and the projection have. Fires when none has landed in
 *  the last 5 weeks. */
function raceRehearsalLever(
  weeks: TrainingWeek[],
  todayIso: string,
  raceType: string | null | undefined,
): LevelUpLever | null {
  if (raceType !== 'hyrox') return null
  const windowStart = new Date(`${todayIso}T12:00:00`)
  windowStart.setDate(windowStart.getDate() - 35)
  const startIso = windowStart.toISOString().slice(0, 10)
  for (const week of weeks) {
    for (const day of week.days) {
      const iso = day.actual?.startDate?.slice(0, 10)
      if (!iso || iso < startIso || iso > todayIso) continue
      const splits = day.actual?.stationSplits
      if (splits?.some(s => s.kind === 'run') && splits.some(s => s.kind === 'station')) return null
    }
  }
  // Something must still be trainable — an all-logged plan has no slot.
  if (!weeks.some(w => w.days.some(d => !d.actual && d.type !== 'rest' && d.type !== 'race'))) return null
  return {
    id: 'race-rehearsal',
    title: 'Run a race simulation',
    evidence: 'No simulation with station splits in your last 5 weeks — sims are the sharpest signal your weak-station analysis and projection have.',
    payoff: 'One half-sim tells you exactly where the minutes hide, and every projection after it tightens.',
    actionLabel: 'Plan a half simulation',
    coachSeed: 'I have not done a race simulation in over a month. Fit a half simulation into my plan so my station analysis and projection work from fresh data.',
    kind: 'structure',
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
export function buildLevelUp(
  weeks: TrainingWeek[],
  todayIso: string,
  opts: { health?: GarminHealthData[]; raceType?: string | null } = {},
): LevelUpLever[] {
  const model = buildAthleteModel(weeks, todayIso)
  // Headroom for ADDING load: measured trailing volume at or under the
  // current planned week's target.
  const currentWeek = weeks.find(w =>
    w.days.some(d => !d.actual) && w.days.some(d => d.actual),
  ) ?? weeks.find(w => w.days.some(d => !d.actual))
  const headroom = model.weeklyRunMiles4wk != null && currentWeek != null
    ? model.weeklyRunMiles4wk <= Number(currentWeek.miles)
    : false

  const levers = [
    weakStationLever(weeks, todayIso, headroom),
    easyDayLever(weeks, todayIso),
    sleepBeforeHardDaysLever(weeks, todayIso, opts.health ?? []),
    // Doing-fine levers: nothing to fix ≠ nothing to gain.
    benchmarkEngineLever(model),
    raceRehearsalLever(weeks, todayIso, opts.raceType),
    extendLongRunLever(weeks, todayIso),
  ].filter((l): l is LevelUpLever => l != null)

  return levers.slice(0, 3)
}
