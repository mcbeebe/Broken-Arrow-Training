/**
 * The today-anchored narrative: what we're working on RIGHT NOW, why this
 * week is shaped the way it is, and where that sits in the whole arc.
 *
 * `raceNarrative.ts` answers "where am I in the season" for the Race view.
 * This answers the question an athlete actually opens the app with —
 * "what am I doing today and why does it matter" — and it belongs on the
 * home screen, not three taps away.
 *
 * Deterministic and pure: same plan + same day → same words. The LLM
 * coach layer (TodayBriefing) sits alongside this and speaks to the
 * athlete's CURRENT state; this speaks to the plan's INTENT, which never
 * needs a network call to be true.
 */
import type { PlannedDay, RaceInfo, TrainingWeek, Season } from '../types'
import { raceDateToIso } from '../engines/season'
import { todayDateString } from './planDates'

export interface TodayNarrativeInput {
  /** Today's planned day, when the plan covers today. */
  day: PlannedDay | null | undefined
  /** The week today belongs to. */
  week: TrainingWeek | null | undefined
  /** 1-indexed week number of `week` within the plan. */
  weekNum: number
  totalWeeks: number
  race?: RaceInfo | null
  season?: Season | null
  /** Injectable "today" (ISO) for deterministic tests. */
  todayIso?: string
}

export interface TodayNarrative {
  /** Short banner line — the session's role in one phrase. */
  headline: string
  /** What today is, and what it is FOR. */
  today: string
  /** How today sits inside this week's shape. */
  week: string
  /** Where this week sits in the arc toward race day. */
  arc: string
}

type Role = 'key' | 'long' | 'easy' | 'strength' | 'cross' | 'rest' | 'race'

function roleOf(day: PlannedDay): Role {
  switch (day.type) {
    case 'race': return 'race'
    case 'long': return 'long'
    case 'quality': return 'key'
    case 'strength': return 'strength'
    case 'cross': return 'cross'
    case 'rest': return 'rest'
    default: return 'easy'
  }
}

/** True when the race has meaningful vertical. Guards the climbing copy —
 *  an indoor Hyrox floor is not a mountain, and telling a Hyrox athlete
 *  their strength work protects against "the pounding of Flat (indoor)
 *  descending" reads as a template that never looked at their race. */
export function hasRealVert(race?: RaceInfo | null): boolean {
  if (!race) return false
  if (typeof race.elevationGainFt === 'number') return race.elevationGainFt >= 1000
  if (race.format === 'hyrox') return false
  const text = `${race.elevation ?? ''} ${race.course ?? ''}`
  if (/\bflat\b|\bindoor\b|\btrack\b/i.test(text)) return false
  const ft = /([\d,]+)\s*(?:ft|feet|'|vert)/i.exec(race.elevation ?? '')
  if (ft) return parseInt(ft[1].replace(/,/g, ''), 10) >= 1000
  return false
}

function daysToRace(race: RaceInfo | null | undefined, todayIso: string): number | null {
  const iso = race ? raceDateToIso(race.date) : null
  if (!iso) return null
  return Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86_400_000)
}

const HARD_TYPES = new Set(['quality', 'long', 'race'])

/** How many hard days this week, and where today falls among them. */
function weekShape(week: TrainingWeek | null | undefined, day: PlannedDay | null | undefined) {
  const days = week?.days ?? []
  const hard = days.filter(d => HARD_TYPES.has(d.type))
  const rest = days.filter(d => d.type === 'rest')
  const idx = day ? days.indexOf(day) : -1
  const hardIdx = day && HARD_TYPES.has(day.type) ? hard.indexOf(day) : -1
  const remainingHard = idx >= 0 ? days.slice(idx + 1).filter(d => HARD_TYPES.has(d.type)).length : 0
  return { hardCount: hard.length, restCount: rest.length, hardIdx, remainingHard }
}

function headlineFor(role: Role, isCutback: boolean): string {
  switch (role) {
    case 'race': return 'Race day'
    case 'long': return "Today is the week's anchor"
    case 'key': return "Today is the week's key session"
    case 'strength': return 'Today is durability work'
    case 'cross': return 'Today is aerobic work without the pounding'
    case 'rest': return 'Today is rest — and it counts'
    case 'easy': return isCutback ? 'Today is easy, in an easy week' : 'Today is easy on purpose'
  }
}

function todayCopy(role: Role, day: PlannedDay, vert: boolean): string {
  switch (role) {
    case 'race':
      return 'Everything in the plan pointed here. Nothing you do today adds fitness — it only spends what you already built. Execute the plan you rehearsed.'
    case 'long':
      return `${day.workout} is the session the rest of the week is arranged around. Long, continuous, aerobic work is what grows the engine — the adaptations it drives (capillary density, fat oxidation, tendon and bone tolerance) come from duration, not from effort. Running it too fast is the single most common way athletes lose the benefit${vert ? ', and on this course the descending you practise here is what protects your quads on race day' : ''}.`
    case 'key':
      return `${day.workout} is the week's quality session — the one that asks for real effort. This is where race-specific fitness is made: everything else in the week either prepares for it or absorbs it. Hit the prescribed effort, not a harder one; the dose is the point, and exceeding it borrows from the next session.`
    case 'strength':
      return `${day.workout} is here to keep you durable, not to make you a lifter. Strength work is the best-evidenced injury reducer available to runners, and it protects the specific tissues your training loads hardest${vert ? ' — especially the eccentric strength that descending demands' : ''}.`
    case 'cross':
      return `${day.workout} buys aerobic work without the impact cost. It adds to your engine while your legs get a break from the pounding — which is exactly why it sits where it does in the week.`
    case 'rest':
      return 'Rest is when training becomes fitness. The work you did this week gets absorbed today — skip it and you keep the fatigue without the adaptation. Nothing to prove today.'
    case 'easy':
      return `${day.workout} is deliberately easy. Easy days exist to let the hard days be hard: they add aerobic volume at a cost your body can absorb by tomorrow. If it feels too slow, it is working.`
  }
}

