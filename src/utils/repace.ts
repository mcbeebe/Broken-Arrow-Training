import type { PlanEditOpInput, TrainingWeek } from '../types'
import { dayIsoInWeek } from './planDates'

/**
 * G5 write-back — the `rezone.ts` sibling for paces (locked decision D4).
 * Rewrites baked "M:SS/mi" and "M:SS-M:SS /mi" tokens in future days'
 * zone/detail strings by a recalibration factor, and packages the change
 * as plan-edit ops so it flows through the ONE atomic write seam
 * (chatProposal validation + ProposalCard apply/undo) and the Garmin
 * auto re-push. Structure is never touched: pace tokens only, future
 * days only, applied only when the athlete taps Apply.
 */

const PACE_TOKEN = /(\d{1,2}):(\d{2})(?=(?:\s*[-–]\s*\d{1,2}:\d{2})?\s*\/\s*mi\b)/g

function scaleToken(min: string, sec: string, factor: number): string {
  const total = Math.round((parseInt(min) * 60 + parseInt(sec)) * factor)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Rewrite every pace token in one string. Non-pace text untouched. */
export function repaceString(text: string, factor: number): string {
  if (!text || factor === 1) return text
  // A range like "8:45-9:10 /mi": the lookahead matches the first token
  // (range following) and the second token (bare " /mi" following).
  return text.replace(PACE_TOKEN, (_, m: string, s: string) => scaleToken(m, s, factor))
}

/**
 * Build the proposal ops: one updateDay per FUTURE day whose zone/detail
 * actually contains a pace token. Past days and pace-free days emit
 * nothing (the targets-only, history-preserving guard).
 */
export function buildRepaceOps(
  weeks: TrainingWeek[],
  factor: number,
  fromIso: string,
  rationale: string,
): PlanEditOpInput[] {
  const ops: PlanEditOpInput[] = []
  if (factor === 1) return ops
  for (const week of weeks) {
    week.days.forEach((day, dayIndex) => {
      const isoDate = dayIsoInWeek(day.day, week, fromIso)
      if (!isoDate || isoDate < fromIso) return
      if (day.actual || day.locked) return  // a pinned day keeps its authored paces
      const zone = repaceString(day.zone, factor)
      const detail = repaceString(day.detail, factor)
      if (zone === day.zone && detail === day.detail) return
      ops.push({
        op: {
          kind: 'updateDay',
          weekNum: week.num,
          dayIndex,
          updates: {
            ...(zone !== day.zone ? { zone } : {}),
            ...(detail !== day.detail ? { detail } : {}),
          },
        },
        rationale,
      })
    })
  }
  return ops
}
