import type { GarminHealthData, PlannedDay, TrainingWeek } from '../../types'
import { analyzeSimSplits } from '../../utils/simAnalysis'
import { parsePlannedTargets, parseDistance } from '../../utils/targets'
import { dayIsoInWeek } from '../../utils/planDates'
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
    | 'benchmark-engine' | 'race-rehearsal' | 'tonight-recovery' | 'core-mobility'
  title: string
  /** The measured fact this lever stands on. */
  evidence: string
  /** What doing it buys, concretely. */
  payoff: string
  /** The one-tap action: expands the steps below in the card. */
  actionLabel: string
  /** Seed for the optional "tailor this" coach ask. */
  coachSeed: string
  kind: 'structure' | 'execution'
  /** 'now' = doable today (core, mobility, tonight's sleep);
   *  'plan' = a refinement built into the training plan (TT, sim). */
  horizon: 'now' | 'plan'
  /** The concrete how-to, shown when the athlete taps the action. */
  steps: string[]
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
    horizon: 'plan',
    steps: [
      headroom
        ? `Add one ${station.toLowerCase()} session per week — 20–30 min, fresh legs, not after a run.`
        : `Swap one easy day for a ${station.toLowerCase()} session — don't add it on top of current load.`,
      'Work at race weight/distance: 3–4 quality sets with full recovery beats volume.',
      'Finish each session with 2×1 min at faster-than-race effort to raise the ceiling.',
      'Re-test in your next simulation — the split tells you if it moved.',
    ],
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
    horizon: 'plan',
    steps: [
      'On your next easy run, set a heart-rate alert at the top of the zone printed on the day card.',
      'When it fires, slow down — walk if you have to. Pace ego is the enemy here.',
      'Talk test: full sentences should be comfortable the whole run.',
      'Give it two weeks — the same pace at lower heart rate is the payoff showing up.',
    ],
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
    horizon: 'now',
    steps: [
      'Check tomorrow: if it\'s a quality or long day, tonight is the night that matters.',
      'Set a hard screens-off alarm 8.5 hours before your wake time.',
      'Keep the last meal 2+ hours before bed; skip alcohol on night-befores.',
      'Same wake time every day — consistency beats duration for HRV.',
    ],
  }
}

/** Tonight's recovery block — fires when today's overnight signals are
 *  down (readiness, short sleep, or drained body battery), the moment
 *  the athlete can actually do something about it: tonight. */
function tonightRecoveryLever(
  todayIso: string,
  health: GarminHealthData[],
  readinessDown: boolean,
): LevelUpLever | null {
  const today = health.find(h => h.date === todayIso)
  const sleepSec = today?.sleep?.durationSeconds ?? null
  const battery = today?.bodyBattery?.current ?? null
  const shortSleep = sleepSec != null && sleepSec < 7 * 3600
  const drained = battery != null && battery < 55
  if (!readinessDown && !shortSleep && !drained) return null

  const facts: string[] = []
  if (readinessDown) facts.push('recovery signals are down')
  if (shortSleep) facts.push(`${(sleepSec! / 3600).toFixed(1)}h of sleep last night`)
  if (drained) facts.push(`body battery at ${battery}`)
  return {
    id: 'tonight-recovery',
    title: 'Recovery block tonight',
    evidence: `Today's data says it plainly: ${facts.join(' · ')}. Tonight is the one lever you can pull before tomorrow's session.`,
    payoff: "Tomorrow's workout lands on a charged body instead of digging the hole deeper — recovery is where the fitness gets banked.",
    actionLabel: "Show me tonight's routine",
    coachSeed: `My recovery signals are down today (${facts.join(', ')}). Walk me through the ideal recovery evening before tomorrow's session.`,
    kind: 'execution',
    horizon: 'now',
    steps: [
      '10 min foam roll: calves, quads, glutes — slow passes, breathe.',
      '10 min easy stretch or hip mobility (Myrtl routine) — movement, not intensity.',
      'Early, light dinner; water topped up through the evening.',
      'Screens off 30 min early, target 8 hours — tonight is a training session.',
    ],
  }
}

