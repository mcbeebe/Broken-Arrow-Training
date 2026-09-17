/**
 * The shape of a training week — which weekday carries which role.
 *
 * Until now the generators decided the layout: the method's pattern picked
 * which weekdays ran, strength and cross-training landed on whichever rest
 * day came first, Hyrox and General Fitness used fixed weekday tables, and
 * the only preference honored anywhere was the long-run day. The athlete
 * could see the result and could only argue with it through the coach.
 *
 * A WeekShape is that decision made explicit: seven weekdays, each with a
 * role. It is optional — an absent shape reproduces today's layout byte
 * for byte — and when present every generator honors it the same way:
 * the shape says WHERE each kind of day goes; the method still decides
 * WHAT each day is (which quality session, how long the long run, how
 * heavy the strength). Race week stays hand-authored.
 *
 * Roles are deliberately coarse. Six words an athlete would use, mapped by
 * each engine onto its own vocabulary (Hyrox "stations" is cross-training;
 * General Fitness "VO2max" is quality).
 */

import type { PlannedDay } from '../../types'
import type { DaySchedule, WorkoutCategory } from '../../types/training-method'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

export type DayRole = 'long' | 'quality' | 'run' | 'strength' | 'cross' | 'rest'

/** ISO weekday, 1 = Monday … 7 = Sunday — the road generator's convention. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type WeekShape = Record<Weekday, DayRole>

/** A shape that applies from a plan week onward. The athlete reshaped
 *  their week mid-plan: the weeks already trained keep the layout they
 *  were trained on; from `fromWeek` the new one holds. */
export interface WeekReshape {
  fromWeek: number
  shape: WeekShape
  /** Wall time it was made — the undo order and the sync sort key. */
  at: number
}

/** The shape in force for a plan week: the latest reshape whose
 *  `fromWeek` is at or before it, else the base shape, else none. */
export function effectiveShape(
  config: Pick<OnboardingConfig, 'weekShape' | 'weekReshapes'>,
  weekNumber: number,
): WeekShape | null {
  let best: WeekReshape | null = null
  for (const r of config.weekReshapes ?? []) {
    if (r.fromWeek <= weekNumber && (!best || r.fromWeek > best.fromWeek || (r.fromWeek === best.fromWeek && r.at > best.at))) best = r
  }
  return best?.shape ?? config.weekShape ?? null
}

/** The shape the plan's future runs on — what plan-level budgets follow. */
export function latestShape(config: Pick<OnboardingConfig, 'weekShape' | 'weekReshapes'>): WeekShape | null {
  const rs = config.weekReshapes ?? []
  if (rs.length === 0) return config.weekShape ?? null
  return rs.reduce((a, b) => (b.fromWeek > a.fromWeek || (b.fromWeek === a.fromWeek && b.at > a.at)) ? b : a).shape
}

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]
export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
export const WEEKDAY_LONG: Record<Weekday, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' }

export const DAY_ROLES: readonly DayRole[] = ['long', 'quality', 'run', 'strength', 'cross', 'rest']

/** Athlete-facing role names, per plan family. */
export function roleLabel(role: DayRole, plan: 'road' | 'trail' | 'hyrox' | 'general' = 'road'): string {
  switch (role) {
    case 'long': return plan === 'hyrox' ? 'Long / simulation' : plan === 'general' ? 'Long session' : 'Long run'
    case 'quality': return plan === 'hyrox' ? 'Run intervals' : plan === 'general' ? 'Hard cardio' : 'Quality'
    case 'run': return plan === 'general' ? 'Easy cardio' : 'Easy run'
    case 'strength': return 'Strength'
    case 'cross': return plan === 'hyrox' ? 'Stations' : 'Cross-train'
    case 'rest': return 'Rest'
  }
}

