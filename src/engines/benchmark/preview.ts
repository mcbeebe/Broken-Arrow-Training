/**
 * "What this changes" — computed by the real engines before the athlete
 * saves a benchmark, so the number on the sheet is the number the plan will
 * use, not a paraphrase of it.
 *
 * Mike's rule for the sheet: a benchmark applies immediately, so the
 * consequences have to be OBVIOUS before the tap. This runs the same
 * derivation App uses (deriveAnchors) with the candidate appended, then
 * asks the same engines — resolvePaces for run plans, projectHyroxFinish
 * for Hyrox, the capacity fields for strength — and diffs before/after.
 * It never mutates anything; the sheet calls it on every keystroke.
 */

import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import type { TrainingWeek } from '../../types'
import type { StrengthCapacity } from '../strength/benchmark'
import { resolvePaces, athleteCurrentVdot } from '../planGenerator/paceTargets'
import { projectHyroxFinish, formatFinish } from '../hyrox/projection'
import { fmtPaceSecMi } from '../adaptive/athleteModel'
import {
  BENCHMARK_KINDS, RACE_KINDS, deriveAnchors, latestByKind,
  type Benchmark, type DerivedAnchors,
} from './log'

export interface BenchmarkPreview {
  /** One line per concrete consequence, athlete-facing. */
  lines: string[]
  /** False when the entry is recorded but nothing the plan reads moves. */
  changesPlan: boolean
  /** Something the athlete should know before saving — amber, not red. */
  caution?: string
}

