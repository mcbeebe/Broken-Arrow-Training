import { describe, it, expect, beforeEach } from 'vitest'
import { resolveCourseForRace, hasCuratedCourse } from '../utils/resolveCourse'
import { saveUserCourse, getUserCourse, removeUserCourse } from '../utils/userCourses'
import { synthesizeCourseFromGpx } from '../utils/gpxCourse'
import type { GpxPoint } from '../data/gpx'
import type { RaceInfo } from '../types'

beforeEach(() => {
  localStorage.clear()
})

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

  it('matches Broken Arrow 46K by name + distance', () => {
    const res = resolveCourseForRace(race({
      name: 'Broken Arrow 46K',
      distance: '46K',
      distanceMiles: 28.6,
    }))
    expect(res?.course.familyId).toBe('broken-arrow-46k')
    expect(res?.course.name).toBe('Broken Arrow 46K')
  })

  it('disambiguates between 11K, 18K, and 46K by distance when all keyword-match', () => {
    const eighteen = resolveCourseForRace(race({ name: 'broken arrow', distanceMiles: 11.2 }))
    const eleven = resolveCourseForRace(race({ name: 'broken arrow', distanceMiles: 6.8 }))
    const fortySix = resolveCourseForRace(race({ name: 'broken arrow', distanceMiles: 28.6 }))
    expect(eighteen?.course.familyId).toBe('broken-arrow-18k')
    expect(eleven?.course.familyId).toBe('broken-arrow-11k')
    expect(fortySix?.course.familyId).toBe('broken-arrow-46k')
  })

  it('does NOT match a 46K to the 18K course (regression: distance gate)', () => {
    // Before the distance gate, "Broken Arrow 46K" (~28.6 mi) fell through to
    // the nearest seeded distance (18K) and the race card showed "Broken Arrow
    // 18K" with 18K stats. It must now resolve to the actual 46K course.
    const res = resolveCourseForRace(race({
      name: 'Broken Arrow 46K',
      distance: '46K',
      distanceMiles: 28.6,
    }))
    expect(res?.course.familyId).toBe('broken-arrow-46k')
    expect(res?.course.familyId).not.toBe('broken-arrow-18k')
  })

  it('rejects a curated keyword match when the distance is far from every seeded course', () => {
    // A "Broken Arrow" race at an unseeded distance (e.g. a hypothetical ~50 mi
    // ultra) must not borrow another distance's curated course. It now falls
    // through to the estimated stub under its OWN name and distance.
    const res = resolveCourseForRace(race({ name: 'Broken Arrow Ultra', distanceMiles: 50 }))
    expect(res?.source).toBe('estimated')
    expect(res?.course.name).toBe('Broken Arrow Ultra')
    expect(res?.course.distanceMi).toBe(50)
    expect(res?.course.familyId).not.toBe('broken-arrow-18k')
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

describe('resolveCourseForRace — generic synthesis fallback', () => {
  it('non-curated races resolve to an estimated stub (generic synthesis revived)', () => {
    const boston = resolveCourseForRace(race({ name: 'Boston Marathon', distanceMiles: 26.2, elevationGainFt: 800 }))
    expect(boston?.source).toBe('estimated')
    expect(boston?.isGeneric).toBe(true)
    expect(boston?.course.name).toBe('Boston Marathon')
    expect(boston?.course.verticalGainFt).toBe(800)
    expect(boston?.course.segments).toEqual([])
    expect(boston?.family.id).toBe(boston?.course.familyId)
  })

  it('curated match always wins over user/estimated courses', () => {
    const res = resolveCourseForRace(race({}))
    expect(res?.source).toBe('curated')
    expect(res?.isGeneric).toBe(false)
  })

  it('returns null when race is null or missing a name', () => {
    expect(resolveCourseForRace(null)).toBeNull()
    expect(resolveCourseForRace(undefined)).toBeNull()
    expect(resolveCourseForRace(race({ name: '' }))).toBeNull()
  })

  it('returns null for Hyrox races and races without a distance', () => {
    expect(resolveCourseForRace(race({ name: 'Hyrox Anaheim', format: 'hyrox' }))).toBeNull()
    expect(resolveCourseForRace(race({ name: 'Mystery Race', distanceMiles: 0 }))).toBeNull()
  })
})

describe('resolveCourseForRace — user GPX courses', () => {
  /** 4-mile synthetic trace: 2 mi up 1000 ft, 2 mi back down. */
  function trace(): GpxPoint[] {
    const step = 0.1 / 69.17
    const pts: GpxPoint[] = []
    for (let i = 0; i <= 40; i++) {
      const eleM = i <= 20 ? 1000 + i * 15.24 : 1000 + (40 - i) * 15.24
      pts.push({ latitude: 39 + i * step, longitude: -120, elevationM: eleM })
    }
    return pts
  }

  it('an uploaded GPX course beats the estimated stub', () => {
    const myRace = race({ name: 'Mount Tam Trail Race', distanceMiles: 4, elevationGainFt: 1000, format: 'trail' })
    const gpxCourse = synthesizeCourseFromGpx(myRace, trace())!
    expect(saveUserCourse(myRace, gpxCourse)).toBe(true)

    const res = resolveCourseForRace(myRace)
    expect(res?.source).toBe('gpx')
    expect(res?.isGeneric).toBe(true)
    expect(res?.course.segments.length).toBeGreaterThan(0)
    expect(res?.course.elevationProfile.length).toBeGreaterThan(0)

    // Registry round-trip and removal.
    expect(getUserCourse(myRace)?.id).toBe(gpxCourse.id)
    removeUserCourse(myRace)
    expect(getUserCourse(myRace)).toBeNull()
    expect(resolveCourseForRace(myRace)?.source).toBe('estimated')
  })

  it('a user course never shadows a curated race', () => {
    const curatedRace = race({})
    const gpxCourse = synthesizeCourseFromGpx(curatedRace, trace())!
    saveUserCourse(curatedRace, gpxCourse)
    expect(resolveCourseForRace(curatedRace)?.source).toBe('curated')
  })

  it('user-course keys are name-normalized (case/whitespace-insensitive)', () => {
    const a = race({ name: 'Mount Tam  Trail Race', distanceMiles: 4 })
    const b = race({ name: 'mount tam trail race', distanceMiles: 4 })
    const gpxCourse = synthesizeCourseFromGpx(a, trace())!
    saveUserCourse(a, gpxCourse)
    expect(getUserCourse(b)?.id).toBe(gpxCourse.id)
  })
})

describe('hasCuratedCourse', () => {
  it('is true for curated races, false otherwise', () => {
    expect(hasCuratedCourse(race({}))).toBe(true)
    expect(hasCuratedCourse(race({ name: 'Boston Marathon' }))).toBe(false)
    expect(hasCuratedCourse(null)).toBe(false)
  })
})
