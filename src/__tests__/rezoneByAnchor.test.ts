import { describe, it, expect } from 'vitest'
import type { HRZone, PlannedDay, TrainingWeek, WorkoutType } from '../types'
import { buildZoneAnchorOps, scaleBpmBands, scaleThresholdRefs } from '../utils/rezoneByAnchor'
import { replayEdits } from '../hooks/usePlanEdits'
import { parseHRRange } from '../utils/targets'

/**
 * S.1 slice tests: one anchor change rewrites BOTH plan dialects —
 * Hyrox "Z2 (128–148)" bands via the zone table, method "130-148 bpm"
 * bands via the LTHR ratio — future days only, through the plan-edit
 * op seam.
 */

function day(dayLabel: string, over: Partial<PlannedDay> & { type?: WorkoutType } = {}): PlannedDay {
  return {
    day: dayLabel,
    type: over.type ?? 'run',
    workout: over.workout ?? 'Easy aerobic',
    detail: over.detail ?? '',
    zone: over.zone ?? '—',
    route: '', time: '45 min',
    ...over,
  }
}

function week(days: PlannedDay[], num = 1, dates = 'Jul 6-12'): TrainingWeek {
  return { num, dates, miles: 20, focus: 'Build', days }
}

const TODAY = '2026-07-06'

const NEW_ZONES: HRZone[] = [
  { zone: 'Z1', hr: '107–127', pct: '55-65%', desc: 'Recovery' },
  { zone: 'Z2', hr: '127–146', pct: '65-75%', desc: 'Aerobic' },
  { zone: 'Z3', hr: '146–166', pct: '75-85%', desc: 'Tempo' },
  { zone: 'Z4', hr: '166–176', pct: '85-90%', desc: 'Threshold' },
]

describe('scaleBpmBands — method-dialect bands', () => {
  it('scales "lo-hi bpm" by the LTHR ratio, leaving pace tokens alone', () => {
    const s = 'AeT (Aerobic Threshold) · 8:35-9:15 /mi · 130-148 bpm'
    const out = scaleBpmBands(s, 163 / 150)
    expect(out).toContain('8:35-9:15 /mi')          // pace untouched
    expect(out).toContain(`${Math.round(130 * 163 / 150)}-${Math.round(148 * 163 / 150)} bpm`)
  })

  it('does not touch Hyrox parenthesized bands (no bpm suffix)', () => {
    expect(scaleBpmBands('5 mi · Z2 (128–148)', 1.1)).toBe('5 mi · Z2 (128–148)')
  })
})

describe('scaleThresholdRefs', () => {
  it('scales bare AeT/AnT/LTHR refs', () => {
    expect(scaleThresholdRefs('Stay below AeT (148)', 163 / 150)).toBe(`Stay below AeT (${Math.round(148 * 163 / 150)})`)
    expect(scaleThresholdRefs('4×5 min at AnT HR (160)', 1.05)).toBe('4×5 min at AnT HR (168)')
  })
})

describe('buildZoneAnchorOps', () => {
  const methodDay = () => day('Tue 7/7', {
    zone: 'AeT (Aerobic Threshold) · 8:35-9:15 /mi · 130-148 bpm',
    detail: 'Stay below AeT — conversational.',
  })
  const hyroxDay = () => day('Wed 7/8', {
    zone: '5 mi · Z2 (128–148)',
    detail: 'Nose-breathing easy. Z2 (128–148) cap.',
  })

  it('one anchor change rewrites BOTH dialects (the S.1 slice)', () => {
    const weeks = [week([methodDay(), hyroxDay()])]
    const ops = buildZoneAnchorOps(
      weeks,
      { oldLthr: 150, newLthr: 163, newZones: NEW_ZONES },
      TODAY, 'test',
    )
    expect(ops).toHaveLength(2)
    const applied = replayEdits(weeks, ops.map((o, i) => ({ id: `e${i}`, batchId: 'b1', op: o.op, appliedAt: i })))
    // Method day: bpm band scaled by 163/150.
    expect(applied[0].days[0].zone).toContain('141-161 bpm')
    expect(applied[0].days[0].zone).toContain('8:35-9:15 /mi')
    // Hyrox day: Z2 band rewritten from the new table, in zone AND detail.
    expect(applied[0].days[1].zone).toBe('5 mi · Z2 (127–146)')
    expect(applied[0].days[1].detail).toContain('Z2 (127–146)')
  })

  it('GUARD: past days and logged days are never touched', () => {
    const past = day('Mon 7/6', { zone: '5 mi · Z2 (128–148)' })
    const logged = day('Thu 7/9', {
      zone: '5 mi · Z2 (128–148)',
      actual: { name: 'Run', distance: 5, movingTime: 2700 } as unknown as PlannedDay['actual'],
    })
    const ops = buildZoneAnchorOps(
      [week([past, logged])],
      { oldLthr: 150, newLthr: 163, newZones: NEW_ZONES },
      '2026-07-07', 'test',
    )
    expect(ops).toHaveLength(0)
  })

  it('unchanged strings emit no ops', () => {
    const rest = day('Fri 7/10', { type: 'rest', workout: 'Rest', zone: '—' })
    const ops = buildZoneAnchorOps(
      [week([rest])],
      { oldLthr: 150, newLthr: 150, newZones: NEW_ZONES },
      TODAY, 'test',
    )
    expect(ops).toHaveLength(0)
  })
})

describe('parseHRRange — both dialects (S.1)', () => {
  it('reads the parenthesized Hyrox band', () => {
    expect(parseHRRange('5 mi · Z2 (128–148)')).toEqual({ low: 128, high: 148 })
  })

  it('reads the method "lo-hi bpm" band (previously invisible)', () => {
    expect(parseHRRange('AeT (Aerobic Threshold) · 8:35-9:15 /mi · 130-148 bpm')).toEqual({ low: 130, high: 148 })
  })
})
