import type {
  GarminHealthData, PlannedDay, PlanEditOpInput, ReadinessBaselines,
  ReadinessScore, TrainingWeek, WorkoutType,
} from '../../types'
import { dayIsoInWeek, isoFromLocalDate } from '../../utils/planDates'
import { parseDistance } from '../../utils/targets'
import { repaceString } from '../../utils/repace'
import { isProtectedWeek, scaleTime, withDistance } from './weeklyReview'

/**
 * The Morning Outlook engine (Adaptive Engine phase 3, PR 7) — the
 * daily readiness layer from the approved Daily Autopilot proposal.
 * The plan stays periodized; this modulates TODAY only, from
 * deterministic rules over the athlete's overnight data.
 *
 * Non-negotiables carried from the design:
 *  - Trends over single bad nights: structural changes require a
 *    multi-day down streak, never one rough reading.
 *  - Hard days move, never disappear — a swap is two mirrored day
 *    updates inside the same week; if no safe landing spot exists the
 *    session is trimmed, not deleted.
 *  - Race week is untouchable, logged days are history, and without a
 *    real HRV baseline (~3 weeks) the readiness gates stay closed —
 *    missing data degrades gracefully to the fixed plan.
 *  - Every action is packaged as plan-edit ops for the ONE atomic
 *    apply/undo seam, so a one-tap revert always works.
 *
 * The engine is pure: "has the autopilot already acted today?" (one
 * push per session) is the caller's job, via the adaptation log.
 */

export interface OutlookEvidence {
  label: string
  value: string
}

export type OutlookVerdict = 'confirm' | 'swap' | 'trim' | 'heat-repace'

export interface MorningOutlook {
  dateIso: string
  verdict: OutlookVerdict
  headline: string
  why: string
  /** Today's session as planned / as adjusted (null on 'confirm'). */
  before: string | null
  after: string | null
  /** Day label the hard session moved to, when verdict is 'swap'. */
  movedToDay?: string
  evidence: OutlookEvidence[]
  /** Ready-to-apply ops (one atomic batch). Empty on 'confirm'. */
  ops: PlanEditOpInput[]
}

export interface OutlookInputs {
  /** Today's readiness score from the existing pipeline. */
  score: ReadinessScore | null
  /** Recent daily scores (any order); used for the down-day trend. */
  recentScores: ReadinessScore[]
  baselines: ReadinessBaselines | null
  /** Today's overnight health (merged Garmin/Apple), if present. */
  health: GarminHealthData | null
  /** Forecast °F at the athlete's training hour, when known. */
  heatTempF?: number | null
}

/** Nights of HRV history required before readiness may move a session. */
export const HRV_BASELINE_NIGHTS = 21
/** Consecutive down days (incl. today) required for a structural change. */
export const DOWN_STREAK_MIN = 3
/** Forecast at which pace targets start easing for heat. */
export const HEAT_REPACE_F = 85

const HARD_TYPES: ReadonlySet<WorkoutType> = new Set(['quality', 'long'])

const isDown = (s: ReadinessScore) => s.status === 'YELLOW' || s.status === 'RED'

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return isoFromLocalDate(d)
}

function isoDiffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000)
}

/** Consecutive down days ending today (today itself must be down). */
export function downStreak(recentScores: ReadinessScore[], todayIso: string): number {
  const byDate = new Map(recentScores.map(s => [s.date, s]))
  let streak = 0
  for (let back = 0; back < 14; back++) {
    const s = byDate.get(isoAddDays(todayIso, -back))
    if (!s || !isDown(s)) break
    streak += 1
  }
  return streak
}

