import type { PerformanceMetrics, PlannedDay, RaceInfo, TrainingWeek, WorkoutType } from '../types'
import { daysUntilRace, weeksUntilRace } from './raceCountdown'

/**
 * Race-readiness presentation layer.
 *
 * Combines existing signals (CTL from PerformanceMetrics, race distance and
 * elevation from RaceInfo, days-until-race from raceCountdown) into a
 * single-card summary the athlete can read in five seconds:
 *
 *   "You are X% ready for {race}.
 *    Ahead on fitness, behind on vert.
 *    Next 3 weeks: {one concrete action}."
 *
 * This is intentionally a *composition* of existing engine outputs — no new
 * physiology model. The percent is a normalised distance between current CTL
 * and a target CTL determined by race distance.
 */

export type ReadinessGap = 'fitness' | 'vert' | 'taper' | 'on-track'

export interface RaceReadinessSummary {
  /** Overall readiness, 0–100. */
  pct: number
  /** Single short sentence safe to drop in a card header. */
  headline: string
  /** Which dimension is the dominant gap right now. */
  gap: ReadinessGap
  /** One concrete corrective action for the next few weeks. */
  nextAction: string
  /** Echoed for the card subhead. */
  weeksLeft: number
  daysLeft: number
}

/** Approximate target CTL for a race of `distanceMiles`. Conservative anchors. */
function targetCtl(distanceMiles: number): number {
  if (distanceMiles <= 3.5) return 35 // 5K
  if (distanceMiles <= 7) return 40 // 10K
  if (distanceMiles <= 14) return 55 // half / 18K
  if (distanceMiles <= 27) return 65 // marathon / 50K-ish
  return 75 // ultra
}

/** Elevation tier — "vert-heavy" races punish under-trained legs more. */
function isVertHeavy(distanceMiles: number, elevationFt: number): boolean {
  if (distanceMiles <= 0) return false
  const ftPerMi = elevationFt / distanceMiles
  return ftPerMi >= 150 // ≈ 30 m/km, the trail-running threshold
}

/** Per-mile elevation threshold above which we surface weekly vertical-gain
 *  tracking (compliance row, volume chart, dashboard summary). Set lower
 *  than the vert-heavy "this is your limiter" gap (150 ft/mi) so any race
 *  with meaningful climb gets the metric in front of the athlete. */
export const VERT_TRACKING_FT_PER_MI = 100

/** True when a race profile is climby enough that the athlete should be
 *  tracking weekly vertical gain alongside weekly mileage. Parses the
 *  free-form `elevation` string ("3,000 ft") the same way the readiness
 *  engine does. */
export function shouldTrackVerticalGain(race: RaceInfo | null | undefined): boolean {
  if (!race) return false
  const distanceMiles = race.distanceMiles || 0
  if (distanceMiles <= 0) return false
  const elevationFt = parseRaceElevationFt(race)
  if (elevationFt <= 0) return false
  return elevationFt / distanceMiles > VERT_TRACKING_FT_PER_MI
}

