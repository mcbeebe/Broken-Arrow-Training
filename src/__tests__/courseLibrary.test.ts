import { describe, it, expect } from 'vitest'
import {
  COURSE_FAMILIES,
  brokenArrow11k2026,
  brokenArrow18k2026,
  brokenArrow46k2026,
  getCourseById,
  getCourseFamily,
  getEditionForYear,
  getLatestEdition,
  listAllCourses,
  listFamiliesByCategory,
} from '../data/courses'
import type { Course } from '../types/course'

function assertCourseShape(c: Course) {
  // Identity
  expect(c.id).toMatch(/^[a-z0-9-]+$/)
  expect(c.familyId).toMatch(/^[a-z0-9-]+$/)
  expect(c.year).toBeGreaterThanOrEqual(2024)
  expect(c.name).toBeTruthy()

  // Distance + altitude
  expect(c.distanceMi).toBeGreaterThan(0)
  expect(c.distanceKm).toBeGreaterThan(0)
  expect(c.peakAltitudeFt).toBeGreaterThanOrEqual(c.startAltitudeFt)
  expect(c.peakAltitudeFt).toBeGreaterThanOrEqual(c.minAltitudeFt)
  expect(c.verticalGainFt).toBeGreaterThanOrEqual(0)
  expect(c.verticalLossFt).toBeGreaterThanOrEqual(0)

  // Location
  expect(c.location.latitude).toBeGreaterThan(-90)
  expect(c.location.latitude).toBeLessThan(90)
  expect(c.location.longitude).toBeGreaterThan(-180)
  expect(c.location.longitude).toBeLessThan(180)
  expect(c.location.label).toBeTruthy()

  // Elevation profile is monotone in mile + at least 2 points
  expect(c.elevationProfile.length).toBeGreaterThanOrEqual(2)
  for (let i = 1; i < c.elevationProfile.length; i++) {
    expect(c.elevationProfile[i].mile).toBeGreaterThan(c.elevationProfile[i - 1].mile)
  }
  // Profile spans 0 → ~distance
  expect(c.elevationProfile[0].mile).toBe(0)
  const lastMile = c.elevationProfile[c.elevationProfile.length - 1].mile
  expect(lastMile).toBeCloseTo(c.distanceMi, 1)

  // Segments are contiguous and ordered
  expect(c.segments.length).toBeGreaterThan(0)
  for (let i = 1; i < c.segments.length; i++) {
    expect(c.segments[i].startMile).toBeCloseTo(c.segments[i - 1].endMile, 2)
  }
  // First segment starts at 0, last ends near total distance
  expect(c.segments[0].startMile).toBe(0)
  expect(c.segments[c.segments.length - 1].endMile).toBeCloseTo(c.distanceMi, 1)

  // Each segment has surfaces and a valid technicality
  for (const seg of c.segments) {
    expect(seg.surfaces.length).toBeGreaterThan(0)
    expect(seg.technicality).toBeGreaterThanOrEqual(1)
    expect(seg.technicality).toBeLessThanOrEqual(5)
    expect(seg.lengthMi).toBeCloseTo(seg.endMile - seg.startMile, 2)
    // Sign convention: climb/flat have non-negative netVerticalFt, descent has non-positive
    if (seg.type === 'climb') expect(seg.netVerticalFt).toBeGreaterThanOrEqual(0)
    if (seg.type === 'descent') expect(seg.netVerticalFt).toBeLessThanOrEqual(0)
  }

  // Aid stations sit within course bounds
  for (const aid of c.aidStations) {
    expect(aid.mile).toBeGreaterThanOrEqual(0)
    expect(aid.mile).toBeLessThanOrEqual(c.distanceMi)
    expect(aid.services.length).toBeGreaterThan(0)
  }
}

describe('Course schema integrity', () => {
  it('Broken Arrow 18K (2026) passes shape checks', () => {
    assertCourseShape(brokenArrow18k2026)
  })

  it('Broken Arrow 11K (2026) passes shape checks', () => {
    assertCourseShape(brokenArrow11k2026)
  })

  it('Broken Arrow 46K (2026) passes shape checks', () => {
    assertCourseShape(brokenArrow46k2026)
  })

  it('all registered courses pass shape checks', () => {
    for (const course of listAllCourses()) {
      assertCourseShape(course)
    }
  })

  it('course ids are globally unique', () => {
    const ids = listAllCourses().map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('segment ids are unique within a course', () => {
    for (const course of listAllCourses()) {
      const segIds = course.segments.map(s => s.id)
      expect(new Set(segIds).size).toBe(segIds.length)
    }
  })
})

describe('Course registry lookups', () => {
  it('getCourseById returns family + course for a known id', () => {
    const hit = getCourseById('broken-arrow-18k-2026')
    expect(hit).not.toBeNull()
    expect(hit!.course.name).toBe('Broken Arrow 18K')
    expect(hit!.family.id).toBe('broken-arrow-18k')
  })

  it('getCourseById returns null for an unknown id', () => {
    expect(getCourseById('nonexistent-2099')).toBeNull()
  })

  it('getCourseFamily returns the family for a known slug', () => {
    const family = getCourseFamily('broken-arrow-11k')
    expect(family?.name).toBe('Broken Arrow 11K')
    expect(family?.category).toBe('trail')
  })

  it('getLatestEdition returns the most recent edition', () => {
    const latest = getLatestEdition('broken-arrow-18k')
    expect(latest?.year).toBe(2026)
  })

  it('getEditionForYear returns the exact edition or null', () => {
    expect(getEditionForYear('broken-arrow-18k', 2026)?.id).toBe('broken-arrow-18k-2026')
    expect(getEditionForYear('broken-arrow-18k', 2099)).toBeNull()
    expect(getEditionForYear('unknown', 2026)).toBeNull()
  })

  it('listFamiliesByCategory filters by category', () => {
    const sky = listFamiliesByCategory('skyrace')
    expect(sky.map(f => f.id)).toContain('broken-arrow-18k')
    const road = listFamiliesByCategory('road')
    expect(road).toEqual([])
  })

  it('every CourseFamily has at least one edition', () => {
    for (const family of COURSE_FAMILIES) {
      expect(family.editions.length).toBeGreaterThan(0)
    }
  })

  it('every edition references its family id consistently', () => {
    for (const family of COURSE_FAMILIES) {
      for (const course of family.editions) {
        expect(course.familyId).toBe(family.id)
      }
    }
  })
})
