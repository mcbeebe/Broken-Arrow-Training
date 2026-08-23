/**
 * Hyrox finish-time projection (Phase 4, PR 10).
 *
 * Builds a projected race finish from the best evidence available, in
 * strict priority order per segment:
 *
 *   1. MEASURED — the athlete's most recent race simulation (Phase 3b
 *      stationSplits): actual run-leg and station times at race spec.
 *   2. BENCHMARKED — erg 1k baselines, the 500 m erg test, wall-ball
 *      unbroken capacity, sled RPE (all N4/P5 data).
 *   3. RUN FITNESS — 1 km leg pace from the athlete's VDOT anchor with a
 *      compromised-running penalty.
 *   4. TYPICAL — age-group averages, used only to fill what nothing
 *      personal can speak to.
 *
 * The range is honest about its inputs: a full simulation projects at
 * ±3%, benchmarks-only at ±7%, typicals at ±10%. When NOTHING personal
 * informs the projection it returns null — a number built entirely from
 * population averages is not this athlete's projection.
 */
import type { TrainingWeek, ActualWorkout } from '../../types'
import type { StrengthCapacity } from '../strength/benchmark'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { athleteCurrentVdot } from '../planGenerator/paceTargets'
import { paceBoundsForZone } from '../planGenerator/vdot'
import { stationSpecs, HYROX_RUN_LEGS, type StationSpec } from './spec'

type StationKey = StationSpec['key']

export type SegmentSource = 'sim' | 'benchmark' | 'run-fitness' | 'typical'

export interface SegmentEstimate {
  key: StationKey | 'runs' | 'roxzone'
  label: string
  /** Total seconds for this line (runs are all 8 legs together). */
  sec: number
  source: SegmentSource
}

export interface HyroxProjection {
  /** Midpoint projection in seconds. */
  totalSec: number
  lowSec: number
  highSec: number
  segments: SegmentEstimate[]
  confidence: 'low' | 'medium' | 'high'
  /** Human-readable evidence list, strongest first. */
  basis: string[]
}

/** Typical age-group station times (seconds), Open division. Loads vary
 *  by division/sex but the time spread between divisions is smaller than
 *  the ±10% band these fallbacks project at. */
const TYPICAL_STATION_SEC: Record<StationKey, number> = {
  skierg: 250,
  sled_push: 180,
  sled_pull: 240,
  burpee_broad_jump: 270,
  row: 255,
  farmers_carry: 120,
  sandbag_lunges: 210,
  wall_balls: 300,
}

/** Typical 1 km race-leg pace when no run anchor exists. */
const TYPICAL_RUN_LEG_SEC = 330

/** Transition (roxzone) allowance when segments aren't sim-measured —
 *  simulation splits absorb transitions into the segments themselves. */
const ROXZONE_SEC = 360

/** Compromised running: race legs run off stations sit ~10% over what
 *  the same athlete holds in an open run at threshold effort. */
const COMPROMISED_RUN_PENALTY = 1.10

const MILE_KM = 1.609344

/** Match a Phase 3b split label back to its station. */
function stationKeyFor(label: string): StationKey | null {
  const l = label.toLowerCase()
  if (l.startsWith('skierg')) return 'skierg'
  if (l.startsWith('sled push')) return 'sled_push'
  if (l.startsWith('sled pull')) return 'sled_pull'
  if (l.startsWith('burpee')) return 'burpee_broad_jump'
  if (l.startsWith('row')) return 'row'
  if (l.startsWith('farmer')) return 'farmers_carry'
  if (l.startsWith('sandbag')) return 'sandbag_lunges'
  if (l.startsWith('wall ball')) return 'wall_balls'
  return null
}

interface SimEvidence {
  date: string
  runLegSec: number
  runLegsMeasured: number
  stationSec: Partial<Record<StationKey, number>>
}

/** The newest logged workout whose stationSplits describe a simulation
 *  (runs + stations). Multi-round circuit splits don't qualify. */
export function latestSimEvidence(weeks: TrainingWeek[]): SimEvidence | null {
  let best: { date: string; splits: NonNullable<ActualWorkout['stationSplits']> } | null = null
  for (const week of weeks) {
    for (const day of week.days) {
      const splits = day.actual?.stationSplits
      if (!splits?.some(s => s.kind === 'run') || !splits.some(s => s.kind === 'station')) continue
      const date = day.actual?.startDate?.slice(0, 10) ?? ''
      if (!date) continue
      if (!best || date > best.date) best = { date, splits }
    }
  }
  if (!best) return null
  const runs = best.splits.filter(s => s.kind === 'run' && s.sec > 0)
  if (runs.length === 0) return null
  const stationSec: Partial<Record<StationKey, number>> = {}
  for (const s of best.splits) {
    if (s.kind !== 'station' || s.sec <= 0) continue
    const key = stationKeyFor(s.label)
    if (key && stationSec[key] == null) stationSec[key] = s.sec
  }
  return {
    date: best.date,
    runLegSec: Math.round(runs.reduce((n, r) => n + r.sec, 0) / runs.length),
    runLegsMeasured: runs.length,
    stationSec,
  }
}

