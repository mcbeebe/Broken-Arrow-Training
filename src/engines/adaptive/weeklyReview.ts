import type { PlannedDay, PlanEditOpInput, TrainingWeek, WorkoutType } from '../../types'
import { buildRepaceOps } from '../../utils/repace'
import { parseDistance } from '../../utils/targets'
import {
  scoreWeekExecution, detectTrainingGap, longestRunCapMi,
  type WeeklyExecution, type TrainingGap,
} from './execution'
import type { HRStream } from '../../utils/timeInZone'

/**
 * The Monday Review engine (Adaptive Engine phase 1, PR 2) — turns the
 * measurement spine's evidence into concrete, one-tap adjustment diffs
 * for the coming week.
 *
 * Contract rules carried from the approved proposal:
 *   - PROPOSE, never apply: every adjustment is a label + before/after +
 *     why + ready-made plan-edit ops. The UI applies them through the
 *     existing atomic batch seam (planEdits), so everything is undoable
 *     as a unit and manual edits are never touched.
 *   - Two-directional: paces ease when the athlete is consistently slow
 *     (the mirror the G5 recalibration never had) with the same
 *     conservatism — half the observed miss, capped at 3% per review.
 *   - Guardrailed: distance proposals respect the Nielsen 110% single-
 *     session cap; nothing rewrites logged days; race/taper weeks are
 *     left alone.
 *
 * Deliberate deviation from the sketch: gap-tier volume rescale is
 * built as updateDay ops over the coming weeks rather than resurrecting
 * regenerateRemainder — a regenerated TrainingPlan object has nowhere
 * to live in the derive-from-config architecture (it would be discarded
 * on the next render), while edit ops persist in the op-log, survive
 * sync, and undo cleanly. The 'restart' tier still routes to the full
 * rebuild flow, which IS the config-level regeneration.
 */

export interface WeeklyAdjustment {
  /** Stable identity for analytics + idempotent re-offering. */
  id: string
  label: string
  before: string
  after: string
  why: string
  /** Ready-to-apply plan-edit ops (one atomic batch per adjustment). */
  ops: PlanEditOpInput[]
  /** 'structure' moves/rescales days; 'targets' rewrites pace strings. */
  kind: 'structure' | 'targets'
}

export interface WeeklyReview {
  reviewedWeekNum: number
  nextWeekNum: number | null
  execution: WeeklyExecution
  gap: TrainingGap
  adjustments: WeeklyAdjustment[]
  /** One-line verdict for the sheet header. */
  headline: string
}

const HARD_TYPES: ReadonlySet<WorkoutType> = new Set(['quality', 'long'])

const fmtMi = (n: number) => (Math.round(n * 10) / 10).toString()

/** Rewrite the leading "X mi" token in a zone string. */
export function withDistance(zone: string, mi: number): string {
  return zone.replace(/(\d+(?:\.\d+)?)\s*mi\b/i, `${fmtMi(mi)} mi`)
}

