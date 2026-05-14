// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { generateAthletePdf, pdfFilename } from '../utils/pdfExport'
import type { ActualWorkout, PerformanceMetrics, PlannedDay, RaceInfo, TrainingWeek, WorkoutType } from '../types'

function race(): RaceInfo {
  return {
    name: 'Broken Arrow 18K',
    date: '2026-06-20',
    startTime: '08:00',
    distance: '18K',
    distanceMiles: 11.2,
    elevation: '3,000 ft',
    elevationRange: '',
    course: 'Singletrack with two big climbs',
    cutoff: '',
    landmarks: [],
    gear: [],
    nutrition: '',
  }
}

function performance(n: number, ctl = 50): PerformanceMetrics[] {
  const out: PerformanceMetrics[] = []
  for (let i = 0; i < n; i++) {
    const month = String(((i / 30) | 0) + 1).padStart(2, '0')
    const day = String((i % 28) + 1).padStart(2, '0')
    out.push({ date: `2026-${month}-${day}`, ctl, atl: ctl - 5, tsb: 5, acwr: 1.1 })
  }
  return out
}

function actual(overrides: Partial<ActualWorkout> = {}): ActualWorkout {
  return {
    stravaId: overrides.stravaId ?? 1000,
    source: 'strava',
    name: overrides.name ?? 'Easy run',
    startDate: overrides.startDate ?? '2026-05-01T08:00:00',
    distance: overrides.distance ?? 5.2,
    movingTime: overrides.movingTime ?? 2700,
    elapsedTime: overrides.elapsedTime ?? 2700,
    elevationGain: overrides.elevationGain ?? 200,
    type: overrides.type ?? 'run',
    ...overrides,
  }
}

function day(opts: Partial<PlannedDay> & { dayLabel?: string } = {}): PlannedDay {
  return {
    day: opts.dayLabel ?? opts.day ?? 'Mon',
    type: (opts.type ?? 'run') as WorkoutType,
    workout: opts.workout ?? 'Easy run',
    detail: opts.detail ?? '',
    zone: opts.zone ?? 'Z2',
    route: opts.route ?? '',
    time: opts.time ?? '45 min',
    actual: opts.actual,
  }
}

function week(num: number, completedDays = 0): TrainingWeek {
  const days: PlannedDay[] = []
  for (let i = 0; i < 6; i++) {
    days.push(day({
      dayLabel: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      ...(i < completedDays
        ? {
            actual: actual({
              startDate: `2026-05-${String(i + 1).padStart(2, '0')}T08:00:00`,
              distance: 5.2,
              movingTime: 2700,
              elevationGain: 200,
            }),
          }
        : {}),
    }))
  }
  return {
    num,
    dates: '2026-05-01 - 2026-05-07',
    miles: 25,
    focus: 'Base building',
    days,
  }
}

async function pdfText(blob: Blob): Promise<string> {
  // Uncompressed jsPDF streams keep ASCII strings readable; plain-text
  // lines come through as `(some text) Tj` and we can search them
  // directly. (Bold + size-10 lines are emitted letter-spaced — those
  // aren't searched by the tests below.)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let ascii = ''
  // Chunked to avoid call-stack overflow on large PDFs.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    ascii += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return ascii
}