export interface PreviewInput {
  candidate: Omit<Benchmark, 'id' | 'at'>
  log: readonly Benchmark[]
  config: OnboardingConfig | null | undefined
  capacity: StrengthCapacity | null | undefined
  weeks: TrainingWeek[]
  method?: TrainingMethod | null
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** A benchmark value in the athlete's units. */
export function formatBenchmarkValue(b: Pick<Benchmark, 'kind' | 'value' | 'unit'>): string {
  if (b.kind === 'easy_pace') return fmtPaceSecMi(b.value)
  switch (b.unit) {
    case 'seconds': return fmtTime(b.value)
    case 'bpm': return `${b.value} bpm`
    case 'reps': return `${b.value} reps`
    case 'lb': return `${b.value} lb`
    case 'rpe': return `RPE ${b.value}`
  }
}

function applyAnchors(config: OnboardingConfig, d: DerivedAnchors): OnboardingConfig {
  const next = { ...config }
  // Mirror App's rule: the log owns race/easy-pace anchors; a legacy
  // {type:'lthr'} anchor is left alone.
  if (d.fitnessAnchor) next.fitnessAnchor = d.fitnessAnchor
  else if (config.fitnessAnchor && config.fitnessAnchor.type !== 'lthr') delete next.fitnessAnchor
  if (d.testedLthrBpm != null) next.testedLthrBpm = d.testedLthrBpm; else delete next.testedLthrBpm
  if (d.skiErg1kSeconds != null) next.skiErg1kSeconds = d.skiErg1kSeconds; else delete next.skiErg1kSeconds
  if (d.row1kSeconds != null) next.row1kSeconds = d.row1kSeconds; else delete next.row1kSeconds
  return next
}

function paceRange(t?: { paceSecPerMileLow?: number; paceSecPerMileHigh?: number }): string | null {
  if (!t || t.paceSecPerMileLow == null) return null
  const lo = fmtPaceSecMi(t.paceSecPerMileLow).replace(' /mi', '')
  const hi = t.paceSecPerMileHigh != null ? fmtPaceSecMi(t.paceSecPerMileHigh).replace(' /mi', '') : null
  return hi && hi !== lo ? `${lo}–${hi} /mi` : `${lo} /mi`
}

function hrRange(t?: { hrBpmLow?: number; hrBpmHigh?: number }): string | null {
  if (!t || t.hrBpmLow == null) return null
  return t.hrBpmHigh != null && t.hrBpmHigh !== t.hrBpmLow ? `${t.hrBpmLow}–${t.hrBpmHigh} bpm` : `${t.hrBpmLow} bpm`
}

const CAPACITY_LABEL: Partial<Record<Benchmark['kind'], [keyof StrengthCapacity, string]>> = {
  push_ups: ['pushUps', 'Every pressing prescription follows.'],
  goblet_squat_8rm: ['gobletSquatLb', 'Every lower-body load follows.'],
  plank: ['plankSec', 'Every core hold follows.'],
  wall_balls_unbroken: ['wallBallsUnbroken', 'The size of every prescribed wall-ball set follows.'],
  sled_push_rpe: ['sledRpe', 'Sled loading follows.'],
  erg_500: ['erg500Sec', 'Erg interval targets follow.'],
  erg_1k: ['erg1kSec', 'Erg interval targets follow.'],
}

export function previewBenchmark(input: PreviewInput): BenchmarkPreview {
  const { candidate, log, config, capacity, weeks, method } = input
  const spec = BENCHMARK_KINDS[candidate.kind]
  const lines: string[] = []
  let caution: string | undefined

  const latest = latestByKind(log)
  const current = latest[candidate.kind]
  if (current && current.dateIso > candidate.dateIso) {
    caution = `Older than your current ${spec.label} (${formatBenchmarkValue(current)}, ${current.dateIso}). It is kept as history; the newer one keeps driving the plan.`
    return { lines: [caution], changesPlan: false, caution }
  }

  const probe: Benchmark = { ...candidate, id: '__preview__', at: Number.MAX_SAFE_INTEGER }
  const before = deriveAnchors(log)
  const after = deriveAnchors([...log, probe])

  // ── Pace anchors ──────────────────────────────────────────────────────
  const isPaceKind = (RACE_KINDS as readonly string[]).includes(candidate.kind) || candidate.kind === 'easy_pace'
  if (isPaceKind && candidate.kind === 'easy_pace' && before.fitnessAnchor && before.fitnessAnchor.type !== 'easy_pace') {
    const race = before.fitnessAnchor
    caution = `A race time outranks an easy pace, so this is recorded but your paces stay anchored to your ${BENCHMARK_KINDS[race.type as Benchmark['kind']]?.label ?? 'race'} (${fmtTime(race.valueSeconds ?? 0)}).`
    return { lines: [caution], changesPlan: false, caution }
  }

  if ((isPaceKind || candidate.kind === 'lthr') && config && method) {
    const cBefore = applyAnchors(config, before)
    const cAfter = applyAnchors(config, after)
    const pBefore = resolvePaces(method, cBefore).byZone
    const pAfter = resolvePaces(method, cAfter).byZone
    const vBefore = athleteCurrentVdot(cBefore)
    const vAfter = athleteCurrentVdot(cAfter)
    if (vAfter != null && vBefore !== vAfter) {
      lines.push(vBefore != null ? `VDOT ${vBefore.toFixed(1)} → ${vAfter.toFixed(1)}` : `VDOT ${vAfter.toFixed(1)} (first race anchor)`)
    }
    for (const [zone, label] of [['easy', 'Easy'], ['lactate_threshold', 'Threshold'], ['marathon_pace', 'Marathon pace']] as const) {
      const a = paceRange(pBefore[zone]); const b = paceRange(pAfter[zone])
      if (b && a !== b) lines.push(`${label}: ${a ?? '—'} → ${b}`)
    }
    if (candidate.kind === 'lthr') {
      for (const [zone, label] of [['easy', 'Easy HR'], ['lactate_threshold', 'Threshold HR']] as const) {
        const a = hrRange(pBefore[zone]); const b = hrRange(pAfter[zone])
        if (b && a !== b) lines.push(`${label}: ${a ?? '—'} → ${b}`)
      }
      lines.push('Your pace anchor is untouched.')
    }
  }

  // ── Hyrox ──────────────────────────────────────────────────────────────
  const hyroxKinds: readonly Benchmark['kind'][] = ['ski_erg_1k', 'row_1k', 'erg_500', 'erg_1k', 'wall_balls_unbroken', 'wall_balls_100', 'sled_push_rpe', 'run_1k']
  if (config?.raceType === 'hyrox' && (hyroxKinds.includes(candidate.kind) || isPaceKind)) {
    const capBefore = capacity ?? null
    const capAfter = after.capacity ? { ...(capacity ?? {}), ...after.capacity } as StrengthCapacity : capBefore
    const projBefore = projectHyroxFinish({ weeks, config: applyAnchors(config, before), capacity: capBefore })
    const projAfter = projectHyroxFinish({ weeks, config: applyAnchors(config, after), capacity: capAfter })
    if (projAfter && projBefore && projAfter.totalSec !== projBefore.totalSec) {
      lines.push(`Projected finish ${formatFinish(projBefore.totalSec)} → ${formatFinish(projAfter.totalSec)}`)
    } else if (projAfter && !projBefore) {
      lines.push(`Projected finish ${formatFinish(projAfter.totalSec)} (first projection)`)
    }
    if (candidate.kind === 'ski_erg_1k' || candidate.kind === 'row_1k') {
      const station = candidate.kind === 'ski_erg_1k' ? 'SkiErg' : 'Row'
      lines.push(`${station} target on station days: ~${fmtTime(candidate.value + 10)}–${fmtTime(candidate.value + 25)} per 1K`)
    }
  }

  // ── Strength capacity ─────────────────────────────────────────────────
  const capField = CAPACITY_LABEL[candidate.kind]
  if (capField) {
    const [field, why] = capField
    const prev = capacity?.[field]
    lines.push(`${spec.label}: ${typeof prev === 'number' ? formatBenchmarkValue({ kind: candidate.kind, value: prev, unit: candidate.unit }) : 'not set'} → ${formatBenchmarkValue(candidate)}. ${why}`)
  }

  if (lines.length === 0) {
    const coachOnly = spec.staleAfterWeeks == null && !capField && !isPaceKind && candidate.kind !== 'lthr'
    if (coachOnly) return { lines: ['Recorded for the coach. Nothing in the plan changes.'], changesPlan: false }
    return { lines: [spec.feeds], changesPlan: true }
  }
  return { lines, changesPlan: true, caution }
}
