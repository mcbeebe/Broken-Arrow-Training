// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { generateAthletePdf, pdfFilename } from '../utils/pdfExport'
import type { PerformanceMetrics, RaceInfo, TrainingWeek } from '../types'

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

function week(num: number, completedDays = 0): TrainingWeek {
  const days = []
  for (let i = 0; i < 6; i++) {
    days.push({
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      type: 'run' as const,
      workout: 'Easy run',
      zone: 'Z2',
      time: '45 min',
      ...(i < completedDays
        ? {
            actual: {
              stravaId: 1000 + i,
              source: 'strava' as const,
              name: 'Easy run',
              startDate: `2026-05-${String(i + 1).padStart(2, '0')}T08:00:00`,
              distance: 5.2,
              movingTime: 2700,
              elapsedTime: 2700,
              elevationGain: 200,
              type: 'run',
            },
          }
        : {}),
    })
  }
  return {
    num,
    dates: '2026-05-01 - 2026-05-07',
    miles: 25,
    focus: 'Base building',
    days,
  } as TrainingWeek
}

describe('generateAthletePdf', () => {
  it('produces a non-empty Blob', () => {
    const blob = generateAthletePdf({
      athleteName: 'Test Athlete',
      race: race(),
      weeks: [week(1, 3), week(2, 4), week(3, 2)],
      performance: performance(30),
      windowWeeks: 12,
      generatedAt: new Date('2026-05-14T12:00:00'),
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000) // a real PDF has at least a few kb of header + objects
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