const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`

function fmtSleep(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** The evidence strip: only signals that actually exist today. */
export function buildEvidence(inputs: OutlookInputs): OutlookEvidence[] {
  const { baselines, health } = inputs
  const out: OutlookEvidence[] = []
  const weekly = health?.hrv?.weeklyAvg
  if (weekly && baselines && baselines.lnRmssd.sampleSize > 0 && baselines.lnRmssd.stdDev > 0) {
    // Personal band: mean ± 1 SD in ln(RMSSD) space (the SWC band the
    // readiness scorer already uses). Report where the 7-day avg sits.
    const lower = Math.exp(baselines.lnRmssd.mean - baselines.lnRmssd.stdDev)
    const pct = Math.round((1 - weekly / lower) * 100)
    out.push({
      label: '7-day HRV vs your band',
      value: pct > 0 ? `${pct}% below` : 'in band',
    })
  }
  if (health?.sleep?.durationSeconds) {
    out.push({ label: 'Sleep last night', value: fmtSleep(health.sleep.durationSeconds) })
  }
  if (health?.rhr != null && baselines && baselines.rhr.sampleSize > 0) {
    const delta = Math.round(health.rhr - baselines.rhr.mean)
    out.push({
      label: 'Resting HR vs baseline',
      value: delta > 0 ? `+${delta} bpm` : delta < 0 ? `${delta} bpm` : 'at baseline',
    })
  }
  return out
}

interface TodaySlot {
  week: TrainingWeek
  dayIndex: number
  day: PlannedDay
}

function findToday(weeks: TrainingWeek[], todayIso: string): TodaySlot | null {
  for (const week of weeks) {
    for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
      if (dayIsoInWeek(week.days[dayIndex].day, week, todayIso) === todayIso) {
        return { week, dayIndex, day: week.days[dayIndex] }
      }
    }
  }
  return null
}

const summarize = (d: PlannedDay) => `${d.workout} · ${d.time}`

const moveFields = (src: PlannedDay) => ({
  type: src.type, workout: src.workout, detail: src.detail,
  zone: src.zone, route: src.route, time: src.time,
})

/**
 * A safe landing day for today's hard session: an unlogged easy run
 * later this week, within 3 days, whose slot keeps at least 2 full
 * days from every OTHER hard day (today's original slot goes easy, so
 * it doesn't count).
 */
function findSwapTarget(slot: TodaySlot, todayIso: string): TodaySlot | null {
  const { week, dayIndex } = slot
  const otherHardIsos = week.days
    .map((d, i) => ({ d, i, iso: dayIsoInWeek(d.day, week, todayIso) }))
    .filter(x => x.i !== dayIndex && x.iso != null &&
      (HARD_TYPES.has(x.d.type) || x.d.type === 'race'))
    .map(x => x.iso!)
  for (let i = dayIndex + 1; i < week.days.length; i++) {
    const cand = week.days[i]
    if (cand.type !== 'run' || cand.actual || cand.locked) continue
    const iso = dayIsoInWeek(cand.day, week, todayIso)
    if (!iso || isoDiffDays(iso, todayIso) > 3) continue
    if (otherHardIsos.some(h => Math.abs(isoDiffDays(iso, h)) < 2)) continue
    return { week, dayIndex: i, day: cand }
  }
  return null
}

function trimmedUpdates(day: PlannedDay, factor: number) {
  const mi = parseDistance(day.zone)
  return {
    ...(mi ? { zone: withDistance(day.zone, Math.max(1, Math.round(mi * factor * 10) / 10)) } : {}),
    time: scaleTime(day.time, factor),
  }
}

/**
 * The morning decision. Returns null when there is nothing to decide —
 * no plannable session today, the day is already logged, or the week
 * is race-protected. A 'confirm' verdict means: session stands, here
 * is the evidence.
 */
export function buildMorningOutlook(
  weeks: TrainingWeek[],
  todayIso: string,
  inputs: OutlookInputs,
): MorningOutlook | null {
  const slot = findToday(weeks, todayIso)
  if (!slot) return null
  const { week, dayIndex, day } = slot
  // A locked day is fixed — autopilot never moves or trims it.
  if (day.actual || day.type === 'rest' || day.type === 'race' || day.locked) return null
  const totalWeeks = weeks.length > 0 ? Math.max(...weeks.map(w => w.num)) : 0
  if (isProtectedWeek(week, totalWeeks)) return null

  const evidence = buildEvidence(inputs)
  const confirm: MorningOutlook = {
    dateIso: todayIso,
    verdict: 'confirm',
    headline: 'Green light — today stands as planned.',
    why: 'Recovery signals are where they should be.',
    before: null,
    after: null,
    evidence,
    ops: [],
  }

  // ── Readiness gate (HRV-trend-gated, baseline-required) ─────────
  const { score, baselines } = inputs
  const baselineReady = baselines != null && baselines.lnRmssd.sampleSize >= HRV_BASELINE_NIGHTS
  const streak = downStreak(inputs.recentScores, todayIso)
  const hardToday = HARD_TYPES.has(day.type)

  if (baselineReady && score && hardToday && streak >= DOWN_STREAK_MIN) {
    const streakWhy = `Recovery signals down for a ${ordinal(streak)} straight day. One rough night gets ignored — a trend doesn't.`
    if (score.status === 'RED') {
      const target = findSwapTarget(slot, todayIso)
      if (target) {
        return {
          dateIso: todayIso,
          verdict: 'swap',
          headline: 'Back off today — the hard session moves, it doesn\'t disappear.',
          why: `${streakWhy} Today's session moved to ${target.day.day} with 48h kept clear of your other hard days.`,
          before: summarize(day),
          after: summarize(target.day),
          movedToDay: target.day.day,
          evidence,
          ops: [
            {
              op: { kind: 'updateDay', weekNum: week.num, dayIndex, updates: moveFields(target.day) },
              rationale: 'Autopilot: readiness swap — hard session moved, never deleted',
            },
            {
              op: { kind: 'updateDay', weekNum: week.num, dayIndex: target.dayIndex, updates: moveFields(day) },
              rationale: 'Autopilot: readiness swap — hard session moved, never deleted',
            },
          ],
        }
      }
      return {
        dateIso: todayIso,
        verdict: 'trim',
        headline: 'Rough stretch — today shrinks, it doesn\'t disappear.',
        why: `${streakWhy} No safe day to swap with this week, so today runs at 70%.`,
        before: summarize(day),
        after: `${day.workout} · ${scaleTime(day.time, 0.7)}`,
        evidence,
        ops: [{
          op: { kind: 'updateDay', weekNum: week.num, dayIndex, updates: trimmedUpdates(day, 0.7) },
          rationale: 'Autopilot: readiness trim — no safe swap target this week',
        }],
      }
    }
    if (score.status === 'YELLOW') {
      return {
        dateIso: todayIso,
        verdict: 'trim',
        headline: 'Take the edge off today.',
        why: `${streakWhy} The session stays — at 80%, so it builds instead of digging the hole deeper.`,
        before: summarize(day),
        after: `${day.workout} · ${scaleTime(day.time, 0.8)}`,
        evidence,
        ops: [{
          op: { kind: 'updateDay', weekNum: week.num, dayIndex, updates: trimmedUpdates(day, 0.8) },
          rationale: 'Autopilot: readiness trim — yellow trend, session kept at 80%',
        }],
      }
    }
  }

  // ── Heat re-pace (no HRV baseline needed — it's about the weather) ──
  const heat = inputs.heatTempF
  if (heat != null && heat >= HEAT_REPACE_F) {
    const factor = heat >= 95 ? 1.04 : heat >= 90 ? 1.03 : 1.02
    const zone = repaceString(day.zone, factor)
    const detail = repaceString(day.detail, factor)
    if (zone !== day.zone || detail !== day.detail) {
      const addSec = Math.round((factor - 1) * 100)
      return {
        dateIso: todayIso,
        verdict: 'heat-repace',
        headline: `Paces eased for heat — same effort, honest pace.`,
        why: `Forecast ${Math.round(heat)}°F at your training hour. Targets ease ~${addSec}% today only; they restore themselves tomorrow.`,
        before: summarize(day),
        after: `${day.workout} · paces +${addSec}%`,
        evidence,
        ops: [{
          op: {
            kind: 'updateDay', weekNum: week.num, dayIndex,
            updates: {
              ...(zone !== day.zone ? { zone } : {}),
              ...(detail !== day.detail ? { detail } : {}),
            },
          },
          rationale: `Autopilot: pace targets eased for ${Math.round(heat)}°F forecast`,
        }],
      }
    }
  }

  return confirm
}