/** Rest-day core + hips — low-load work that adds durability without
 *  touching recovery. Fires only on an actual rest day, so it is an
 *  answer to "what CAN I do today?", never added load on training days. */
function coreMobilityLever(weeks: TrainingWeek[], todayIso: string): LevelUpLever | null {
  for (const week of weeks) {
    for (const day of week.days) {
      if (dayIsoInWeek(day.day, week, todayIso) !== todayIso) continue
      if (day.type !== 'rest') return null
      return {
        id: 'core-mobility',
        title: 'Rest-day core + hips',
        evidence: "Today is a rest day — 15 minutes of low-load core and hip work adds durability without touching what rest is for.",
        payoff: 'A stronger trunk and open hips make every run and station cheaper — built on days that cost nothing.',
        actionLabel: 'Show me the 15-minute routine',
        coachSeed: "It's a rest day. Give me a 15-minute core and hip mobility routine that won't interfere with recovery.",
        kind: 'execution',
        horizon: 'now',
        steps: [
          'Myrtl hip circuit: leg swings, clamshells, fire hydrants, donkey kicks — 8–10 reps each side.',
          'Core circuit ×3: 45s front plank · 30s side plank each side · 10 slow dead bugs.',
          'Finish with 60s couch stretch per side.',
          'Keep it easy — if it feels like a workout, you did too much. Rest still leads today.',
        ],
      }
    }
  }
  return null
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
    horizon: 'plan',
    steps: [
      'Pick a fresh-legs day this week or next — not the day after a hard session.',
      'Warm up 10 min easy + 4 strides.',
      'Run 20 minutes at the hardest pace you can hold EVENLY — flat route or track.',
      'Log it like any run — the model picks up the effort and recalibrates your paces automatically.',
    ],
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
    horizon: 'plan',
    steps: [
      'Book a weekend slot 60–90 min at a gym with erg, sled, and wall-ball space.',
      'Half-sim: 4×1 km runs alternating with 4 stations at race weights, halved race distances.',
      'Record each split — lap your watch at every transition.',
      'Log it with station splits; the weak-station analysis and projection update from it.',
    ],
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
        horizon: 'plan',
        steps: [
          `Stretch the next long run from ${planned} to ${target} mi — same easy effort, just longer.`,
          'Keep the pace honest: this is time-on-feet, not a race.',
          'Fuel if it crosses 75 minutes; water either way.',
          'If heart-rate drift stays under 5%, the extension held — the next one can stretch again.',
        ],
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
  opts: {
    health?: GarminHealthData[]
    raceType?: string | null
    /** Today's readiness is YELLOW/RED — arms the tonight lever. */
    readinessDown?: boolean
  } = {},
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

  // Two horizons, both capped: what you can do TODAY (core, mobility,
  // tonight's sleep) and what gets built INTO the plan (TT, sim,
  // structure). Deficiency-backed levers outrank doing-fine ones
  // within each horizon.
  const nowLevers = [
    tonightRecoveryLever(todayIso, opts.health ?? [], opts.readinessDown ?? false),
    sleepBeforeHardDaysLever(weeks, todayIso, opts.health ?? []),
    coreMobilityLever(weeks, todayIso),
  ].filter((l): l is LevelUpLever => l != null).slice(0, 2)

  const planLevers = [
    weakStationLever(weeks, todayIso, headroom),
    easyDayLever(weeks, todayIso),
    // Doing-fine levers: nothing to fix ≠ nothing to gain.
    benchmarkEngineLever(model),
    raceRehearsalLever(weeks, todayIso, opts.raceType),
    extendLongRunLever(weeks, todayIso),
  ].filter((l): l is LevelUpLever => l != null).slice(0, 2)

  return [...nowLevers, ...planLevers]
}
