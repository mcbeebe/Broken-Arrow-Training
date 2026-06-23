/**
 * R1 — climbing + descending prescription. Wires the (previously dormant) terrain
 * vert + descent engines into the plan an athlete actually trains by:
 *   (a) a weekly vertical-gain target on the long run, scaled by the race's climb
 *       density × long-run miles × a phase ramp (builds to peak, eases in taper);
 *   (b) a downhill / quad-seasoning session through the build/peak, recurring every
 *       ~2 weeks — the eccentric repeated-bout protective window is ~14 days
 *       (Hyldahl 2017, PMID 27782911) — with the load drawn from `eccentricScore`.
 *
 * Flat races (≤ the tracking threshold) are returned untouched — the guard that
 * keeps this conditional, not always-on.
 */
import type { PlannedDay } from '../../types'
import { VERT_TRACKING_FT_PER_MI } from '../../utils/raceReadiness'
import { eccentricScore } from '../descent/eccentric'

/** Mid of iRunFar's 6–10% downhill-repeat slope. */
export const DOWNHILL_GRADE = -0.08

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)) }
function appendDetail(detail: string, add: string): string { return detail ? `${detail} · ${add}` : add }

export interface VertWeekCtx {
  /** Race climb density in feet of gain per mile (0 for flat / unknown). */
  vertFtPerMile: number
  /** True when the race is climby enough to prescribe climbing/descending work. */
  isClimby: boolean
  longRunMi: number
  isTaper: boolean
  /** 0-based week index. */
  weekIndex: number
  /** Index of the peak (last build) week. */
  peakWeekIndex: number
}

/**
 * Weekly long-run vertical-gain target (ft), scaled by climb density × long-run
 * miles × a phase ramp (0.5 → 1.0 toward peak; 0.5 in the taper). Rounded to 50 ft.
 */
export function longRunVertTargetFt(ctx: VertWeekCtx): number {
  if (!ctx.isClimby || ctx.longRunMi <= 0 || ctx.vertFtPerMile <= 0) return 0
  const ramp = ctx.isTaper ? 0.5 : clamp((ctx.weekIndex + 1) / (ctx.peakWeekIndex + 1), 0.5, 1)
  return Math.round((ctx.vertFtPerMile * ctx.longRunMi * ramp) / 50) * 50
}

/**
 * True on the weeks that carry a downhill / quad-seasoning session — every 2nd
 * week through the build/peak window (≤14-day re-stimulus), anchored so the peak
 * week always has one; never in the taper or the early base.
 */
export function isDownhillWeek(ctx: VertWeekCtx): boolean {
  if (!ctx.isClimby || ctx.isTaper) return false
  const startIdx = Math.max(2, Math.ceil(ctx.peakWeekIndex * 0.4))
  if (ctx.weekIndex < startIdx || ctx.weekIndex > ctx.peakWeekIndex) return false
  return (ctx.peakWeekIndex - ctx.weekIndex) % 2 === 0
}

/**
 * Downhill-repeat session note. The eccentric load is read from the descent
 * engine (`eccentricScore`) so the prescription provably uses the model, not a
 * hardcoded number. Reps ramp 6 → 14 toward peak (iRunFar progression).
 */
export function downhillSessionNote(ctx: VertWeekCtx): string {
  const reps = Math.round(6 + 8 * clamp(ctx.weekIndex / Math.max(1, ctx.peakWeekIndex), 0, 1))
  const load = eccentricScore(DOWNHILL_GRADE).toFixed(1)
  return `Downhill repeats ${reps}×90s on −8% — eccentric load ${load}/5, walk back up`
}

/**
 * Apply the climbing + descending prescription to one week's days. Returns a new
 * array; flat races are returned unchanged.
 */
export function applyVertPrescription(days: PlannedDay[], ctx: VertWeekCtx): PlannedDay[] {
  if (!ctx.isClimby) return days
  const vert = longRunVertTargetFt(ctx)
  let out = vert > 0
    ? days.map(d => (d.type === 'long' ? { ...d, detail: appendDetail(d.detail, `~${vert} ft gain`) } : d))
    : days
  if (isDownhillWeek(ctx)) {
    const note = downhillSessionNote(ctx)
    // Prefer a quality day (legs already working); else the long run.
    let idx = out.findIndex(d => d.type === 'quality')
    if (idx < 0) idx = out.findIndex(d => d.type === 'long')
    if (idx >= 0) out = out.map((d, i) => (i === idx ? { ...d, detail: appendDetail(d.detail, note) } : d))
  }
  return out
}

/** True when a race's climb density warrants a climbing/descending prescription. */
export function isClimbyDensity(vertFtPerMile: number): boolean {
  return vertFtPerMile > VERT_TRACKING_FT_PER_MI
}
