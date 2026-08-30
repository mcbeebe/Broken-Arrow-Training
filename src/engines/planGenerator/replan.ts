/**
 * Phase 5 (PRD-110) — Adaptation v1: deterministic missed-workout
 * replanning. Static plans die on contact with life; these four pure
 * rules cover ~90% of real interruptions with zero new data
 * requirements.
 *
 * DOCTRINE — enforced in code, not prose:
 *  - Missed work is never made up. The plan bends FORWARD, never back.
 *  - A replan never increases a week's volume.
 *  - A replan never violates the schedule mandates (never-3-hard,
 *    guaranteed rest) — every rule re-checks before committing, and the
 *    full QA property suite runs over replanned output in CI.
 *  - Weeks a rule touched are tagged "· replanned": their old volume
 *    target no longer applies (adherence skips them) and they never
 *    serve as ramp baselines.
 *
 * Precedence vs the daily readiness tips (DayCard): replanning is
 * STRUCTURAL — it rewrites days. The per-day readiness tip advises
 * within whatever day the plan currently shows and never contradicts a
 * replan; when a day was rewritten by a rule, the note on the card IS
 * the coaching, and tips apply to it like any other day.
 *
 * v2 (deferred, E12): readiness-signal integration. The input interface
 * is typed below (ReadinessSignalV2) so ATE integration lands without
 * schema churn; nothing consumes it yet.
 */
import type { TrainingPlan, TrainingWeek, PlannedDay } from '../../types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import { estimateDayMiles } from '../planQA/validatePlan'
import { generatePlanFromMethod } from './generatePlan'

/** v2 stub — typed now, consumed later (HRV-guided adjustment shows
 *  small–moderate benefit vs fixed plans; JSAMS 2021 meta). */
export interface ReadinessSignalV2 {
  dateIso: string
  hrvMs?: number
  restingHrBpm?: number
  sleepHours?: number
}

