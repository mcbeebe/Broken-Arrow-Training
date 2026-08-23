import type { PlannedDay, StrengthExerciseLog } from '../types'
import { stationSpecs, type HyroxDivision, type HyroxSex, type StationSpec } from '../engines/hyrox/spec'

/**
 * Race-simulation sessions (Phase 3b) — the plan's FULL / HALF simulation
 * days played through the live circuit engine as one round of alternating
 * run + station segments, each timed as its own split.
 *
 * The generator emits these days from the same stationSpecs module, so
 * the segments drafted here always agree with the prescription text:
 * race order, race loads for the athlete's division and sex.
 */

export interface SimProfile {
  division?: HyroxDivision
  sex?: HyroxSex
}

/** The plan's simulation days: '★ FULL RACE SIMULATION' and
 *  'HALF SIMULATION: 4 runs + 4 stations', both emitted as type 'long'. */
export function isSimDay(day: PlannedDay): boolean {
  return day.type === 'long' && /simulation/i.test(day.workout)
}

/** Runs (= stations) in the simulation: 4 for the half, 8 for the full. */
export function simRoundCount(day: PlannedDay): number {
  return /half/i.test(day.workout) ? 4 : 8
}

export function simTitle(day: PlannedDay): string {
  return simRoundCount(day) === 4 ? 'Half simulation' : 'Race simulation'
}

function stationSegmentName(spec: StationSpec): string {
  const qty = spec.unit === 'reps' ? `${spec.amount} reps` : `${spec.amount} m`
  return `${spec.name} — ${qty}${spec.load ? ` @ ${spec.load}` : ''}`
}

/**
 * Draft the session as live-engine exercises: Run 1, station 1, Run 2,
 * station 2, … — each segment ONE set, so round-major traversal walks
 * them strictly in race order with a split recorded per segment. reps 0
 * and weight '' keep the rep/weight chrome out of the circuit face; the
 * segment name carries the full prescription.
 */
export function draftSimSegments(day: PlannedDay, profile?: SimProfile): StrengthExerciseLog[] {
  const specs = stationSpecs(profile?.division ?? 'open', profile?.sex ?? 'male')
    .slice(0, simRoundCount(day))
  const segments: StrengthExerciseLog[] = []
  specs.forEach((spec, i) => {
    segments.push({
      name: `Run ${i + 1} — 1 km`,
      focus: 'full',
      sets: [{ reps: 0, weight: '', done: false }],
    })
    segments.push({
      name: stationSegmentName(spec),
      focus: 'full',
      sets: [{ reps: 0, weight: '', done: false }],
    })
  })
  return segments
}
