// ─── Training Signals aggregator ────────────────────────────────
//
// Three engines on the Summary screen each render a verdict:
//
//   Load   — Performance Snapshot (CTL/ATL/TSB/ACWR, 42d/7d EWMA)
//   Body   — Readiness (HRV, RHR, sleep — today's autonomic state)
//   Damage — Risk flags (escalating soreness, eccentric overload)
//
// They legitimately disagree (different inputs, different time windows),
// but the cards render side-by-side without acknowledging the
// disagreement. This module compresses all three into a single object
// every card reads from, so the verdicts come from one place and we can
// tell the user when the lenses contradict.
//
// Pure derivation: no side effects, no data fetching. Inputs are the
// same props the Summary component already has.
//
// Naming note: the codebase already exports a `TrainingState` union for
// ATE buckets ('A' | 'B' | 'C' | 'D'). We call this `TrainingSignals`
// to avoid the collision.

import type { PerformanceMetrics, ReadinessScore } from '../types'
import { checkEscalatingSoreness } from './readiness'

// ─── Axis state unions ─────────────────────────────────────────

export type LoadState =
  | 'detrained'   // ACWR < 0.7 — chronic load decaying faster than safe
  | 'productive'  // TSB +5 to +25 — fresh, ramp up if you want
  | 'balanced'    // TSB -10 to +5, ACWR 0.8-1.3 — absorbing this week's load
  | 'overreach'   // TSB -25 to -10 OR ACWR 1.3-1.5 — push back on volume
  | 'danger'      // TSB < -25 OR ACWR > 1.5 — deload required

export type BodyState =
  | 'peak'        // best 10% of personal baseline
  | 'green'       // normal recovery
  | 'yellow'      // sub-baseline — back off intensity
  | 'red'         // multi-signal collapse — rest
  | 'unknown'     // no readiness score yet (sync incomplete)

export type DamageState =
  | 'fresh'       // no soreness or improving
  | 'mild'        // one elevated day, recoverable
  | 'elevated'    // multiple elevated days
  | 'escalating'  // trending up + alert threshold — pull next quad session

export type Axis = 'load' | 'body' | 'damage'
export type Coherence = 'aligned' | 'mixed'
export type TodayCall = 'rest' | 'easy' | 'monitor' | 'train'

export interface AxisReading<S extends string> {
  state: S
  label: string
  /** Severity 0-3. 0 = fine, 3 = stop. Drives `dominant` + `todayCall`. */
  severity: number
}

export interface TrainingSignals {
  load: AxisReading<LoadState>
  body: AxisReading<BodyState>
  damage: AxisReading<DamageState>
  coherence: Coherence
  /** Axis whose restrictive verdict the user should act on today. */
  dominant: Axis
  /** One-word recommendation. */
  todayCall: TodayCall
  /** One-line plain-English reading. Always populated, longer when mixed. */
  reason: string
}

// ─── Axis classifiers ───────────────────────────────────────────

const LOAD_SEVERITY: Record<LoadState, number> = {
  detrained: 1,
  productive: 0,
  balanced: 0,
  overreach: 2,
  danger: 3,
}

const LOAD_LABEL: Record<LoadState, string> = {
  detrained: 'Detrained',
  productive: 'Productive',
  balanced: 'Balanced',
  overreach: 'Overreaching',
  danger: 'Danger',
}

export function classifyLoad(perf: PerformanceMetrics | null): AxisReading<LoadState> {
  if (!perf) {
    return { state: 'balanced', label: 'No data', severity: 0 }
  }
  const { tsb, acwr } = perf
  let state: LoadState
  if (tsb < -25 || acwr > 1.5) state = 'danger'
  else if (tsb < -10 || acwr > 1.3) state = 'overreach'
  else if (acwr < 0.7) state = 'detrained'
  else if (tsb > 5) state = 'productive'
  else state = 'balanced'
  return { state, label: LOAD_LABEL[state], severity: LOAD_SEVERITY[state] }
}

const BODY_SEVERITY: Record<BodyState, number> = {
  peak: 0,
  green: 0,
  yellow: 2,
  red: 3,
  unknown: 0,
}

const BODY_LABEL: Record<BodyState, string> = {
  peak: 'Peak',
  green: 'Recovered',
  yellow: 'Sub-baseline',
  red: 'Wrecked',
  unknown: 'No data',
}

export function classifyBody(score: ReadinessScore | null): AxisReading<BodyState> {
  if (!score) return { state: 'unknown', label: BODY_LABEL.unknown, severity: 0 }
  const state: BodyState =
    score.status === 'PEAK' ? 'peak'
    : score.status === 'GREEN' ? 'green'
    : score.status === 'YELLOW' ? 'yellow'
    : 'red'
  return { state, label: BODY_LABEL[state], severity: BODY_SEVERITY[state] }
}

const DAMAGE_SEVERITY: Record<DamageState, number> = {
  fresh: 0,
  mild: 1,
  elevated: 2,
  escalating: 3,
}

const DAMAGE_LABEL: Record<DamageState, string> = {
  fresh: 'Fresh',
  mild: 'Mild',
  elevated: 'Elevated',
  escalating: 'Escalating',
}