const HARD_TYPES = new Set(['quality', 'long', 'race'])
const isHardDay = (d: PlannedDay) =>
  HARD_TYPES.has(d.type) || (d.type === 'strength' && /heavy strength \(4–6|explosive power/i.test(d.detail ?? ''))

const REPLAN_TAG = ' · replanned'

function tagWeek(w: TrainingWeek): TrainingWeek {
  return {
    ...w,
    focus: w.focus.includes(REPLAN_TAG) ? w.focus : `${w.focus}${REPLAN_TAG}`,
    // The pre-interruption target no longer describes this week.
    targetMi: undefined,
  }
}

function recomputeMiles(w: TrainingWeek): TrainingWeek {
  return { ...w, miles: Math.round(w.days.reduce((t, d) => t + estimateDayMiles(d), 0) * 10) / 10 }
}

/** Resolve a calendar date to its week/day position. Null when the plan
 *  doesn't cover the date (or the week predates startIso tracking). */
export function locateDay(plan: TrainingPlan, iso: string): { weekIdx: number; dayIdx: number } | null {
  for (let wi = 0; wi < plan.weeks.length; wi++) {
    const w = plan.weeks[wi]
    if (!w.startIso) continue
    const start = Date.parse(`${w.startIso}T12:00:00`)
    const offset = Math.round((Date.parse(`${iso}T12:00:00`) - start) / 86_400_000)
    if (offset >= 0 && offset < w.days.length) return { weekIdx: wi, dayIdx: offset }
  }
  return null
}

const skippedDay = (d: PlannedDay, note: string): PlannedDay => ({
  ...d,
  type: 'rest',
  workout: 'Missed — skipped',
  detail: note,
  zone: '—',
  time: '—',
  plannedWorkout: undefined,
})

/**
 * Rule 1 — short gap (1–2 missed days): skip them. No redistribution,
 * no make-up volume; the week proceeds as scheduled from today.
 */
export function replanShortGap(plan: TrainingPlan, missedIsos: string[]): TrainingPlan {
  const weeks = [...plan.weeks]
  const touched = new Set<number>()
  for (const iso of missedIsos) {
    const loc = locateDay(plan, iso)
    if (!loc) continue
    const w = { ...weeks[loc.weekIdx], days: [...weeks[loc.weekIdx].days] }
    if (w.days[loc.dayIdx].type === 'race' || w.days[loc.dayIdx].type === 'rest' || w.days[loc.dayIdx].locked) continue
    w.days[loc.dayIdx] = skippedDay(w.days[loc.dayIdx],
      'Missed and skipped — the plan bends forward, never backward. Nothing to make up.')
    weeks[loc.weekIdx] = w
    touched.add(loc.weekIdx)
  }
  for (const wi of touched) weeks[wi] = recomputeMiles(tagWeek(weeks[wi]))
  return { ...plan, weeks }
}

/**
 * Rule 2 — missed KEY session (quality or long): swap it into the next
 * easy day only when that day is in the same week and sits ≥48 h before
 * the next hard day; otherwise skip it (Rule 1). Never creates a
 * consecutive-hard violation — checked before committing.
 */
export function replanMissedKeySession(plan: TrainingPlan, missedIso: string): TrainingPlan {
  const loc = locateDay(plan, missedIso)
  if (!loc) return plan
  const week = plan.weeks[loc.weekIdx]
  const missed = week.days[loc.dayIdx]
  // A locked day is fixed — the athlete pinned it, so leave it exactly as
  // authored rather than moving or skipping it.
  if (missed.locked) return plan
  if (!HARD_TYPES.has(missed.type) || missed.type === 'race') {
    return replanShortGap(plan, [missedIso])
  }
  // Candidates: every easy run day left in the SAME week. A rejected
  // candidate only rules out THAT day — keep looking. (These two checks
  // used to `break`, which abandoned the whole search on the first
  // rejection and silently skipped a session the athlete was told had
  // been moved.)
  for (let j = loc.dayIdx + 1; j < week.days.length; j++) {
    if (week.days[j].type !== 'run') continue
    if (week.days[j].locked) continue  // never move a session onto a pinned day

    // ≥48 h from the following hard day: the next day must not be hard.
    const next = week.days[j + 1]
    if (next && isHardDay(next)) continue
    // Simulate the swap and re-check the mandate window.
    const days = [...week.days]
    days[j] = { ...missed, day: days[j].day }
    days[loc.dayIdx] = skippedDay(missed, 'Missed — this key session moved later in the week.')
    const flags = days.map(isHardDay)
    let run = 0
    let ok = true
    for (const f of flags) {
      run = f ? run + 1 : 0
      if (run >= 3) { ok = false; break }
    }
    if (!ok) continue
    const weeks = [...plan.weeks]
    weeks[loc.weekIdx] = recomputeMiles(tagWeek({ ...week, days }))
    return { ...plan, weeks }
  }
  return replanShortGap(plan, [missedIso])
}

/** What "move it later this week" will actually do. The engine falls back
 *  to a skip when no later day in the week is legal, and the athlete is
 *  entitled to know which one they are about to get — before they tap, not
 *  after. Derived by running the real rule and reading its output, so this
 *  can never drift from the logic it describes. */
export type MoveOutcome =
  | { kind: 'moved'; toDay: string }
  | { kind: 'skipped' }

export function moveOutcomeFor(weeks: TrainingWeek[], missedIso: string): MoveOutcome {
  // The rule only ever reads plan.weeks; wrapping is cheaper than threading
  // a whole TrainingPlan through the UI just to preview one sentence.
  const before = { weeks } as TrainingPlan
  const loc = locateDay(before, missedIso)
  if (!loc) return { kind: 'skipped' }
  const original = weeks[loc.weekIdx].days[loc.dayIdx]

  const after = replanMissedKeySession(before, missedIso)
  const week = after.weeks[loc.weekIdx]
  if (!/moved later/i.test(week.days[loc.dayIdx].detail ?? '')) return { kind: 'skipped' }

  const landed = week.days.find((d, i) =>
    i !== loc.dayIdx && d.type === original.type && d.workout === original.workout)
  return landed ? { kind: 'moved', toDay: landed.day } : { kind: 'skipped' }
}

/**
 * Rule 3 — long gap (≥7 days): regenerate the remainder from where the
 * athlete actually is. Mirrors the season-splice continuity contract:
 * the new build starts from 0.85 × the last COMPLETED week's volume,
 * same race, remaining runway. Feasibility and the undertrained-arrival
 * advisories re-fire naturally (runway_short / peak_unreachable may now
 * be the honest answer).
 */
export function regenerateRemainder(
  method: TrainingMethod,
  config: OnboardingConfig,
  lastCompletedWeekMiles: number,
  todayIso: string,
): TrainingPlan {
  const carried = Math.max(0, Math.round(lastCompletedWeekMiles * 0.85 * 10) / 10)
  return generatePlanFromMethod(method, {
    ...config,
    currentWeeklyMileage: carried > 0 ? carried : config.currentWeeklyMileage,
    planStartDate: undefined,
  } as OnboardingConfig, todayIso)
}

/**
 * Rule 4 — illness: from the resumption day, at least two easy days
 * before anything hard. Hard days inside that window are demoted with a
 * card note; the fever line is fixed copy (never train hard with one).
 */
export function replanAfterIllness(plan: TrainingPlan, resumeIso: string): TrainingPlan {
  const loc = locateDay(plan, resumeIso)
  if (!loc) return plan
  const weeks = plan.weeks.map(w => ({ ...w, days: [...w.days] }))
  let easyDays = 0
  const touched = new Set<number>()
  outer:
  for (let wi = loc.weekIdx; wi < weeks.length; wi++) {
    for (let di = wi === loc.weekIdx ? loc.dayIdx : 0; di < weeks[wi].days.length; di++) {
      if (easyDays >= 2) break outer
      const d = weeks[wi].days[di]
      if (d.type === 'race') break outer // never rewrite race day
      if (d.locked) continue // a pinned day is left exactly as authored
      if (isHardDay(d)) {
        weeks[wi].days[di] = {
          ...d,
          type: 'run',
          workout: 'Easy return run',
          detail: 'Eased — first days back after illness stay easy; hard training resumes once two easy days feel normal. Never train hard with a fever.',
          zone: d.zone,
          plannedWorkout: undefined,
        }
        touched.add(wi)
        easyDays += 1
      } else if (d.type === 'run') {
        easyDays += 1
      }
    }
  }
  for (const wi of touched) weeks[wi] = recomputeMiles(tagWeek(weeks[wi]))
  return { ...plan, weeks }
}

/**
 * 110-F5 — weekly compliance: completed vs planned miles, and the
 * two-consecutive-week shortfall signal that suggests a Rule-3
 * regeneration.
 */
export function weekCompliance(plannedMiles: number, completedMiles: number): number {
  if (plannedMiles <= 0) return 1
  return Math.max(0, completedMiles / plannedMiles)
}

export function shouldSuggestRegeneration(recentCompliance: number[]): boolean {
  const lastTwo = recentCompliance.slice(-2)
  return lastTwo.length === 2 && lastTwo.every(c => c < 0.7)
}
