import { describe, it, expect } from 'vitest'
import { synthesizeCourseFromGpx, estimatedCourseFromRace } from '../utils/gpxCourse'
import { parseGpx, type GpxPoint } from '../data/gpx'
import type { RaceInfo } from '../types'

function race(overrides: Partial<RaceInfo> = {}): RaceInfo {
  return {
    name: 'Mount Diablo Trail Half',
    date: '2026-10-24',
    startTime: '08:00',
    distance: 'Half',
    distanceMiles: 13.1,
    elevation: '2,500 ft',
    elevationRange: '',
    course: '',
    cutoff: '',
    landmarks: [],
    gear: [],
    nutrition: '',
    format: 'trail',
    ...overrides,
  }
}

/** ~0.1 mi of latitude. 1° latitude ≈ 69.17 mi. */
const LAT_STEP = 0.1 / 69.17

/** Synthetic 4-mile trace: 2 mi climbing +1000 ft, then 2 mi descending
 *  back — a clean out-and-over at ~9.5% grade each way. */
function climbDescendTrace(): GpxPoint[] {
  const points: GpxPoint[] = []
  const baseEleM = 2000
  const stepEleM = 304.8 / 20 // +1000 ft over 20 steps
  for (let i = 0; i <= 40; i++) {
    const eleM = i <= 20 ? baseEleM + i * stepEleM : baseEleM + (40 - i) * stepEleM
    points.push({ latitude: 39 + i * LAT_STEP, longitude: -120, elevationM: eleM })
  }
  return points
}

describe('synthesizeCourseFromGpx — real course from a trace', () => {
  const course = synthesizeCourseFromGpx(race(), climbDescendTrace())!

  it('builds a course at the trace distance with honest gain/loss', () => {
    expect(course).not.toBeNull()
    expect(course.distanceMi).toBeGreaterThan(3.8)
    expect(course.distanceMi).toBeLessThan(4.2)
    // Smoothing shaves a little off the apex; the total must stay close.
    expect(course.verticalGainFt).toBeGreaterThan(880)
    expect(course.verticalGainFt).toBeLessThan(1060)
    expect(Math.abs(course.verticalGainFt - course.verticalLossFt)).toBeLessThan(60)
  })

  it('classifies the climb and the descent as separate segments', () => {
    expect(course.segments.length).toBe(2)
    const [up, down] = course.segments
    expect(up.type).toBe('climb')
    expect(down.type).toBe('descent')
    expect(up.avgGradePct).toBeGreaterThan(8)
    expect(up.avgGradePct).toBeLessThan(11)
    // The near-flat apex chunk gets absorbed into one side, diluting its
    // average slightly — the classification is what matters.
    expect(down.avgGradePct).toBeLessThan(-6.5)
    expect(down.avgGradePct).toBeGreaterThan(-11)
    expect(up.endMile).toBeGreaterThan(1.6)
    expect(up.endMile).toBeLessThan(2.4)
    // Segment names read like a human wrote them.
    expect(up.name).toBe('Climb 1')
    expect(down.name).toBe('Descent 1')
    // Real average altitude, so race pacing's altitude factor is honest.
    expect(up.avgAltitudeFt).toBeGreaterThan(6500)
  })

  it('keeps lat/lon on the elevation profile so the 3D preview works', () => {
    expect(course.elevationProfile.length).toBeGreaterThanOrEqual(2)
    expect(course.elevationProfile[0].mile).toBe(0)
    expect(course.elevationProfile.every(p => p.latitude != null && p.longitude != null)).toBe(true)
    const last = course.elevationProfile[course.elevationProfile.length - 1]
    expect(Math.abs(last.mile - course.distanceMi)).toBeLessThan(0.05)
  })

  it('derives altitude stats and category from the race', () => {
    // Start at 2000 m ≈ 6,562 ft; peak ≈ +1000 ft above it.
    expect(course.startAltitudeFt).toBeGreaterThan(6500)
    expect(course.peakAltitudeFt).toBeGreaterThan(7400)
    expect(course.category).toBe('trail')
    expect(course.segments[0].technicality).toBe(3)
    expect(course.segments[0].surfaces).toEqual(['singletrack'])
    expect(course.familyId).toBe('user-gpx-mount-diablo-trail-half')
    expect(course.year).toBe(2026)
    expect(course.metadata?.tags).toContain('user_gpx')
  })

  it('a flat trace produces one flat segment and ~zero vert', () => {
    const flat: GpxPoint[] = []
    for (let i = 0; i <= 30; i++) {
      flat.push({ latitude: 39 + i * LAT_STEP, longitude: -120, elevationM: 100 })
    }
    const c = synthesizeCourseFromGpx(race({ name: 'Flat 5K', format: 'road', distanceMiles: 3.1 }), flat)!
    expect(c.segments.length).toBe(1)
    expect(c.segments[0].type).toBe('flat')
    expect(c.verticalGainFt).toBe(0)
    expect(c.category).toBe('road')
    expect(c.segments[0].technicality).toBe(1)
  })

  it('rejects degenerate traces', () => {
    expect(synthesizeCourseFromGpx(race(), [])).toBeNull()
    expect(synthesizeCourseFromGpx(race(), climbDescendTrace().slice(0, 1))).toBeNull()
    // Two points a few feet apart — under the 0.5 mi floor.
    expect(
      synthesizeCourseFromGpx(race(), [
        { latitude: 39, longitude: -120, elevationM: 100 },
        { latitude: 39.00001, longitude: -120, elevationM: 100 },
      ]),
    ).toBeNull()
  })

  it('round-trips through parseGpx (upload path)', () => {
    const pts = climbDescendTrace()
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg>${pts
      .map(p => `<trkpt lat="${p.latitude}" lon="${p.longitude}"><ele>${p.elevationM}</ele></trkpt>`)
      .join('')}</trkseg></trk></gpx>`
    const parsed = parseGpx(xml)
    expect(parsed.length).toBe(pts.length)
    const c = synthesizeCourseFromGpx(race(), parsed)!
    expect(c.segments.map(s => s.type)).toEqual(['climb', 'descent'])
  })
})

describe('estimatedCourseFromRace — data-free stub', () => {
  it('carries distance and vert but fabricates NO terrain', () => {
    const c = estimatedCourseFromRace(race({ name: 'Boston Marathon', distanceMiles: 26.2, elevationGainFt: 800, format: 'road' }))!
    expect(c).not.toBeNull()
    expect(c.distanceMi).toBe(26.2)
    expect(c.verticalGainFt).toBe(800)
    expect(c.verticalLossFt).toBe(800)
    expect(c.segments).toEqual([])
    expect(c.elevationProfile).toEqual([])
    expect(c.aidStations).toEqual([])
    expect(c.category).toBe('road')
    expect(c.metadata?.tags).toContain('estimated')
    expect(c.summary).toContain('Upload a GPX')
  })

  it('returns null for Hyrox events and unusable races', () => {
    expect(estimatedCourseFromRace(race({ format: 'hyrox' }))).toBeNull()
    expect(estimatedCourseFromRace(race({ name: 'HYROX Anaheim Open', format: undefined }))).toBeNull()
    expect(estimatedCourseFromRace(race({ distanceMiles: 0 }))).toBeNull()
    expect(estimatedCourseFromRace(race({ name: '' }))).toBeNull()
  })

  it('treats missing vert as unknown (0), not invented', () => {
    const c = estimatedCourseFromRace(race({ elevationGainFt: undefined }))!
    expect(c.verticalGainFt).toBe(0)
  })
})