export function classifyDamage(
  sorenessLoadByDate: Map<string, number> | undefined,
): AxisReading<DamageState> {
  if (!sorenessLoadByDate || sorenessLoadByDate.size === 0) {
    return { state: 'fresh', label: DAMAGE_LABEL.fresh, severity: 0 }
  }
  const sore = checkEscalatingSoreness(sorenessLoadByDate)
  let state: DamageState
  if (sore.escalating && sore.trending && sore.last >= 35) state = 'escalating'
  else if (sore.escalating) state = 'elevated'
  else if (sore.last > 0) state = 'mild'
  else state = 'fresh'
  return { state, label: DAMAGE_LABEL[state], severity: DAMAGE_SEVERITY[state] }
}

// ─── Aggregator ─────────────────────────────────────────────────

function pickDominant(
  load: AxisReading<LoadState>,
  body: AxisReading<BodyState>,
  damage: AxisReading<DamageState>,
): Axis {
  // Highest severity wins. Ties broken by body > damage > load: today's
  // nervous system is the most acute signal, soreness is multi-day, and
  // load math is a weeks-long lagging window.
  const ranked: Array<{ axis: Axis; severity: number; tieBreak: number }> = [
    { axis: 'body', severity: body.severity, tieBreak: 3 },
    { axis: 'damage', severity: damage.severity, tieBreak: 2 },
    { axis: 'load', severity: load.severity, tieBreak: 1 },
  ]
  ranked.sort((a, b) => b.severity - a.severity || b.tieBreak - a.tieBreak)
  return ranked[0].axis
}

function callForSeverity(maxSeverity: number): TodayCall {
  if (maxSeverity >= 3) return 'rest'
  if (maxSeverity === 2) return 'easy'
  if (maxSeverity === 1) return 'monitor'
  return 'train'
}

function buildReason(
  load: AxisReading<LoadState>,
  body: AxisReading<BodyState>,
  damage: AxisReading<DamageState>,
  coherence: Coherence,
  dominant: Axis,
): string {
  if (coherence === 'aligned') {
    const aligned = load.severity + body.severity + damage.severity
    if (aligned === 0) return 'All signals aligned — train as planned.'
    return 'All signals point the same direction.'
  }
  // Mixed: name the restrictive vs. permissive axes in customer language.
  const phrases: Record<Axis, { restrictive: string; permissive: string }> = {
    load: { restrictive: 'load is overreaching', permissive: 'load says balanced' },
    body: { restrictive: 'body needs rest', permissive: 'body is recovered' },
    damage: { restrictive: 'soreness is climbing', permissive: 'soreness is fine' },
  }
  const restrictive: Axis[] = []
  const permissive: Axis[] = []
  for (const [axis, reading] of [
    ['load', load], ['body', body], ['damage', damage],
  ] as Array<[Axis, AxisReading<string>]>) {
    if (reading.severity >= 1) restrictive.push(axis)
    else permissive.push(axis)
  }
  // Lead with the dominant axis's restrictive phrase, then the permissive
  // axes so the user sees both sides in one line.
  const leadAxis = restrictive.includes(dominant) ? dominant : restrictive[0]
  const others = permissive.map(a => phrases[a].permissive).join(', ')
  return `${capitalize(phrases[leadAxis].restrictive)} — ${others}.`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface BuildTrainingSignalsInput {
  performance: PerformanceMetrics | null
  readiness: ReadinessScore | null
  sorenessLoadByDate?: Map<string, number>
}

export function buildTrainingSignals(input: BuildTrainingSignalsInput): TrainingSignals {
  const load = classifyLoad(input.performance)
  const body = classifyBody(input.readiness)
  const damage = classifyDamage(input.sorenessLoadByDate)
  const allAxes: AxisReading<string>[] = [load, body, damage]
  const restrictiveCount = allAxes.filter(a => a.severity >= 1).length
  const permissiveCount = allAxes.filter(a => a.severity === 0).length
  // Coherence: 'mixed' only when at least one axis says back off AND at
  // least one says fine. All-restrictive or all-permissive = aligned.
  // Exception: 'unknown' body doesn't count toward either side — treat
  // an unknown body as not contributing to the coherence call.
  const bodyIsUnknown = body.state === 'unknown'
  const effectiveRestrictive = restrictiveCount
  const effectivePermissive = bodyIsUnknown ? permissiveCount - 1 : permissiveCount
  const coherence: Coherence =
    effectiveRestrictive > 0 && effectivePermissive > 0 ? 'mixed' : 'aligned'
  const dominant = pickDominant(load, body, damage)
  const maxSeverity = Math.max(load.severity, body.severity, damage.severity)
  const todayCall = callForSeverity(maxSeverity)
  const reason = buildReason(load, body, damage, coherence, dominant)
  return { load, body, damage, coherence, dominant, todayCall, reason }
}

// ─── Display helpers ────────────────────────────────────────────

export const TODAY_CALL_LABEL: Record<TodayCall, string> = {
  rest: 'Rest',
  easy: 'Easy day',
  monitor: 'Train, monitor',
  train: 'Train as planned',
}

export const AXIS_LABEL: Record<Axis, string> = {
  load: 'load',
  body: 'body',
  damage: 'soreness',
}
