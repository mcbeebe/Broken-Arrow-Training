import { describe, it, expect } from 'vitest'
import type { HRZone, PlannedDay, TrainingWeek } from '../types'
import {
  toNumericZones,
  rezoneZoneString,
  rezoneDetailString,
  rezonePlannedDay,
  rezoneWeeks,
} from '../utils/rezone'

const mikeBaseline: HRZone[] = [
  { zone: 'Z1 – Recovery', hr: '108–128', pct: '55–65%', desc: '' },
  { zone: 'Z2 – Aerobic', hr: '128–148', pct: '65–75%', desc: '' },
  { zone: 'Z3 – Tempo', hr: '148–167', pct: '75–85%', desc: '' },
  { zone: 'Z4 – Threshold', hr: '167–177', pct: '85–90%', desc: '' },
]

// Same shape but lower max HR — what a user lands on after editing
// Settings and recalculating. Used to assert plan strings update.
const mikeLowered: HRZone[] = [
  { zone: 'Z1 – Recovery', hr: '100–118', pct: '55–65%', desc: '' },
  { zone: 'Z2 – Aerobic', hr: '118–137', pct: '65–75%', desc: '' },
  { zone: 'Z3 – Tempo', hr: '137–155', pct: '75–85%', desc: '' },
  { zone: 'Z4 – Threshold', hr: '155–164', pct: '85–90%', desc: '' },
]

const jimZones: HRZone[] = [
  { zone: 'Z1 – Recovery', hr: '83–115', pct: '50–69%', desc: '' },
  { zone: 'Z2 – Aerobic', hr: '115–130', pct: '69–78%', desc: '' },
  { zone: 'Z3 – Tempo', hr: '130–145', pct: '78–87%', desc: '' },
  { zone: 'Z4 – Threshold', hr: '145–155', pct: '87–93%', desc: '' },
]

describe('toNumericZones', () => {
  it('parses well-formed zones into sorted numeric form', () => {
    const nz = toNumericZones(mikeBaseline)
    expect(nz).toEqual([
      { num: 1, low: 108, high: 128 },
      { num: 2, low: 128, high: 148 },
      { num: 3, low: 148, high: 167 },
      { num: 4, low: 167, high: 177 },
    ])
  })

  it('skips zones with unparseable labels or bpm strings', () => {
    const nz = toNumericZones([
      { zone: 'Recovery', hr: '108–128', pct: '', desc: '' },
      { zone: 'Z2', hr: 'unknown', pct: '', desc: '' },
      { zone: 'Z3 – Tempo', hr: '148–167', pct: '', desc: '' },
    ])
    expect(nz).toEqual([{ num: 3, low: 148, high: 167 }])
  })
})

describe('rezoneZoneString', () => {
  const nz = toNumericZones(mikeLowered)

  it('rewrites a single-zone band', () => {
    expect(rezoneZoneString('Z1 (108–128)', nz)).toBe('Z1 (100–118)')
  })

  it('rewrites a multi-zone band like Z1–2', () => {
    expect(rezoneZoneString('3.0 mi · Z1–2 (108–148)', nz))
      .toBe('3.0 mi · Z1–2 (100–137)')
  })

  it('rewrites a zone with a descriptor like "intervals"', () => {
    expect(rezoneZoneString('3.5 mi · Z3 intervals (148–167)', nz))
      .toBe('3.5 mi · Z3 intervals (137–155)')
  })

  it('preserves ASCII hyphen separator when the source used one', () => {
    expect(rezoneZoneString('Z1-2 (108-148)', nz)).toBe('Z1-2 (100–137)')
  })

  it('returns the input unchanged when no zone label is present', () => {
    expect(rezoneZoneString('—', nz)).toBe('—')
    expect(rezoneZoneString('Gym work', nz)).toBe('Gym work')
  })

  it('leaves the string alone when zones array is empty', () => {
    expect(rezoneZoneString('Z2 (128–148)', [])).toBe('Z2 (128–148)')
  })

  it('leaves the string alone when the referenced zone is undefined', () => {
    const z123 = toNumericZones(mikeLowered.slice(0, 3))
    expect(rezoneZoneString('Z4 (167–177)', z123)).toBe('Z4 (167–177)')
  })

  it('is a no-op when zones already match the baked string', () => {
    const baseline = toNumericZones(mikeBaseline)
    expect(rezoneZoneString('Z1 (108–128)', baseline)).toBe('Z1 (108–128)')
  })
})