const fmtSec = (v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`

export interface ProjectionInput {
  weeks: TrainingWeek[]
  config?: OnboardingConfig | null
  capacity?: StrengthCapacity | null
}

export function projectHyroxFinish(input: ProjectionInput): HyroxProjection | null {
  const { weeks, config, capacity } = input
  const sim = latestSimEvidence(weeks)
  const basis: string[] = []
  const specs = stationSpecs(config?.hyroxDivision ?? 'open', config?.sex === 'female' ? 'female' : 'male')

  // ── Run legs ────────────────────────────────────────────────
  let runLegSec: number
  let runSource: SegmentSource
  const vdot = config ? athleteCurrentVdot(config) : null
  if (sim) {
    runLegSec = sim.runLegSec
    runSource = 'sim'
  } else if (vdot) {
    const lt = paceBoundsForZone(vdot, 'lactate_threshold')
    if (lt) {
      const midPerMile = (lt.paceSecPerMileLow + lt.paceSecPerMileHigh) / 2
      runLegSec = Math.round((midPerMile / MILE_KM) * COMPROMISED_RUN_PENALTY)
      runSource = 'run-fitness'
    } else {
      runLegSec = TYPICAL_RUN_LEG_SEC
      runSource = 'typical'
    }
  } else {
    runLegSec = TYPICAL_RUN_LEG_SEC
    runSource = 'typical'
  }

  // ── Stations, in race order ─────────────────────────────────
  const stationEstimates: SegmentEstimate[] = specs.map(spec => {
    const key = spec.key
    if (sim?.stationSec[key] != null) {
      return { key, label: spec.name, sec: sim.stationSec[key]!, source: 'sim' as const }
    }
    // Benchmarks, station by station.
    if (key === 'skierg') {
      if (config?.skiErg1kSeconds) return { key, label: spec.name, sec: Math.round(config.skiErg1kSeconds + 18), source: 'benchmark' as const }
      if (capacity?.erg500Sec) return { key, label: spec.name, sec: Math.round(capacity.erg500Sec * 2 + 25), source: 'benchmark' as const }
    }
    if (key === 'row') {
      if (config?.row1kSeconds) return { key, label: spec.name, sec: Math.round(config.row1kSeconds + 18), source: 'benchmark' as const }
      if (capacity?.erg500Sec) return { key, label: spec.name, sec: Math.round(capacity.erg500Sec * 2 + 18), source: 'benchmark' as const }
    }
    if (key === 'wall_balls' && capacity?.wallBallsUnbroken && capacity.wallBallsUnbroken > 0) {
      const perSet = Math.max(5, Math.round(capacity.wallBallsUnbroken * 0.6))
      const total = spec.unit === 'reps' ? spec.amount : 100
      const breaks = Math.max(0, Math.ceil(total / perSet) - 1)
      return { key, label: spec.name, sec: Math.round(total * 2.2 + breaks * 12), source: 'benchmark' as const }
    }
    if ((key === 'sled_push' || key === 'sled_pull') && capacity?.sledRpe) {
      const push = 90 + capacity.sledRpe * 15
      return { key, label: spec.name, sec: Math.round(key === 'sled_push' ? push : push * 1.25), source: 'benchmark' as const }
    }
    return { key, label: spec.name, sec: TYPICAL_STATION_SEC[key], source: 'typical' as const }
  })

  // Nothing personal at all → no projection. Population averages aren't
  // this athlete's number.
  const personal = runSource !== 'typical' || stationEstimates.some(s => s.source !== 'typical')
  if (!personal) return null

  // ── Assemble ────────────────────────────────────────────────
  const simStations = stationEstimates.filter(s => s.source === 'sim').length
  // Sim splits absorb transitions into the segments; only a projection
  // built mostly from parts needs the explicit roxzone allowance.
  const simBased = sim != null && simStations >= 4
  const roxzoneSec = simBased ? 0 : ROXZONE_SEC

  const segments: SegmentEstimate[] = [
    { key: 'runs', label: `Runs (${HYROX_RUN_LEGS} × 1 km)`, sec: runLegSec * HYROX_RUN_LEGS, source: runSource },
    ...stationEstimates,
    ...(roxzoneSec > 0
      ? [{ key: 'roxzone' as const, label: 'Transitions (roxzone)', sec: roxzoneSec, source: 'typical' as const }]
      : []),
  ]

  let totalSec = segments.reduce((n, s) => n + s.sec, 0)
  // A simulation is run in training legs; race day is tapered and fresh.
  if (simBased) totalSec = Math.round(totalSec * 0.97)

  // ── Range + confidence, from what actually informed it ──────
  const typicalCount = segments.filter(s => s.source === 'typical').length
  const benchmarkCount = stationEstimates.filter(s => s.source === 'benchmark').length
  let spread: number
  let confidence: HyroxProjection['confidence']
  if (simBased && simStations >= 8) {
    spread = 0.03; confidence = 'high'
  } else if (sim) {
    spread = 0.05; confidence = 'medium'
  } else if (vdot && benchmarkCount >= 2) {
    spread = 0.07; confidence = 'medium'
  } else {
    spread = 0.10; confidence = 'low'
  }

  // ── Basis, strongest evidence first ─────────────────────────
  if (sim) {
    basis.push(`Simulation on ${sim.date}: ${sim.runLegsMeasured} run legs averaging ${fmtSec(sim.runLegSec)}/km, ${simStations} stations measured at race spec`)
  }
  if (runSource === 'run-fitness') {
    basis.push('Run legs from your fitness anchor, with a compromised-running allowance')
  }
  if (benchmarkCount > 0) {
    basis.push(`${benchmarkCount} station${benchmarkCount === 1 ? '' : 's'} from your benchmarks (erg splits, wall-ball capacity, sled effort)`)
  }
  if (typicalCount > 0) {
    basis.push(`${typicalCount} segment${typicalCount === 1 ? '' : 's'} filled with typical age-group times — a simulation replaces these with your own`)
  }

  return {
    totalSec,
    lowSec: Math.round(totalSec * (1 - spread)),
    highSec: Math.round(totalSec * (1 + spread)),
    segments,
    confidence,
    basis,
  }
}

/** "1:24:30" / "58:20" for display. */
export function formatFinish(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}