describe('generateAthletePdf — output shape', () => {
  it('produces a non-empty PDF Blob', () => {
    const blob = generateAthletePdf({
      athleteName: 'Test Athlete',
      race: race(),
      weeks: [week(1, 3), week(2, 4), week(3, 2)],
      performance: performance(30),
      windowWeeks: 12,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(2000)
    expect(blob.type).toBe('application/pdf')
  })

  it('does not throw on empty performance data', () => {
    expect(() => generateAthletePdf({
      athleteName: 'Test',
      race: race(),
      weeks: [],
      performance: [],
      windowWeeks: 4,
    })).not.toThrow()
  })

  it('does not throw when there are no completed sessions', () => {
    expect(() => generateAthletePdf({
      athleteName: 'Test',
      race: race(),
      weeks: [week(1, 0)],
      performance: performance(7),
      windowWeeks: 4,
    })).not.toThrow()
  })
})

describe('generateAthletePdf — per-week training log content', () => {
  it('emits Training log header + per-week headers', async () => {
    const blob = generateAthletePdf({
      athleteName: 'Test Athlete',
      race: race(),
      weeks: [week(1, 3), week(2, 4)],
      performance: performance(14),
      windowWeeks: 12,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    const text = await pdfText(blob)
    expect(text).toMatch(/Training log/i)
    expect(text).toMatch(/Week 1/)
    expect(text).toMatch(/Week 2/)
    expect(text).toMatch(/Base building/)
  })

  it('includes pace, HR, elevation, and RPE for runs', async () => {
    const richDay = day({
      dayLabel: 'Tue',
      workout: 'Tempo intervals',
      zone: 'Z3',
      time: '55 min',
      actual: actual({
        startDate: '2026-05-02T08:00:00',
        name: 'Tempo intervals',
        distance: 6.0,
        movingTime: 3000, // 50 min → 8:20/mi
        avgHR: 162,
        maxHR: 178,
        elevationGain: 480,
        rpe: 8,
        aerobicTE: 4.1,
        epoc: 152,
        calories: 612,
        hrZoneSummary: [
          { zone: 2, seconds: 600 },
          { zone: 3, seconds: 1800 },
          { zone: 4, seconds: 600 },
        ],
      }),
    })
    const w: TrainingWeek = { num: 12, dates: '2026-05-01 - 2026-05-07', miles: 30, focus: 'Build', days: [richDay] }
    const blob = generateAthletePdf({
      athleteName: 'Test',
      race: race(),
      weeks: [w],
      performance: performance(7),
      windowWeeks: 4,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    const text = await pdfText(blob)
    expect(text).toMatch(/6\.00 mi/)
    expect(text).toMatch(/8:20\/mi/)
    expect(text).toMatch(/162 avg HR/)
    expect(text).toMatch(/178 max/)
    expect(text).toMatch(/480 ft/)
    expect(text).toMatch(/RPE 8\/10/)
    expect(text).toMatch(/Aerobic TE 4\.1/)
    expect(text).toMatch(/EPOC 152/)
    expect(text).toMatch(/60% Z3/) // 1800 / 3000 = 60%
  })

  it('includes athlete notes when present', async () => {
    const noteDay = day({
      actual: actual({
        notes: 'Legs felt fresh, went a bit hot on the descent.',
      }),
    })
    const w: TrainingWeek = { num: 1, dates: '2026-05-01 - 2026-05-07', miles: 25, focus: 'Base', days: [noteDay] }
    const blob = generateAthletePdf({
      athleteName: 'Test',
      race: race(),
      weeks: [w],
      performance: performance(7),
      windowWeeks: 4,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    const text = await pdfText(blob)
    expect(text).toMatch(/Legs felt fresh/i)
  })

  it('summarises strength exercises with reps and weight', async () => {
    const strengthDay = day({
      dayLabel: 'Wed',
      type: 'strength' as WorkoutType,
      workout: 'Lower body',
      zone: '—',
      time: '50 min',
      actual: actual({
        name: 'Lower body strength',
        type: 'strength_lower',
        distance: 0,
        elevationGain: 0,
        movingTime: 3000,
        strengthLog: [
          {
            name: 'Back Squat',
            focus: 'lower',
            sets: [
              { reps: 8, weight: '135 lb' },
              { reps: 8, weight: '135 lb' },
              { reps: 8, weight: '135 lb' },
            ],
          },
          {
            name: 'Romanian Deadlift',
            focus: 'lower',
            sets: [
              { reps: 10, weight: '95 lb' },
              { reps: 10, weight: '95 lb' },
              { reps: 10, weight: '95 lb' },
            ],
          },
        ],
      }),
    })
    const w: TrainingWeek = { num: 1, dates: '2026-05-01 - 2026-05-07', miles: 0, focus: 'Strength', days: [strengthDay] }
    const blob = generateAthletePdf({
      athleteName: 'Test',
      race: race(),
      weeks: [w],
      performance: performance(7),
      windowWeeks: 4,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    const text = await pdfText(blob)
    expect(text).toMatch(/Back Squat/)
    expect(text).toMatch(/3.{0,2}8/) // "3×8" (× is encoded; allow any 0-2 chars)
    expect(text).toMatch(/135 lb/)
    expect(text).toMatch(/Romanian Deadlift/)
  })

  it('marks missed sessions clearly', async () => {
    const missed = day({ dayLabel: 'Tue', workout: 'Easy run', actual: undefined })
    const w: TrainingWeek = { num: 1, dates: '2026-05-01 - 2026-05-07', miles: 25, focus: 'Base', days: [missed] }
    const blob = generateAthletePdf({
      athleteName: 'Test',
      race: race(),
      weeks: [w],
      performance: performance(7),
      windowWeeks: 4,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    const text = await pdfText(blob)
    expect(text).toMatch(/Missed/i)
  })

  it('grows in size as workout detail grows', () => {
    const bareDay = day({ actual: actual({ distance: 5, movingTime: 2700, elevationGain: 200 }) })
    const richDay = day({
      detail: 'WU 1mi · 4×800m @ 5K + 90s jog · CD 1mi',
      actual: actual({
        distance: 6,
        movingTime: 3000,
        elevationGain: 480,
        avgHR: 162,
        maxHR: 178,
        rpe: 8,
        notes: 'Felt strong, hit every interval target.',
        aerobicTE: 4.1,
        epoc: 152,
        calories: 612,
        hrZoneSummary: [
          { zone: 2, seconds: 600 },
          { zone: 3, seconds: 1800 },
          { zone: 4, seconds: 600 },
        ],
      }),
    })
    const bareWeek: TrainingWeek = { num: 1, dates: '2026-05-01 - 2026-05-07', miles: 25, focus: 'Base', days: [bareDay] }
    const richWeek: TrainingWeek = { num: 1, dates: '2026-05-01 - 2026-05-07', miles: 25, focus: 'Base', days: [richDay] }
    const bare = generateAthletePdf({
      athleteName: 'Test', race: race(), weeks: [bareWeek], performance: performance(7), windowWeeks: 4, generatedAt: new Date('2026-05-14T12:00:00'),
    })
    const rich = generateAthletePdf({
      athleteName: 'Test', race: race(), weeks: [richWeek], performance: performance(7), windowWeeks: 4, generatedAt: new Date('2026-05-14T12:00:00'),
    })
    expect(rich.size).toBeGreaterThan(bare.size)
  })
})

describe('pdfFilename', () => {
  it('safely formats athlete names and dates', () => {
    expect(pdfFilename('Mike McBeebe', new Date('2026-05-14T12:00:00')))
      .toBe('broken-arrow-mike-mcbeebe-20260514.pdf')
  })

  it('falls back when name is empty', () => {
    expect(pdfFilename('', new Date('2026-05-14T12:00:00')))
      .toBe('broken-arrow-athlete-20260514.pdf')
  })

  it('strips weird characters out of names', () => {
    expect(pdfFilename('  Ru!nner / 1', new Date('2026-05-14T12:00:00')))
      .toBe('broken-arrow-ru-nner-1-20260514.pdf')
  })
})
