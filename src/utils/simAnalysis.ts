import type { ActualWorkout } from '../types'

/**
 * Simulation-split analysis (Phase 3b, design screen 9).
 *
 * The athlete has no configured target finish time, so targets are
 * SHARE-based and self-referential: given the session's own total, how
 * should that time have distributed across segments for a typical
 * age-group racer? A station eating a much bigger share than expected is
 * where the race is being lost — expressed in minutes, not percentages.
 *
 * Weights are relative to a 1 km run leg (1.0), drawn from typical
 * age-group Hyrox splits (runs ~5 min; farmer carry ~2 min; wall balls
 * slightly over a run leg). They only shape the DISTRIBUTION — the
 * athlete's own total supplies the scale, so a faster athlete gets
 * proportionally faster targets everywhere.
 */

export type StationSplit = NonNullable<ActualWorkout['stationSplits']>[number]

/** Expected duration relative to a 1 km run leg, by station-label prefix. */
const STATION_WEIGHTS: [prefix: string, weight: number, reweightName: string][] = [
  ['skierg', 0.85, 'SkiErg'],
  ['sled push', 0.6, 'Sled Push'],
  ['sled pull', 0.8, 'Sled Pull'],
  ['burpee broad jump', 1.0, 'Burpee Broad Jump'],
  ['row', 0.9, 'Rowing'],
  ['farmer carry', 0.45, 'Farmer Carry'],
  ['farmers carry', 0.45, 'Farmer Carry'],
  ['sandbag lunge', 0.8, 'Sandbag Lunges'],
  ['wall ball', 1.05, 'Wall Balls'],
]

function stationEntry(label: string): { weight: number; reweightName: string } | null {
  const lower = label.toLowerCase()
  for (const [prefix, weight, reweightName] of STATION_WEIGHTS) {
    if (lower.startsWith(prefix)) return { weight, reweightName }
  }
  return null
}

export interface SimSplitRow {
  label: string
  kind: StationSplit['kind']
  sec: number
  /** Share-based target for this segment; absent when the session isn't a
   *  simulation (no run segments) or the segment is unrecognized. */
  expectedSec?: number
  /** sec − expectedSec: positive = slower than the session's own shape. */
  deltaSec?: number
}

export interface SimAnalysis {
  rows: SimSplitRow[]
  totalSec: number
  /** True when the splits describe a run+station simulation — deltas and
   *  the weak-station callout only exist then. */
  isSimulation: boolean
  /** The station losing the most time vs its expected share, when it is
   *  losing a meaningful amount (≥30s). reweightName is the onboarding /
   *  generator vocabulary for config.weakStation. */
  weakStation: { label: string; reweightName: string; lostSec: number } | null
}

/** Minimum time lost before a station is called out as THE weak one —
 *  under this, the callout would be noise on an honest race shape. */
const WEAK_STATION_MIN_LOST_SEC = 30

export function analyzeSimSplits(splits: StationSplit[]): SimAnalysis {
  const timed = splits.filter(s => s.sec > 0)
  const totalSec = timed.reduce((n, s) => n + s.sec, 0)
  const isSimulation = timed.some(s => s.kind === 'run') && timed.some(s => s.kind === 'station')

  if (!isSimulation) {
    return {
      rows: timed.map(s => ({ label: s.label, kind: s.kind, sec: s.sec })),
      totalSec,
      isSimulation: false,
      weakStation: null,
    }
  }

  // Distribute the session's own total across recognized run/station
  // segments by weight. Roxzone and unrecognized labels are listed but
  // carry no target — they must not distort the distribution.
  const weighted = timed.map(s => {
    if (s.kind === 'run') return { s, weight: 1.0, reweightName: null as string | null }
    if (s.kind === 'station') {
      const entry = stationEntry(s.label)
      return { s, weight: entry?.weight ?? null, reweightName: entry?.reweightName ?? null }
    }
    return { s, weight: null, reweightName: null }
  })
  const inShape = weighted.filter(w => w.weight != null)
  const shapeSec = inShape.reduce((n, w) => n + w.s.sec, 0)
  const shapeWeight = inShape.reduce((n, w) => n + (w.weight ?? 0), 0)

  const rows: SimSplitRow[] = weighted.map(({ s, weight }) => {
    if (weight == null || shapeWeight <= 0) return { label: s.label, kind: s.kind, sec: s.sec }
    const expectedSec = Math.round((weight / shapeWeight) * shapeSec)
    return { label: s.label, kind: s.kind, sec: s.sec, expectedSec, deltaSec: s.sec - expectedSec }
  })

  let weakStation: SimAnalysis['weakStation'] = null
  weighted.forEach(({ s, reweightName }, i) => {
    if (s.kind !== 'station' || !reweightName) return
    const delta = rows[i].deltaSec
    if (delta == null || delta < WEAK_STATION_MIN_LOST_SEC) return
    if (!weakStation || delta > weakStation.lostSec) {
      weakStation = { label: s.label, reweightName, lostSec: delta }
    }
  })

  return { rows, totalSec, isSimulation: true, weakStation }
}
