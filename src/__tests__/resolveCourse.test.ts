import { describe, it, expect } from 'vitest'
import { resolveCourseForRace, hasCuratedCourse } from '../utils/resolveCourse'
import type { RaceInfo } from '../types'

function race(overrides: Partial<RaceInfo>): RaceInfo {
  return {
    name: 'Broken Arrow 18K',
    date: '2026-06-21',
    startTime: '08:00',
    distance: '18K',
    distanceMiles: 11.2,
    elevation: '3,850 ft',
    elevationRange: '6,200–9,000 ft',
    course: 'Palisades Tahoe',
    cutoff: '6h',
    landmarks: [],
    gear: [],
    nutrition: '',
    ...overrides,
  }
}

describe('resolveCourseForRace — curated matching', () => {
  it('matches Broken Arrow 18K by name + distance', () => {
    const res = resolveCourseForRace(race({}))
    expect(res).not.toBeNull()
    expect(res!.isGeneric).toBe(false)
    expect(res!.course.familyId).toBe('broken-arrow-18k')
    expect(res!.family.id).toBe('broken-arrow-18k')
  })

  it('matches Broken Arrow 11K by name + distance', () => {
    const res = resolveCourseForRace(race({
      name: 'Broken Arrow 11K',
      distance: '11K',
      distanceMiles: 6.8,
    }))
    expect(res?.course.familyId).toBe('broken-arrow-11k')
  })

  it('disambiguates between 11K and 18K by distance when both keyword-match', () => {
    const eighteen = resolveCourseForRace(race({ name: 'broken arrow', distanceMiles: 11.2 }))
    const eleven = resolveCourseForRace(race({ name: 'broken arrow', distanceMiles: 6.8 }))
    expect(eighteen?.course.familyId).toBe('broken-arrow-18k')
    expect(eleven?.course.familyId).toBe('broken-arrow-11k')
  })

  it('returns the year edition matching the race date', () => {
    const res = resolveCourseForRace(race({ date: '2026-06-21' }))
    expect(res?.course.year).toBe(2026)
  })

  it('falls back to the latest edition when the year edition is missing', () => {
    const res = resolveCourseForRace(race({ date: '2099-06-21' }))
    expect(res?.course.year).toBe(2026) // newest known year
  })
})

describe('resolveCourseForRace — non-matching', () => {
  it('returns null for races outside the curated catalog (parked: generic synthesis)', () => {
    expect(resolveCourseForRace(race({ name: 'Boston Marathon', distanceMiles: 26.2 }))).toBeNull()
    expect(resolveCourseForRace(race({ name: 'Local 5K', distanceMiles: 3.1, elevation: '50 ft' }))).toBeNull()
  })

  it('returns null when race is null or missing a name', () => {
    expect(resolveCourseForRace(null)).toBeNull()
    expect(resolveCourseForRace(undefined)).toBeNull()
    expect(resolveCourseForRace(race({ name: '' }))).toBeNull()
  })
})

describe('hasCuratedCourse', () => {
  it('is true for curated races, false otherwise', () => {
    expect(hasCuratedCourse(race({}))).toBe(true)
    expect(hasCuratedCourse(race({ name: 'Boston Marathon' }))).toBe(false)
    expect(hasCuratedCourse(null)).toBe(false)
  })
})