/** Scale a "N min"/"N hr M min" time string by factor (coarse, 5-min steps). */
export function scaleTime(time: string, factor: number): string {
  const hr = time.match(/(\d+)\s*hr/i)
  const min = time.match(/(\d+)\s*min/i)
  let total = (hr ? parseInt(hr[1]) * 60 : 0) + (min ? parseInt(min[1]) : 0)
  if (total === 0) return time
  total = Math.max(20, Math.round((total * factor) / 5) * 5)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? (m > 0 ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`
}

/** The plan's race/taper endgame is never restructured by a review. */
export function isProtectedWeek(week: TrainingWeek, totalWeeks: number): boolean {
  return week.num > totalWeeks - 2 || week.days.some(d => d.type === 'race')
}

function longRunHoldAdjustment(
  reviewed: WeeklyExecution,
  reviewedWeek: TrainingWeek,
  nextWeek: TrainingWeek,
  weeks: TrainingWeek[],
  todayIso: string,
): WeeklyAdjustment | null {
  if (reviewed.verdict === 'advance') return null
  const nextLongIdx = nextWeek.days.findIndex(d => d.type === 'long' && !d.actual)
  if (nextLongIdx < 0) return null
  const nextLong = nextWeek.days[nextLongIdx]
  const plannedMi = parseDistance(nextLong.zone)
  if (!plannedMi) return null

  // Repeat last week's long prescription (or what was actually run, if
  // less), never above the trailing-30-day spike cap.
  const lastLong = reviewedWeek.days.find(d => d.type === 'long')
  const lastPlannedMi = lastLong ? parseDistance(lastLong.zone) : undefined
  const lastActualMi = lastLong?.actual?.distance
  const cap = longestRunCapMi(weeks, todayIso)
  let target = Math.min(
    lastActualMi && lastActualMi > 0 ? lastActualMi : (lastPlannedMi ?? plannedMi),
    lastPlannedMi ?? plannedMi,
  )
  if (cap != null) target = Math.min(target, cap)
  target = Math.round(target * 10) / 10
  if (target >= plannedMi) return null

  const driftWhy = reviewed.longRunDriftPct != null && reviewed.longRunDriftPct > 8
    ? `HR drifted ${reviewed.longRunDriftPct.toFixed(1)}% across last week's long run — above the 8% line that says the distance isn't absorbed yet.`
    : `Last week came back '${reviewed.verdict}' (${reviewed.reasons[0] ?? 'see review'}).`

  return {
    id: 'hold-long-run',
    kind: 'structure',
    label: "Hold the long run — don't advance yet",
    before: `${nextLong.day} · ${fmtMi(plannedMi)} mi`,
    after: `${nextLong.day} · ${fmtMi(target)} mi (repeat)`,
    why: `${driftWhy} One more week here, then we advance.`,
    ops: [{
      op: {
        kind: 'updateDay', weekNum: nextWeek.num, dayIndex: nextLongIdx,
        updates: {
          zone: withDistance(nextLong.zone, target),
          time: scaleTime(nextLong.time, target / plannedMi),
        },
      },
      rationale: 'Monday review: hold long-run progression one week',
    }],
  }
}

function easePacesAdjustment(
  reviewed: WeeklyExecution,
  weeks: TrainingWeek[],
  todayIso: string,
): WeeklyAdjustment | null {
  const slow = reviewed.medianPaceDeltaFrac
  if (slow == null || slow <= 0.04) return null
  // Half the observed miss, capped at +3% — the same conservatism G5
  // applies in the fast direction.
  const factor = Math.min(1.03, 1 + slow / 2)
  const ops = buildRepaceOps(weeks, factor, todayIso, 'Monday review: ease pace targets to match measured fitness')
  if (ops.length === 0) return null
  return {
    id: 'ease-paces',
    kind: 'targets',
    label: 'Ease the pace targets',
    before: 'current pace targets',
    after: `all future paces +${Math.round((factor - 1) * 100)}%`,
    why: `Your runs came in a median ${Math.round(slow * 100)}% slower than target last week. A target you can't touch teaches nothing — this eases by half the observed gap (capped at 3%), and the next benchmark re-tests it.`,
    ops,
  }
}

function spacingAdjustment(nextWeek: TrainingWeek): WeeklyAdjustment | null {
  const days = nextWeek.days
  // Find the first adjacent hard-day pair with an easier day ≥2 slots away.
  for (let i = 0; i + 1 < days.length; i++) {
    if (!HARD_TYPES.has(days[i].type) || !HARD_TYPES.has(days[i + 1].type)) continue
    if (days[i].actual || days[i + 1].actual) continue
    const j = days.findIndex((d, idx) =>
      idx > i + 1 && Math.abs(idx - (i + 1)) >= 2 && !d.actual &&
      (d.type === 'run' || d.type === 'cross' || d.type === 'strength'),
    )
    if (j < 0) return null
    const a = days[i + 1]
    const b = days[j]
    const move = (src: PlannedDay) => ({
      type: src.type, workout: src.workout, detail: src.detail,
      zone: src.zone, route: src.route, time: src.time,
    })
    return {
      id: 'space-hard-days',
      kind: 'structure',
      label: 'Un-stack the hard days',
      before: `${days[i].day} + ${a.day} back-to-back`,
      after: `${a.workout.slice(0, 24)} moves to ${b.day}`,
      why: 'Two hard sessions back-to-back means the second one is trained on the first one\'s fatigue. 48 hours between them lets both count.',
      ops: [
        { op: { kind: 'updateDay', weekNum: nextWeek.num, dayIndex: i + 1, updates: move(b) }, rationale: 'Monday review: swap to restore 48h hard-day spacing' },
        { op: { kind: 'updateDay', weekNum: nextWeek.num, dayIndex: j, updates: move(a) }, rationale: 'Monday review: swap to restore 48h hard-day spacing' },
      ],
    }
  }
  return null
}

