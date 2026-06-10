import { describe, it, expect } from 'vitest'
import {
  buildTrainingFromPlannedDay,
  findBestCourseMatchForPlanned,
  formatLooksLikeLine,
} from '../utils/workoutCourseMatch'
import type { PlannedDay, RaceInfo } from '../types'

const BROKEN_ARROW_RACE: RaceInfo = {
  name: 'Broken Arrow 18K',
  date: '2026-06-20',
  startTime: '08:00',
  distance: '18K',
  distanceMiles: 11.2,
  elevation: '~4,800 ft gain',
  elevationRange: '6,200–8,475 ft',
  course: 'Squaw Valley → KT-22 → Stairway → Siberia → finish',
  cutoff: '5:00',
  landmarks: [],
  gear: [],
  nutrition: '',
}

function makeDay(overrides: Partial<PlannedDay>): PlannedDay {
  return {
    day: 'Tue',
    type: 'run',
    workout: 'Hill repeats',
    detail: '',
    zone: '',
    route: '',
    time: '',
    ...overrides,
  }
}

describe('buildTrainingFromPlannedDay', () => {
  it('returns null for rest days', () => {
    expect(buildTrainingFromPlannedDay(makeDay({ type: 'rest' }))).toBeNull()
  })

  it('returns null for strength days without distance', () => {
    expect(buildTrainingFromPlannedDay(makeDay({ type: 'strength' }))).toBeNull()
  })

  it('returns null when no distance is parseable', () => {
    expect(buildTrainingFromPlannedDay(makeDay({ zone: 'Z2', detail: 'easy' }))).toBeNull()
  })

  it('derives length and vertical from zone + detail', () => {
    const seg = buildTrainingFromPlannedDay(
      makeDay({
        type: 'long',
        zone: '4 mi Z2',
        detail: '~600 ft gain on trail',
      }),
    )
    expect(seg).not.toBeNull()
    expect(seg!.lengthMi).toBe(4)
    expect(seg!.netVerticalFt).toBe(600)
    // 600 / (4 * 5280) * 100 ≈ 2.84%
    expect(seg!.avgGradePct).toBeCloseTo(2.84, 1)
  })

  it('defaults vertical to 0 when detail has no elevation', () => {
    const seg = buildTrainingFromPlannedDay(makeDay({ zone: '5 mi Z2', detail: '' }))
    expect(seg).not.toBeNull()
    expect(seg!.netVerticalFt).toBe(0)
    expect(seg!.avgGradePct).toBe(0)
  })
})

describe('findBestCourseMatchForPlanned', () => {
  it('returns null when race is null', () => {
    expect(findBestCourseMatchForPlanned(makeDay({}), null)).toBeNull()
  })

  it('returns null when race has no curated course', () => {
    const noCourseRace = { ...BROKEN_ARROW_RACE, name: 'Mystery Trail Marathon' }
    expect(findBestCourseMatchForPlanned(makeDay({}), noCourseRace)).toBeNull()
  })

  it('matches a steep climby workout to a climb segment', () => {
    // 2 mi @ ~1200 ft gain ≈ KT-22 Climb profile
    const day = makeDay({
      type: 'quality',
      zone: '2 mi Z3',
      detail: '~1,200 ft gain — hill repeats',
    })
    const match = findBestCourseMatchForPlanned(day, BROKEN_ARROW_RACE)
    expect(match).not.toBeNull()
    expect(match!.segment.type).toBe('climb')
    expect(match!.score).toBeGreaterThan(0.65)
  })

  it('returns null when no segment scores above the quality threshold', () => {
    // 0.3-mile session with no vert — too short to meaningfully match any
    // real course segment (course has 1+ mile segments minimum).
    const day = makeDay({ zone: '0.3 mi Z1', detail: '' })
    const match = findBestCourseMatchForPlanned(day, BROKEN_ARROW_RACE)
    expect(match).toBeNull()
  })
})

describe('formatLooksLikeLine', () => {
  it('returns null when match is null', () => {
    expect(formatLooksLikeLine(null)).toBeNull()
  })

  it('renders segment name with mile range', () => {
    const day = makeDay({
      type: 'quality',
      zone: '2 mi Z3',
      detail: '~1,200 ft gain — hill repeats',
    })
    const match = findBestCourseMatchForPlanned(day, BROKEN_ARROW_RACE)
    const line = formatLooksLikeLine(match)
    expect(line).not.toBeNull()
    expect(line).toContain('KT-22 Climb')
    expect(line).toMatch(/miles \d/)
    expect(line).toContain('on race day')
  })

  it('defaults the subject label to "Today\'s"', () => {
    const day = makeDay({ type: 'quality', zone: '2 mi Z3', detail: '~1,200 ft gain — hill repeats' })
    const match = findBestCourseMatchForPlanned(day, BROKEN_ARROW_RACE)
    expect(formatLooksLikeLine(match)).toContain("Today's workout is like")
  })

  it('honors a custom subject label (used by the tomorrow preview)', () => {
    const day = makeDay({ type: 'quality', zone: '2 mi Z3', detail: '~1,200 ft gain — hill repeats' })
    const match = findBestCourseMatchForPlanned(day, BROKEN_ARROW_RACE)
    const line = formatLooksLikeLine(match, "Tomorrow's")
    expect(line).toContain("Tomorrow's workout is like")
    expect(line).not.toContain("Today's")
  })
})