/** Tile-sized role names for the editor strip. */
export function roleShort(role: DayRole, plan: 'road' | 'trail' | 'hyrox' | 'general'): string {
  switch (role) {
    case 'long': return 'Long'
    case 'quality': return plan === 'hyrox' ? 'Intervals' : plan === 'general' ? 'Hard' : 'Quality'
    case 'run': return 'Easy'
    case 'strength': return 'Strength'
    case 'cross': return plan === 'hyrox' ? 'Stations' : 'Cross'
    case 'rest': return 'Rest'
  }
}

/** "5 training days — 3 running · 1 strength · 1 cross · 2 rest" */
export function describeCounts(shape: WeekShape, plan: 'road' | 'trail' | 'hyrox' | 'general'): string {
  const c = countRoles(shape)
  const parts: string[] = []
  if (c.running) parts.push(`${c.running} ${plan === 'general' ? 'cardio' : 'running'}`)
  if (c.strength) parts.push(`${c.strength} strength`)
  if (c.cross) parts.push(`${c.cross} ${plan === 'hyrox' ? 'stations' : 'cross'}`)
  return `${c.training} training day${c.training === 1 ? '' : 's'}${parts.length ? ` — ${parts.join(' · ')}` : ''} · ${c.rest} rest`
}

const HARD_ROLES: ReadonlySet<DayRole> = new Set(['long', 'quality'])
const RUNNING_ROLES: ReadonlySet<DayRole> = new Set(['long', 'quality', 'run'])

/** The role a generated day plays, read back from its type. */
export function roleOfDay(day: Pick<PlannedDay, 'type'>): DayRole {
  switch (day.type) {
    case 'long': return 'long'
    case 'quality': case 'race': return 'quality'
    case 'run': return 'run'
    case 'strength': return 'strength'
    case 'cross': return 'cross'
    default: return 'rest'
  }
}

const LABEL_TO_WEEKDAY: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** Weekday of a planned day from its "Sat 6/14" label; null when unreadable. */
export function weekdayOfDay(day: Pick<PlannedDay, 'day'>): Weekday | null {
  return LABEL_TO_WEEKDAY[day.day.slice(0, 3)] ?? null
}

/** The shape a generated week actually has. Missing weekdays (a partial
 *  first week) read as rest; null when no day label is readable. */
export function shapeFromDays(days: readonly PlannedDay[]): WeekShape | null {
  const shape = emptyShape()
  let any = false
  for (const d of days) {
    const wd = weekdayOfDay(d)
    if (wd == null) continue
    any = true
    shape[wd] = roleOfDay(d)
  }
  return any ? shape : null
}