function gapRescaleAdjustment(
  gap: TrainingGap,
  weeks: TrainingWeek[],
  nextWeek: TrainingWeek,
  totalWeeks: number,
): WeeklyAdjustment | null {
  if (gap.tier !== 'ease75' && gap.tier !== 'rebuild50') return null
  const factor = gap.volumeFactor
  const targetWeeks = weeks
    .filter(w => w.num >= nextWeek.num && w.num < nextWeek.num + 2 && !isProtectedWeek(w, totalWeeks))
  const ops: PlanEditOpInput[] = []
  for (const w of targetWeeks) {
    w.days.forEach((day, dayIndex) => {
      if (day.actual || day.type === 'rest' || day.type === 'race') return
      const mi = parseDistance(day.zone)
      if (!mi) return
      const scaled = Math.max(1, Math.round(mi * factor * 10) / 10)
      if (scaled >= mi) return
      ops.push({
        op: {
          kind: 'updateDay', weekNum: w.num, dayIndex,
          updates: { zone: withDistance(day.zone, scaled), time: scaleTime(day.time, factor) },
        },
        rationale: `Gap resumption: ${gap.days} days off → ${Math.round(factor * 100)}% volume re-entry`,
      })
    })
  }
  if (ops.length === 0) return null
  return {
    id: `gap-${gap.tier}`,
    kind: 'structure',
    label: gap.tier === 'ease75' ? 'Ease back in at 75% volume' : 'Restart at 50% volume',
    before: 'next 2 weeks as originally planned',
    after: `run volume × ${Math.round(factor * 100)}% for 2 weeks`,
    why: gap.guidance,
    ops,
  }
}

/**
 * Build the Monday Review for the week that just finished. `weeks` is
 * the full derived plan; `reviewedWeekNum` the completed week.
 */
export function buildWeeklyReview(
  weeks: TrainingWeek[],
  reviewedWeekNum: number,
  todayIso: string,
  opts: { hrStream?: (day: PlannedDay) => HRStream | null } = {},
): WeeklyReview | null {
  const reviewedWeek = weeks.find(w => w.num === reviewedWeekNum)
  if (!reviewedWeek) return null
  const nextWeek = weeks.find(w => w.num === reviewedWeekNum + 1) ?? null
  const totalWeeks = weeks.length > 0 ? Math.max(...weeks.map(w => w.num)) : 0

  const execution = scoreWeekExecution(reviewedWeek, todayIso, opts)
  const gap = detectTrainingGap(weeks, todayIso)

  const adjustments: WeeklyAdjustment[] = []
  if (nextWeek && !isProtectedWeek(nextWeek, totalWeeks)) {
    // A real gap outranks week-by-week tuning — resumption first.
    const rescale = gapRescaleAdjustment(gap, weeks, nextWeek, totalWeeks)
    if (rescale) {
      adjustments.push(rescale)
    } else {
      const hold = longRunHoldAdjustment(execution, reviewedWeek, nextWeek, weeks, todayIso)
      if (hold) adjustments.push(hold)
      const ease = easePacesAdjustment(execution, weeks, todayIso)
      if (ease) adjustments.push(ease)
      const spacing = spacingAdjustment(nextWeek)
      if (spacing) adjustments.push(spacing)
    }
  }

  const headline =
    gap.tier === 'restart' ? 'Long time away — the plan should be rebuilt from where you are.'
    : gap.tier === 'ease75' || gap.tier === 'rebuild50' ? `Back after ${gap.days} days — here's the way back in.`
    : execution.verdict === 'advance' ? 'Week delivered — next week advances as planned.'
    : execution.verdict === 'hold' ? 'Solid week with one flag — one tweak before advancing.'
    : 'Rough week — next week adapts to meet you where you are.'

  return {
    reviewedWeekNum,
    nextWeekNum: nextWeek?.num ?? null,
    execution,
    gap,
    adjustments,
    headline,
  }
}