describe('rezoneDetailString', () => {
  it('rewrites AeT bpm refs to top of Z2', () => {
    const nz = toNumericZones(jimZones)
    expect(rezoneDetailString('Stay below AeT (130).', nz))
      .toBe('Stay below AeT (130).')
    // Simulate a lowered Z2 ceiling.
    const dropped = toNumericZones([
      { zone: 'Z1', hr: '80–110', pct: '', desc: '' },
      { zone: 'Z2', hr: '110–125', pct: '', desc: '' },
      { zone: 'Z3', hr: '125–140', pct: '', desc: '' },
      { zone: 'Z4', hr: '140–150', pct: '', desc: '' },
    ])
    expect(rezoneDetailString('Stay below AeT (130).', dropped))
      .toBe('Stay below AeT (125).')
  })

  it('rewrites AnT and "AnT HR" bpm refs to top of Z3', () => {
    const dropped = toNumericZones([
      { zone: 'Z1', hr: '80–110', pct: '', desc: '' },
      { zone: 'Z2', hr: '110–125', pct: '', desc: '' },
      { zone: 'Z3', hr: '125–140', pct: '', desc: '' },
      { zone: 'Z4', hr: '140–150', pct: '', desc: '' },
    ])
    expect(rezoneDetailString('4×5 min at AnT HR (145) or RPE 7-8.', dropped))
      .toBe('4×5 min at AnT HR (140) or RPE 7-8.')
    expect(rezoneDetailString('Then 3×5 min at AnT (145).', dropped))
      .toBe('Then 3×5 min at AnT (140).')
  })

  it('leaves AeT/AnT mentions without a bpm parenthetical alone', () => {
    const nz = toNumericZones(jimZones)
    expect(rezoneDetailString('Easy aerobic run just below AeT.', nz))
      .toBe('Easy aerobic run just below AeT.')
  })
})

describe('rezonePlannedDay', () => {
  it('rewrites both zone and detail when zones differ from baked values', () => {
    const day: PlannedDay = {
      day: 'Tue 4/14',
      type: 'run',
      workout: 'Aerobic run',
      detail: 'Stay below AeT (130).',
      zone: '3.5 mi · Z1–2 (83–130)',
      route: '',
      time: '41 min',
    }
    const dropped = toNumericZones([
      { zone: 'Z1', hr: '80–110', pct: '', desc: '' },
      { zone: 'Z2', hr: '110–125', pct: '', desc: '' },
      { zone: 'Z3', hr: '125–140', pct: '', desc: '' },
      { zone: 'Z4', hr: '140–150', pct: '', desc: '' },
    ])
    const out = rezonePlannedDay(day, dropped)
    expect(out.zone).toBe('3.5 mi · Z1–2 (80–125)')
    expect(out.detail).toBe('Stay below AeT (125).')
    expect(out).not.toBe(day)
  })

  it('returns the same reference when nothing needed rewriting', () => {
    const day: PlannedDay = {
      day: 'Mon 4/13',
      type: 'rest',
      workout: 'Rest',
      detail: '',
      zone: '—',
      route: '—',
      time: '—',
    }
    const nz = toNumericZones(mikeBaseline)
    expect(rezonePlannedDay(day, nz)).toBe(day)
  })
})

describe('rezoneWeeks', () => {
  it('applies the transform across every day in every week', () => {
    const weeks: TrainingWeek[] = [
      {
        num: 1,
        dates: '4/13 – 4/19',
        miles: 0,
        focus: '',
        days: [
          {
            day: 'Mon', type: 'strength', workout: 'STRENGTH',
            detail: '', zone: 'Z1 (108–128)', route: '', time: '1 hr',
          },
          {
            day: 'Tue', type: 'run', workout: 'Easy run',
            detail: '', zone: '3.0 mi · Z1–2 (108–148)', route: '', time: '45 min',
          },
        ],
      },
    ]
    const out = rezoneWeeks(weeks, mikeLowered)
    expect(out[0].days[0].zone).toBe('Z1 (100–118)')
    expect(out[0].days[1].zone).toBe('3.0 mi · Z1–2 (100–137)')
  })

  it('is a no-op when zones is empty', () => {
    const weeks: TrainingWeek[] = [
      {
        num: 1, dates: '4/13 – 4/19', miles: 0, focus: '', days: [
          { day: 'Mon', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        ],
      },
    ]
    expect(rezoneWeeks(weeks, [])).toBe(weeks)
  })
})