export function emptyShape(): WeekShape {
  return { 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest', 7: 'rest' }
}

export interface RoleCounts {
  long: number; quality: number; run: number; strength: number; cross: number; rest: number
  /** long + quality + run — what a running method's pattern must supply. */
  running: number
  /** Everything but rest. */
  training: number
}

export function countRoles(shape: WeekShape): RoleCounts {
  const c: RoleCounts = { long: 0, quality: 0, run: 0, strength: 0, cross: 0, rest: 0, running: 0, training: 0 }
  for (const wd of WEEKDAYS) c[shape[wd]] += 1
  c.running = c.long + c.quality + c.run
  c.training = 7 - c.rest
  return c
}

export function sameShape(a: WeekShape | null | undefined, b: WeekShape | null | undefined): boolean {
  if (!a || !b) return a === b
  return WEEKDAYS.every(wd => a[wd] === b[wd])
}

/** "Mon rest · Tue quality · …" */
export function describeShape(shape: WeekShape, plan: 'road' | 'trail' | 'hyrox' | 'general' = 'road'): string {
  return WEEKDAYS.map(wd => `${WEEKDAY_SHORT[wd]} ${roleLabel(shape[wd], plan).toLowerCase()}`).join(' · ')
}

/** The week a reshape starts from when nobody named one: next week once
 *  this week has started (days already trained stay), else this week. */
export function defaultReshapeFromWeek(ctx: { currentWeekNum: number; lastWeekNum: number; weekStarted: boolean }): number {
  return ctx.weekStarted && ctx.currentWeekNum < ctx.lastWeekNum ? ctx.currentWeekNum + 1 : ctx.currentWeekNum
}

/** The weekdays whose role differs between two shapes. */
export function changedWeekdays(from: WeekShape, to: WeekShape): Weekday[] {
  return WEEKDAYS.filter(wd => from[wd] !== to[wd])
}

// ── Validation: what the engines can and cannot honor ──────────────────

export interface ShapeIssue {
  severity: 'error' | 'warn'
  code: 'no_rest' | 'three_hard' | 'too_few_days' | 'no_long' | 'two_long' | 'hard_adjacent' | 'run_days_out_of_range' | 'strength_before_hard' | 'no_stations' | 'no_run'
  message: string
}

export interface ShapeValidationContext {
  plan: 'road' | 'trail' | 'hyrox' | 'general'
  /** Running-day bounds the chosen method's patterns support (road/trail). */
  methodRunDays?: { min: number; max: number; name?: string }
}

/** Errors block confirming; warnings are said out loud and allowed. The
 *  errors mirror the plan QA's own laws (a full rest day every week; never
 *  three hard days in a row, including across the Sunday→Monday seam) so
 *  a shape that passes here never needs the generator's repair pass. */
export function validateWeekShape(shape: WeekShape, ctx: ShapeValidationContext): ShapeIssue[] {
  const issues: ShapeIssue[] = []
  const c = countRoles(shape)
  if (c.rest === 0) issues.push({ severity: 'error', code: 'no_rest', message: 'Keep at least one full rest day — every plan does, at every level.' })
  if (c.training < 3) issues.push({ severity: 'error', code: 'too_few_days', message: 'A plan needs at least three training days a week.' })

  // Three consecutive hard days, wrapping Sun→Mon because the shape repeats.
  const hard = WEEKDAYS.map(wd => HARD_ROLES.has(shape[wd]))
  for (let i = 0; i < 7; i++) {
    if (hard[i] && hard[(i + 1) % 7] && hard[(i + 2) % 7]) {
      const names = [i, i + 1, i + 2].map(j => WEEKDAY_SHORT[WEEKDAYS[j % 7]]).join(', ')
      issues.push({ severity: 'error', code: 'three_hard', message: `${names} would be three hard days in a row — hard days are capped at two, for every athlete, on every method.` })
      break
    }
  }

  if (ctx.plan !== 'general') {
    if (c.long === 0) issues.push({ severity: 'error', code: 'no_long', message: ctx.plan === 'hyrox' ? 'Give the long / simulation day a weekday — the race rehearsals live there.' : 'Give the long run a weekday — it is the one session every method builds around.' })
  } else if (c.long === 0 && c.running === 0) {
    issues.push({ severity: 'warn', code: 'no_run', message: 'No cardio day at all — the plan will be strength only.' })
  }
  if (c.long > 1) issues.push({ severity: 'warn', code: 'two_long', message: 'Two long days: the second becomes a medium-long, and both count as hard.' })

  // Hard days back to back (allowed, but said out loud).
  for (let i = 0; i < 7; i++) {
    if (hard[i] && hard[(i + 1) % 7]) {
      const a = WEEKDAYS[i], b = WEEKDAYS[(i + 1) % 7]
      issues.push({ severity: 'warn', code: 'hard_adjacent', message: `${WEEKDAY_SHORT[a]} ${roleLabel(shape[a], ctx.plan).toLowerCase()} runs straight into ${WEEKDAY_SHORT[b]} ${roleLabel(shape[b], ctx.plan).toLowerCase()} — two hard days back to back.` })
      break
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = WEEKDAYS[i], b = WEEKDAYS[(i + 1) % 7]
    if (shape[a] === 'strength' && HARD_ROLES.has(shape[b])) {
      issues.push({ severity: 'warn', code: 'strength_before_hard', message: `Strength on ${WEEKDAY_SHORT[a]} sits the day before ${WEEKDAY_SHORT[b]}'s ${roleLabel(shape[b], ctx.plan).toLowerCase()} — heavy legs into a hard day. The plan keeps that session lighter.` })
      break
    }
  }

  if ((ctx.plan === 'road' || ctx.plan === 'trail') && ctx.methodRunDays) {
    const { min, max, name } = ctx.methodRunDays
    if (c.running < min || c.running > max) {
      issues.push({
        severity: 'warn', code: 'run_days_out_of_range',
        message: `${name ?? 'This method'} is written for ${min}–${max} running days; you have ${c.running}. ${c.running < min ? 'Some of its sessions will not fit and are left out.' : 'The extra days become easy runs.'}`,
      })
    }
  }
  if (ctx.plan === 'hyrox') {
    if (c.cross === 0 && c.strength === 0) issues.push({ severity: 'warn', code: 'no_stations', message: 'No stations or strength day — Hyrox is half stations. The plan will put station work on the long day only.' })
    if (c.running === 0) issues.push({ severity: 'warn', code: 'no_run', message: 'No running day — half of Hyrox is 8 km of running.' })
  }
  return issues
}

export function shapeHasErrors(issues: readonly ShapeIssue[]): boolean {
  return issues.some(i => i.severity === 'error')
}

// ── Config normalization: the counts every generator budgets from ──────

/** A config whose day counts and long-run day agree with the shape, so
 *  every existing budget (running-day target, extras cap, volume factor)
 *  is computed from what the athlete actually laid out. */
export function configWithShape(config: OnboardingConfig, shape: WeekShape): OnboardingConfig {
  const c = countRoles(shape)
  const longDay = WEEKDAYS.find(wd => shape[wd] === 'long')
  return {
    ...config,
    trainingDaysPerWeek: c.training,
    strengthDaysPerWeek: c.strength,
    crossTrainingDaysPerWeek: c.cross,
    ...(longDay ? { longRunDay: WEEKDAY_LONG[longDay] } : {}),
  }
}

// ── Road / trail: permute a method pattern onto the shape ──────────────

function roleOfCategory(c: WorkoutCategory): DayRole {
  switch (c) {
    case 'rest': return 'rest'
    case 'cross_training': return 'cross'
    case 'strength': return 'strength'
    case 'long': return 'long'
    case 'easy': case 'recovery': case 'strides': return 'run'
    default: return 'quality'
  }
}

/** Which of a week's authored entries to give up when the shape has fewer
 *  slots of a role than the pattern supplies: plain easy days first,
 *  strides next, quality after that. The long run is never dropped here —
 *  a shape with no long slot is refused by validation. */
const DROP_ORDER: readonly DayRole[] = ['run', 'quality', 'long']

/**
 * Lay the method's weekly pattern onto the athlete's shape. Every entry
 * keeps its authored content (category, preferred workouts, modifiers) and
 * only its weekday moves: the pattern's long run goes to the shape's long
 * day, its quality sessions to the quality days in weekday order, its easy
 * runs to the run days. A run day the pattern cannot fill becomes an easy
 * run; a quality day it cannot fill becomes an easy run too (the method's
 * quality budget is not inflated). Strength, cross and rest days come out
 * as `rest` here — injectExtraDays fills the strength/cross slots the
 * shape names. Returns calendar order.
 */
export function applyShapeToSchedule(schedule: readonly DaySchedule[], shape: WeekShape): DaySchedule[] {
  const pool: Record<DayRole, DaySchedule[]> = { long: [], quality: [], run: [], strength: [], cross: [], rest: [] }
  for (const d of [...schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) pool[roleOfCategory(d.category)].push(d)
  // The primary long run is the last-authored one (Pfitzinger's midweek
  // medium-long comes first); the shape's first long weekday gets it only
  // when there is exactly one long slot — with two, weekday order wins.
  const out: DaySchedule[] = []
  const take = (role: DayRole): DaySchedule | undefined => pool[role].shift()
  for (const wd of WEEKDAYS) {
    const role = shape[wd]
    let entry: DaySchedule | undefined
    if (role === 'long') entry = pool.long.length > 1 ? take('long') : pool.long.pop()
    else if (role === 'quality') entry = take('quality') ?? take('run')
    else if (role === 'run') entry = take('run')
    if (RUNNING_ROLES.has(role)) {
      out.push(entry
        ? { ...entry, dayOfWeek: wd }
        : { dayOfWeek: wd, category: 'easy' })
    } else {
      out.push({ dayOfWeek: wd, category: 'rest' })
    }
  }
  // Whatever the shape had no slot for is left out, cheapest first.
  for (const role of DROP_ORDER) pool[role].length = 0
  return out
}

/** Indices into `days` of the shape's strength and cross slots — what
 *  injectExtraDays fills instead of "the first rest days". A day whose
 *  label cannot be read, or a slot the week does not contain (a partial
 *  first week), is skipped. Only rest days qualify: a shape slot the
 *  method's schedule already occupies (a running day the shape did not
 *  ask for, in race week) is never overwritten. */
export function extraSlotsForDays(days: readonly PlannedDay[], shape: WeekShape): { strength: number[]; cross: number[] } {
  const strength: number[] = [], cross: number[] = []
  days.forEach((d, i) => {
    if (d.type !== 'rest') return
    const wd = weekdayOfDay(d)
    if (wd == null) return
    if (shape[wd] === 'strength') strength.push(i)
    else if (shape[wd] === 'cross') cross.push(i)
  })
  return { strength, cross }
}

// ── Hyrox and General Fitness: weekday tables and role arrays ──────────

/** JS `Date.getDay()` numbering (0 = Sunday) the Hyrox and General Fitness
 *  engines use for their weekday tables. */
export function jsWeekday(wd: Weekday): number {
  return wd === 7 ? 0 : wd
}

export type HyroxRole = 'run' | 'strength' | 'strength_stations' | 'stations' | 'run_conditioning' | 'easy' | 'long'

/** The Hyrox engine's training weekdays and role sequence for a shape.
 *  Roles come out in weekday order, which is how the engine consumes
 *  them. With strength but no stations day, the strength slot carries
 *  the combined strength+stations session (the 3-day template's own
 *  answer); with neither, station work lives on the long day only. */
export function hyroxLayoutFromShape(shape: WeekShape): { trainingDayNumbers: number[]; roles: HyroxRole[] } {
  const c = countRoles(shape)
  const trainingDayNumbers: number[] = []
  const roles: HyroxRole[] = []
  let runsSeen = 0
  for (const wd of WEEKDAYS) {
    const role = shape[wd]
    if (role === 'rest') continue
    trainingDayNumbers.push(jsWeekday(wd))
    switch (role) {
      case 'long': roles.push('long'); break
      case 'quality': roles.push('run_conditioning'); break
      case 'run': roles.push(runsSeen++ === 0 ? 'run' : 'easy'); break
      case 'strength': roles.push(c.cross === 0 ? 'strength_stations' : 'strength'); break
      case 'cross': roles.push('stations'); break
    }
  }
  return { trainingDayNumbers, roles }
}

export type GeneralRole = 'strength' | 'zone2' | 'vo2max' | 'long' | 'cross'

/** The General Fitness engine's training weekdays and pillar roles for a
 *  shape, in weekday order. */
export function generalLayoutFromShape(shape: WeekShape): { slots: number[]; roles: GeneralRole[] } {
  const slots: number[] = []
  const roles: GeneralRole[] = []
  for (const wd of WEEKDAYS) {
    const role = shape[wd]
    if (role === 'rest') continue
    slots.push(jsWeekday(wd))
    switch (role) {
      case 'long': roles.push('long'); break
      case 'quality': roles.push('vo2max'); break
      case 'run': roles.push('zone2'); break
      case 'strength': roles.push('strength'); break
      case 'cross': roles.push('cross'); break
    }
  }
  return { slots, roles }
}
