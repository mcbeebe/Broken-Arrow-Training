import { describe, it, expect } from 'vitest'
import { replayEdits } from '../hooks/usePlanEdits'
import { mergeGarminDetailIntoWeeks } from '../utils/matching'
import { rezoneWeeks } from '../utils/rezone'
import { mikePlan } from '../data'
import type { PlanEdit, GarminActivityDetail, HRZone, TrainingWeek } from '../types'

/**
 * Regression for the "every time I re-sync Garmin my workout adjustments are
 * reversed back and lost" report.
 *
 * Replicates the App `weeks` useMemo pipeline order — coach/manual plan edits
 * are layered FIRST, then the Garmin sync's data is merged, then zones are
 * rewritten — and proves that a sync only ever populates `day.actual`. It
 * must never revert the planned fields (type/workout/detail) the coach
 * changed. mikePlan Week 1: Mon 4/13 = strength (day 0), Tue 4/14 = run (1).
 */

const WEEK1 = 1

// Coach restructures Week 1: Mon strength → easy run, Tue easy run → rest.
function restructureBatch(): PlanEdit[] {
  const base = 1_700_000_000_000
  return [
    {
      id: 'e1', batchId: 'b1', appliedAt: base,
      op: { kind: 'updateDay', weekNum: WEEK1, dayIndex: 0, updates: { type: 'run', workout: 'Easy run', detail: 'Easy 50-min Z1–2 (108–148)' } },
    },
    {
      id: 'e2', batchId: 'b1', appliedAt: base + 1,
      op: { kind: 'updateDay', weekNum: WEEK1, dayIndex: 1, updates: { type: 'rest', workout: 'Rest', detail: '—' } },
    },
  ]
}

function garminRun(overrides: Partial<GarminActivityDetail> = {}): GarminActivityDetail {
  return {
    activityId: 42,
    name: 'Morning Run',
    type: 'running',
    startTimeLocal: '2026-04-13T07:00:00',
    durationSeconds: 3000,
    movingDurationSeconds: 3000,
    averageHR: 132,
    maxHR: 150,
    distanceMeters: 8000,
    elevationGainMeters: 40,
    elevationLossMeters: 40,
    calories: 400,
    ...overrides,
  }
}

// A lowered max-HR zone set — what `weeks` sees when a Garmin sync brings in
// fresh HR data and the athlete's zones recompute. rezone runs on every such
// change, so it must leave the coach's edited workout/type untouched.
const loweredZones: HRZone[] = [
  { zone: 'Z1 – Recovery', hr: '100–118', pct: '55–65%', desc: '' },
  { zone: 'Z2 – Aerobic', hr: '118–137', pct: '65–75%', desc: '' },
  { zone: 'Z3 – Tempo', hr: '137–155', pct: '75–85%', desc: '' },
  { zone: 'Z4 – Threshold', hr: '155–164', pct: '85–90%', desc: '' },
]

/** Mirror the App pipeline: edits → Garmin merge → rezone. */
function syncPipeline(details: Record<string, GarminActivityDetail[]>, zones: HRZone[]): TrainingWeek[] {
  let w = replayEdits(mikePlan.weeks, restructureBatch())
  w = mergeGarminDetailIntoWeeks(w, details)
  w = rezoneWeeks(w, zones)
  return w
}

describe('Garmin re-sync preserves coach/manual plan edits', () => {
  it('baseline: the restructure shows before any sync', () => {
    const w = replayEdits(mikePlan.weeks, restructureBatch())
    expect(w[0].days[0].type).toBe('run')
    expect(w[0].days[0].workout).toBe('Easy run')
    expect(w[0].days[1].type).toBe('rest')
  })

  it('a sync that attaches a Garmin activity to the edited day keeps the edit', () => {
    // The athlete actually ran on Mon 4/13 — Garmin has the activity.
    const w = syncPipeline({ '2026-04-13': [garminRun()] }, loweredZones)
    const mon = w[0].days[0]

    // The coach's edit stands — NOT reverted to the base "STRENGTH" day.
    expect(mon.type).toBe('run')
    expect(mon.workout).toBe('Easy run')
    expect(mon.workout).not.toBe('STRENGTH')

    // The sync's contribution is confined to `day.actual`.
    expect(mon.actual).toBeDefined()
    expect(mon.actual!.garminId).toBe(42)
    expect(mon.actual!.avgHR).toBe(132)
  })

  it('re-syncing repeatedly never erodes the edit', () => {
    // Three sync cycles in a row (the "every time I sync" loop).
    let w = mikePlan.weeks
    for (let i = 0; i < 3; i++) {
      w = replayEdits(mikePlan.weeks, restructureBatch())
      w = mergeGarminDetailIntoWeeks(w, { '2026-04-13': [garminRun({ activityId: 100 + i })] })
      w = rezoneWeeks(w, loweredZones)
    }
    expect(w[0].days[0].workout).toBe('Easy run')
    expect(w[0].days[1].workout).toBe('Rest')
  })

  it('rezone after a sync only rewrites bpm refs, leaving the edited workout intact', () => {
    const w = syncPipeline({}, loweredZones)
    const mon = w[0].days[0]
    // Workout/type from the edit are untouched; only the parenthesized bpm
    // inside the edited detail is normalized to the new zones.
    expect(mon.workout).toBe('Easy run')
    expect(mon.type).toBe('run')
    expect(mon.detail).toContain('Easy 50-min')
  })

  it('edits on days with no Garmin activity are equally preserved', () => {
    // Only Mon has an activity; Tue (edited → rest) has none.
    const w = syncPipeline({ '2026-04-13': [garminRun()] }, loweredZones)
    expect(w[0].days[1].type).toBe('rest')
    expect(w[0].days[1].workout).toBe('Rest')
    expect(w[0].days[1].actual).toBeUndefined()
  })
})