function weekCopy(
  role: Role,
  week: TrainingWeek | null | undefined,
  shape: ReturnType<typeof weekShape>,
  isCutback: boolean,
): string {
  const focus = (week?.focus ?? '').replace(/\s*·\s*replanned\s*$/i, '').trim()
  const focusClause = focus ? `This week's job: ${focus.replace(/\.$/, '')}.` : ''

  if (isCutback) {
    return `${focusClause} Volume steps down on purpose this week — the fitness from the last block lands while the load is light. Cutback weeks are the reason the next build works.`.trim()
  }
  if (role === 'rest' || role === 'easy' || role === 'cross') {
    return `${focusClause} ${shape.remainingHard > 0
      ? `${shape.remainingHard} hard ${shape.remainingHard === 1 ? 'session' : 'sessions'} still to come this week — today's easy work is what makes ${shape.remainingHard === 1 ? 'it' : 'them'} possible.`
      : "The week's hard work is behind you. What's left is absorption."}`.trim()
  }
  return `${focusClause} ${shape.hardCount <= 1
    ? 'It is the only hard day on the calendar this week, which is why it gets the whole week to be ready for it.'
    : `It is one of ${shape.hardCount} hard days this week, spaced deliberately — never three in a row, and never two quality sessions without recovery between them.`}`.trim()
}

function arcCopy(
  weekNum: number,
  totalWeeks: number,
  race: RaceInfo | null | undefined,
  toRace: number | null,
  season: Season | null | undefined,
  todayIso: string,
): string {
  const raceName = race?.name?.trim() || 'race day'
  const weeksLeft = Math.max(0, totalWeeks - weekNum)
  const progress = totalWeeks > 0 ? weekNum / totalWeeks : 0

  const where = progress <= 0.3
    ? `Week ${weekNum} of ${totalWeeks} — you are still laying base. The work right now is unglamorous by design: it builds the aerobic floor everything later stands on.`
    : progress <= 0.7
      ? `Week ${weekNum} of ${totalWeeks} — the build. Training turns race-specific from here: the sessions start to look like the demands of ${raceName}.`
      : weeksLeft <= 1
        ? `Week ${weekNum} of ${totalWeeks} — taper. Volume drops so fatigue clears and the fitness you already own comes to the surface. Restlessness now is the taper working.`
        : `Week ${weekNum} of ${totalWeeks} — the sharp end. This is the heaviest the plan gets, and it is meant to feel that way; the next weeks convert it.`

  const countdown = toRace !== null && toRace >= 0
    ? ` ${toRace === 0 ? `${raceName} is today.` : `${toRace} ${toRace === 1 ? 'day' : 'days'} to ${raceName}.`}`
    : ''

  // Multi-race seasons: name the main goal so a stepping-stone block never
  // reads as the whole season.
  if (season) {
    const dated = season.races
      .map(r => ({ r, iso: raceDateToIso(r.raceInfo.date) }))
      .filter((x): x is { r: (typeof season.races)[number]; iso: string } => x.iso !== null)
      .sort((a, b) => a.iso.localeCompare(b.iso))
    if (dated.length >= 2) {
      const primary = dated.find(x => x.r.isPrimary) ?? dated[dated.length - 1]
      if (primary.r.raceInfo.name !== race?.name) {
        const out = Math.max(0, Math.round(
          (Date.parse(`${primary.iso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86_400_000,
        ))
        return `${where}${countdown} And this block is a stepping stone — your main goal is ${primary.r.raceInfo.name}, ${out} days out. Fitness banked here carries straight into it.`
      }
    }
  }

  return `${where}${countdown}`
}

/**
 * Build the home-screen narrative for today. Returns null only when there
 * is no plan day to talk about — the caller renders nothing.
 */
export function generateTodayNarrative(input: TodayNarrativeInput): TodayNarrative | null {
  const { day, week, weekNum, totalWeeks, race, season } = input
  if (!day || !week) return null

  const todayIso = input.todayIso ?? todayDateString()
  const role = roleOf(day)
  const vert = hasRealVert(race)
  const isCutback = /recover|cutback|down week|step back/i.test(week.focus ?? '')
  const shape = weekShape(week, day)
  const toRace = daysToRace(race, todayIso)

  return {
    headline: headlineFor(role, isCutback),
    today: todayCopy(role, day, vert),
    week: weekCopy(role, week, shape, isCutback),
    arc: arcCopy(weekNum, totalWeeks, race, toRace, season, todayIso),
  }
}
