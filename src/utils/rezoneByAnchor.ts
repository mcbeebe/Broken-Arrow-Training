import type { HRZone, PlanEditOpInput, TrainingWeek } from '../types'
import { dayIsoInWeek } from './planDates'
import { rezoneZoneString, rezoneDetailString, toNumericZones, type NumericZone } from './rezone'

/**
 * Benchmark write-back — the `repace.ts` sibling for HR anchors (S.1
 * slice). The plan bakes HR numbers into strings in TWO dialects:
 *
 *  - Hyrox / legacy: "5 mi · Z2 (128–148)" — %maxHR ladder, parenthesized
 *    bpm. rezone.ts already rewrites these from a zone table.
 *  - Method engine: "AeT (Aerobic Threshold) · 8:35-9:15 /mi · 130-148 bpm"
 *    — %LTHR bands, bare "lo-hi bpm" tokens rezone.ts can't see (the
 *    reason a Settings maxHR change silently skipped method plans).
 *
 * This module rewrites BOTH from one anchor change: Z-label bands via the
 * new zone table (Dialect A), bare bpm tokens scaled by newLthr/oldLthr
 * (Dialect B — every method bpm band is linear in LTHR by construction,
 * see paceTargets.hrRangeToBpm), and AeT/AnT/LTHR threshold references
 * in details. Packaged as plan-edit ops so it flows through the one
 * atomic write seam: future days only, opt-in, undoable.
 */

const BPM_BAND_TOKEN = /(\d{2,3})\s*([-–])\s*(\d{2,3})(\s*bpm\b)/g

/** Scale bare "lo-hi bpm" bands (Dialect B) by an LTHR ratio. */
export function scaleBpmBands(text: string, ratio: number): string {
  if (!text || ratio === 1) return text
  return text.replace(BPM_BAND_TOKEN, (_m, lo: string, dash: string, hi: string, suffix: string) => {
    return `${Math.round(parseInt(lo, 10) * ratio)}${dash}${Math.round(parseInt(hi, 10) * ratio)}${suffix}`
  })
}

export interface ZoneAnchorChange {
  /** Old/new LTHR (bpm). Equal values = no Dialect-B rewrite. */
  oldLthr: number
  newLthr: number
  /** The athlete's post-change zone table, used for Dialect-A Z-bands.
   *  Pass the CURRENT table when only LTHR changed. */
  newZones: HRZone[]
}

/** Scale bare AeT/AnT/LTHR threshold refs ("AeT (148)") by an LTHR
 *  ratio. Only used when no zone table is supplied — with a table,
 *  rezoneDetailString already re-anchors these to the (scaled) table
 *  and a second scaling would double-apply. */
export function scaleThresholdRefs(text: string, ratio: number): string {
  if (!text || ratio === 1) return text
  return text.replace(/\b(AeT|AnT|LTHR)(\s+HR)?(\s*)\((\d+)\)/g, (_m, label: string, hr: string | undefined, gap: string, bpm: string) => {
    return `${label}${hr ?? ''}${gap}(${Math.round(parseInt(bpm, 10) * ratio)})`
  })
}

function rewriteDay(zone: string, detail: string, nz: NumericZone[], lthrRatio: number): { zone: string; detail: string } {
  let z = rezoneZoneString(zone, nz)
  let d = rezoneDetailString(detail, nz)
  if (lthrRatio !== 1) {
    z = scaleBpmBands(z, lthrRatio)
    d = scaleBpmBands(d, lthrRatio)
    if (nz.length === 0) {
      z = scaleThresholdRefs(z, lthrRatio)
      d = scaleThresholdRefs(d, lthrRatio)
    }
  }
  return { zone: z, detail: d }
}

/**
 * Build the proposal ops: one updateDay per FUTURE day whose zone/detail
 * strings actually change under the new anchors. Past days and days with
 * a logged actual emit nothing (history-preserving guard, same as
 * buildRepaceOps).
 */
export function buildZoneAnchorOps(
  weeks: TrainingWeek[],
  change: ZoneAnchorChange,
  fromIso: string,
  rationale: string,
): PlanEditOpInput[] {
  const ops: PlanEditOpInput[] = []
  const nz = toNumericZones(change.newZones)
  const lthrRatio = change.oldLthr > 0 && change.newLthr > 0 ? change.newLthr / change.oldLthr : 1
  if (nz.length === 0 && lthrRatio === 1) return ops

  for (const week of weeks) {
    week.days.forEach((day, dayIndex) => {
      const isoDate = dayIsoInWeek(day.day, week, fromIso)
      if (!isoDate || isoDate < fromIso) return
      if (day.actual) return
      const next = rewriteDay(day.zone ?? '', day.detail ?? '', nz, lthrRatio)
      if (next.zone === (day.zone ?? '') && next.detail === (day.detail ?? '')) return
      ops.push({
        op: {
          kind: 'updateDay',
          weekNum: week.num,
          dayIndex,
          updates: {
            ...(next.zone !== (day.zone ?? '') ? { zone: next.zone } : {}),
            ...(next.detail !== (day.detail ?? '') ? { detail: next.detail } : {}),
          },
        },
        rationale,
      })
    })
  }
  return ops
}