/** Parse the race's elevation string ("3,000 ft", "8000 ft") to a number. */
export function parseRaceElevationFt(race: RaceInfo | null | undefined): number {
  if (!race) return 0
  return parseInt((race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0
}

interface Inputs {
  race: RaceInfo
  performance: PerformanceMetrics[]
  now?: Date
}

export function computeRaceReadiness({ race, performance, now }: Inputs): RaceReadinessSummary | null {
  if (!race?.date) return null
  const days = daysUntilRace(race.date, now)
  const weeks = weeksUntilRace(race.date, now)
  if (days == null || weeks == null) return null

  const latest = performance.length > 0 ? performance[performance.length - 1] : null
  const ctl = latest?.ctl ?? 0
  const tsb = latest?.tsb ?? 0

  const distanceMiles = race.distanceMiles || 0
  const elevationFt = parseInt((race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0
  const target = targetCtl(distanceMiles)
  const fitnessPct = Math.max(0, Math.min(100, Math.round((ctl / target) * 100)))

  // Race-day taper window — last 2 weeks before the race.
  if (days <= 14 && days >= 0) {
    if (tsb < 0) {
      return {
        pct: Math.min(fitnessPct, Math.max(20, Math.round(70 + tsb))),
        headline: `${days} days out — still carrying fatigue.`,
        gap: 'taper',
        nextAction: 'Cut volume 30–40% this week; let recovery balance climb above +5 by race day.',
        weeksLeft: weeks,
        daysLeft: days,
      }
    }
    return {
      pct: Math.max(fitnessPct, 85),
      headline: `${days} days out — you're peaking.`,
      gap: 'on-track',
      nextAction: 'Maintain easy volume, dial in race-day fueling, and protect sleep.',
      weeksLeft: weeks,
      daysLeft: days,
    }
  }

  // Build window — fitness is the dominant signal.
  if (fitnessPct < 70 && weeks > 2) {
    return {
      pct: fitnessPct,
      headline: `${weeks} weeks out — fitness is the gap.`,
      gap: 'fitness',
      nextAction: `Add 1 easy aerobic session per week; aim for a CTL of ${target} by race week.`,
      weeksLeft: weeks,
      daysLeft: days,
    }
  }

  if (isVertHeavy(distanceMiles, elevationFt) && fitnessPct >= 60 && weeks > 2) {
    return {
      pct: Math.min(fitnessPct, 80),
      headline: `${weeks} weeks out — fitness on track, vert is the gap.`,
      gap: 'vert',
      nextAction: `Add one ${Math.round(elevationFt / 6)} ft hill workout per week for the next ${Math.min(weeks - 1, 3)} weeks.`,
      weeksLeft: weeks,
      daysLeft: days,
    }
  }

  return {
    pct: Math.min(95, Math.max(fitnessPct, 75)),
    headline: `${weeks} weeks out — you're on track.`,
    gap: 'on-track',
    nextAction: 'Keep the plan; add one race-specific session per week.',
    weeksLeft: weeks,
    daysLeft: days,
  }
}

// ─── Workout-anchored detail layer ────────────────────────────────
//
// The hero card answers "Am I ready?" — but the athlete's next question is
// always "OK, then what do I actually change this week?". The detail layer
// resolves the readiness gap against the existing plan, naming the specific
// days and workouts that should shift and explicitly stating what NOT to
// touch (easy days, strength, etc.) so the prescription doesn't leak into
// recovery work.

export interface ReadinessAssignment {
  /** "Thu 5/14" — pulled straight from the planned day's label. */
  dayLabel: string
  workoutType: WorkoutType
  /** Current planned workout name (e.g. "Hill repeats"). */
  plannedName: string
  /** Current planned detail string, for side-by-side comparison. */
  plannedDetail: string
  /** Imperative — what to change. */
  action: string
  /** Quantified target / structure. */
  target: string
}

export interface ReadinessWeekItem {
  weekNum: number
  /** "Wk 5 · May 11–17" */
  weekLabel: string
  focus: string
  assignments: ReadinessAssignment[]
}

export interface ReadinessGuidance {
  category: 'easy' | 'quality' | 'long' | 'strength' | 'cross'
  label: string
  text: string
}

export interface RaceReadinessDetail {
  /** Why this gap matters — 1–2 sentences. */
  why: string
  /** Workout-anchored "next X weeks" line for the card (replaces summary.nextAction). */
  specificNextAction: string
  /** Per-week itemized assignments aligned to existing planned workouts. */
  weeks: ReadinessWeekItem[]
  /** What to do for every other workout category — keeps the prescription
   *  from leaking into recovery work. */
  guidance: ReadinessGuidance[]
  horizonWeeks: number
}

function findPlannedDay(week: TrainingWeek, types: WorkoutType[]): PlannedDay | undefined {
  return week.days.find(d => types.includes(d.type))
}

function dayShort(label: string): string {
  return label.split(/\s+/)[0]
}

function getUpcomingWeeks(weeks: TrainingWeek[], currentWeekNum: number, horizon: number): TrainingWeek[] {
  if (horizon <= 0) return []
  return weeks
    .filter(w => w.num >= currentWeekNum && w.num < currentWeekNum + horizon)
    .slice(0, horizon)
}

interface DetailInputs {
  summary: RaceReadinessSummary
  weeks: TrainingWeek[]
  currentWeekNum: number
  race: RaceInfo
}

function buildVertDetail({ summary, weeks, currentWeekNum, race }: DetailInputs): RaceReadinessDetail {
  const elevationFt = parseInt((race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0
  const targetClimbFt = Math.round(elevationFt / 6)
  const ftPerMi = race.distanceMiles > 0 ? Math.round(elevationFt / race.distanceMiles) : 0
  const horizonWeeks = Math.max(1, Math.min(summary.weeksLeft - 1, 3))
  const upcoming = getUpcomingWeeks(weeks, currentWeekNum, horizonWeeks)

  const weekItems: ReadinessWeekItem[] = upcoming.map(week => {
    const assignments: ReadinessAssignment[] = []
    const qualityDay = findPlannedDay(week, ['quality']) || findPlannedDay(week, ['run'])
    if (qualityDay) {
      const reps = Math.max(4, Math.round(targetClimbFt / 100))
      assignments.push({
        dayLabel: qualityDay.day,
        workoutType: qualityDay.type,
        plannedName: qualityDay.workout,
        plannedDetail: qualityDay.detail || '',
        action: `Confirm hill day climbs ~${targetClimbFt} ft total`,
        target: `${reps}×3 min @ Z3–4 uphill, jog-down recovery — power-hike if HR spikes`,
      })
    }
    const longDay = findPlannedDay(week, ['long'])
    if (longDay) {
      assignments.push({
        dayLabel: longDay.day,
        workoutType: 'long',
        plannedName: longDay.workout,
        plannedDetail: longDay.detail || '',
        action: 'Hilly route — match race profile',
        target: `≥100 ft/mi (race is ~${ftPerMi} ft/mi) · practice power-hiking grades >12%`,
      })
    }
    return {
      weekNum: week.num,
      weekLabel: `Wk ${week.num} · ${week.dates}`,
      focus: week.focus,
      assignments,
    }
  })

  const firstQuality = upcoming[0] && (findPlannedDay(upcoming[0], ['quality']) || findPlannedDay(upcoming[0], ['run']))
  const firstLong = upcoming[0] && findPlannedDay(upcoming[0], ['long'])
  const qDay = firstQuality ? dayShort(firstQuality.day) : 'Thu'
  const lDay = firstLong ? dayShort(firstLong.day) : 'Sun'
  const specificNextAction = upcoming.length > 0
    ? `${qDay} hill day → ~${targetClimbFt} ft total climb. ${lDay} long run → hilly route, 100+ ft/mi. Easy days stay flat.`
    : summary.nextAction

  const guidance: ReadinessGuidance[] = [
    { category: 'easy', label: 'Easy days', text: 'Keep flat or rolling, conversational pace. Adding climbing here turns easy days hard and steals adaptation from the hill workout.' },
    { category: 'long', label: 'Long runs', text: `Now is the time to match race profile — aim for 100+ ft/mi (race is ~${ftPerMi} ft/mi). Practice power-hiking steep sections; don't try to run everything.` },
    { category: 'quality', label: 'Quality / hill day', text: `One vert-focused session per week, ~${targetClimbFt} ft total climbing. Don't double up — concentrated stimulus + recovery beats two diluted sessions.` },
    { category: 'strength', label: 'Strength', text: 'Keep as planned. Single-leg work (split squats, step-ups) and eccentric calf raises are exactly the right prep — no changes needed.' },
    { category: 'cross', label: 'Cross-train', text: 'Power-hike or stair-mill if you want bonus vert; bike/erg are fine neutral aerobic. No second hard hill day.' },
  ]

  const why = `${race.name} climbs ~${elevationFt.toLocaleString()} ft over ${race.distance}${ftPerMi ? ` (~${ftPerMi} ft/mi)` : ''}. Fitness is on track, but climbing-specific load is the limiter. Three focused weeks of vert can close this gap without adding overall volume — the trick is concentrating it in one quality day plus a hilly long run, not sprinkling it everywhere.`

  return { why, specificNextAction, weeks: weekItems, guidance, horizonWeeks }
}

function buildFitnessDetail({ summary, weeks, currentWeekNum, race }: DetailInputs): RaceReadinessDetail {
  const target = targetCtl(race.distanceMiles || 0)
  const horizonWeeks = Math.max(1, Math.min(summary.weeksLeft - 1, 3))
  const upcoming = getUpcomingWeeks(weeks, currentWeekNum, horizonWeeks)

  const weekItems: ReadinessWeekItem[] = upcoming.map(week => {
    const assignments: ReadinessAssignment[] = []
    const crossDay = findPlannedDay(week, ['cross'])
    if (crossDay) {
      assignments.push({
        dayLabel: crossDay.day,
        workoutType: 'cross',
        plannedName: crossDay.workout,
        plannedDetail: crossDay.detail || '',
        action: 'Swap to an easy aerobic run (if joints allow)',
        target: '30–45 min Z1–2 · truly conversational',
      })
    }
    const longDay = findPlannedDay(week, ['long'])
    if (longDay) {
      assignments.push({
        dayLabel: longDay.day,
        workoutType: 'long',
        plannedName: longDay.workout,
        plannedDetail: longDay.detail || '',
        action: 'Extend ~10% over last week',
        target: 'Cap at Z2 · practice race-day fueling',
      })
    }
    return {
      weekNum: week.num,
      weekLabel: `Wk ${week.num} · ${week.dates}`,
      focus: week.focus,
      assignments,
    }
  })

  const firstCross = upcoming[0] && findPlannedDay(upcoming[0], ['cross'])
  const firstLong = upcoming[0] && findPlannedDay(upcoming[0], ['long'])
  const cDay = firstCross ? dayShort(firstCross.day) : 'Sat'
  const lDay = firstLong ? dayShort(firstLong.day) : 'Sun'
  const specificNextAction = upcoming.length > 0
    ? `${cDay} cross-train → swap to 30–45 min easy run. ${lDay} long run → extend ~10%/wk. Target CTL ~${target}.`
    : summary.nextAction

  const guidance: ReadinessGuidance[] = [
    { category: 'easy', label: 'Easy days', text: 'Build duration, not pace. An extra 5–10 minutes on each easy run is the fastest CTL builder you have.' },
    { category: 'long', label: 'Long runs', text: 'Extend ~10% week-over-week. Cap at Z2. Practice fueling — this is the workout that builds race-day endurance.' },
    { category: 'quality', label: 'Quality day', text: 'Keep as planned but cap intensity at Z3 until CTL climbs. Sharpening before the aerobic base is built backfires.' },
    { category: 'strength', label: 'Strength', text: 'Keep — protects against injury as weekly running volume rises. Don\'t skip to free up time for running.' },
    { category: 'cross', label: 'Cross-train', text: 'If joints tolerate it, swap cross for an extra easy run — that\'s the highest-leverage CTL move you have right now.' },
  ]

  const why = `Your fitness (CTL) is below the typical target (~${target}) for a ${race.distance}. The fastest fix is more aerobic minutes, not harder workouts — every ~10% bump in weekly easy volume raises CTL without raising injury risk.`

  return { why, specificNextAction, weeks: weekItems, guidance, horizonWeeks }
}

function buildTaperDetail({ summary, weeks, currentWeekNum }: DetailInputs): RaceReadinessDetail {
  const horizonWeeks = Math.max(1, Math.min(summary.weeksLeft, 2))
  const upcoming = getUpcomingWeeks(weeks, currentWeekNum, horizonWeeks)

  const weekItems: ReadinessWeekItem[] = upcoming.map(week => {
    const assignments: ReadinessAssignment[] = []
    const qualityDay = findPlannedDay(week, ['quality'])
    if (qualityDay) {
      assignments.push({
        dayLabel: qualityDay.day,
        workoutType: 'quality',
        plannedName: qualityDay.workout,
        plannedDetail: qualityDay.detail || '',
        action: 'Final sharpener — short and crisp',
        target: '4×2 min @ race effort, full recovery between',
      })
    }
    const longDay = findPlannedDay(week, ['long'])
    if (longDay) {
      assignments.push({
        dayLabel: longDay.day,
        workoutType: 'long',
        plannedName: longDay.workout,
        plannedDetail: longDay.detail || '',
        action: 'Cut to ~60% of peak long run',
        target: 'Z1–2 only · no race-pace surges · stay flat',
      })
    }
    const strengthDay = findPlannedDay(week, ['strength'])
    if (strengthDay) {
      assignments.push({
        dayLabel: strengthDay.day,
        workoutType: 'strength',
        plannedName: strengthDay.workout,
        plannedDetail: strengthDay.detail || '',
        action: 'Skip heavy lower-body',
        target: 'Bodyweight maintenance only · core + mobility OK',
      })
    }
    return {
      weekNum: week.num,
      weekLabel: `Wk ${week.num} · ${week.dates}`,
      focus: week.focus,
      assignments,
    }
  })

  const specificNextAction = 'Cut total volume 30–40%. One short sharpener mid-week, easy short runs otherwise, skip heavy strength.'

  const guidance: ReadinessGuidance[] = [
    { category: 'easy', label: 'Easy days', text: '20–30 min Z1–2 only. The work is already done — your job now is to protect it.' },
    { category: 'long', label: 'Long run', text: '~60% of your peak long-run volume. Stay flat and easy — no race-profile previews.' },
    { category: 'quality', label: 'Sharpener', text: 'One short, crisp session early in the week. Race day needs sharpness, not residual fatigue.' },
    { category: 'strength', label: 'Strength', text: 'Skip heavy lower-body. Bodyweight, core, and mobility only this week.' },
    { category: 'cross', label: 'Cross-train', text: 'Optional — keep it short and only if it leaves you feeling fresher, not depleted.' },
  ]

  const why = `You're inside the taper window. Carrying fatigue into race week costs more than missed fitness gains. Cutting volume now lets recovery balance climb above +5 by race morning, which is the single best predictor of race-day legs.`

  return { why, specificNextAction, weeks: weekItems, guidance, horizonWeeks }
}

function buildOnTrackDetail({ summary, weeks, currentWeekNum, race }: DetailInputs): RaceReadinessDetail {
  const elevationFt = parseInt((race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0
  const ftPerMi = race.distanceMiles > 0 ? Math.round(elevationFt / race.distanceMiles) : 0
  const horizonWeeks = Math.max(1, Math.min(summary.weeksLeft - 1, 2))
  const upcoming = getUpcomingWeeks(weeks, currentWeekNum, horizonWeeks)

  const weekItems: ReadinessWeekItem[] = upcoming.map(week => {
    const assignments: ReadinessAssignment[] = []
    const qualityDay = findPlannedDay(week, ['quality'])
    if (qualityDay) {
      assignments.push({
        dayLabel: qualityDay.day,
        workoutType: 'quality',
        plannedName: qualityDay.workout,
        plannedDetail: qualityDay.detail || '',
        action: 'Race-specific session — rehearse race demands',
        target: '3–4×1 mi @ goal-race effort on terrain that mimics the course',
      })
    }
    const longDay = findPlannedDay(week, ['long'])
    if (longDay) {
      assignments.push({
        dayLabel: longDay.day,
        workoutType: 'long',
        plannedName: longDay.workout,
        plannedDetail: longDay.detail || '',
        action: 'Mimic race profile',
        target: ftPerMi > 0 ? `~${ftPerMi} ft/mi · full race-day kit · final fueling dress rehearsal` : 'Full race-day kit · final fueling dress rehearsal',
      })
    }
    return {
      weekNum: week.num,
      weekLabel: `Wk ${week.num} · ${week.dates}`,
      focus: week.focus,
      assignments,
    }
  })

  const firstQuality = upcoming[0] && findPlannedDay(upcoming[0], ['quality'])
  const firstLong = upcoming[0] && findPlannedDay(upcoming[0], ['long'])
  const qDay = firstQuality ? dayShort(firstQuality.day) : 'Thu'
  const lDay = firstLong ? dayShort(firstLong.day) : 'Sun'
  const specificNextAction = upcoming.length > 0
    ? `${qDay} quality → race-specific reps. ${lDay} long run → race-profile rehearsal. Stay easy on easy days.`
    : summary.nextAction

  const guidance: ReadinessGuidance[] = [
    { category: 'easy', label: 'Easy days', text: 'Stay easy. The base is built — protect it. No surprise pickups, no "feeling good" tempo creep.' },
    { category: 'long', label: 'Long runs', text: 'Use the next 1–2 long runs as race rehearsals: same shoes, same kit, same nutrition, similar terrain.' },
    { category: 'quality', label: 'Quality day', text: 'Race-specific work — rehearse the exact demands of race day at race effort, not faster.' },
    { category: 'strength', label: 'Strength', text: 'Maintain through 2 weeks out, then back off heavy lower-body work as you enter the taper.' },
    { category: 'cross', label: 'Cross-train', text: 'Keep as planned. Don\'t add load — you\'re sharpening, not building.' },
  ]

  const why = `Fitness and specificity are aligned for ${race.name}. The remaining work is rehearsal: bring race-day demands into one quality session and one long run per week so race morning feels familiar, not novel.`

  return { why, specificNextAction, weeks: weekItems, guidance, horizonWeeks }
}

export function buildRaceReadinessDetail(args: DetailInputs): RaceReadinessDetail {
  switch (args.summary.gap) {
    case 'vert': return buildVertDetail(args)
    case 'fitness': return buildFitnessDetail(args)
    case 'taper': return buildTaperDetail(args)
    case 'on-track': return buildOnTrackDetail(args)
  }
}
