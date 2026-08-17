import type { RaceInfo } from '../types'
import type {
  Course,
  CourseSegment,
  ElevationPoint,
  RaceCategory,
  SegmentType,
  SurfaceType,
} from '../types/course'
import type { GpxPoint } from '../data/gpx'

/**
 * Generic course synthesis — the revival of the parked TODO in
 * resolveCourse.ts. Two tiers:
 *
 *  - synthesizeCourseFromGpx: a real Course built from an athlete-uploaded
 *    GPX trace — cumulative haversine distance, smoothed gain/loss,
 *    downsampled elevation profile (with lat/lon, so the 3D preview works),
 *    and grade-classified segments. Segments carry real avgAltitudeFt, so
 *    race pacing's altitude factor is honest too.
 *
 *  - estimatedCourseFromRace: a data-free stub from RaceInfo alone
 *    (distance + total vert). Profile and segments stay EMPTY on purpose —
 *    every course-aware engine (race pacing, workout↔segment matching, the
 *    3D preview) already guards on empty segments/profile, so the stub
 *    lights up the "Your Race" card without fabricating terrain the athlete
 *    never told us about. Uploading a GPX upgrades it to the real thing.
 */

const FT_PER_M = 3.28084
const EARTH_RADIUS_MI = 3958.8

/** Ignore elevation wobble below this before counting gain/loss — GPS
 *  elevation noise otherwise inflates vert dramatically. */
const HYSTERESIS_FT = 10
/** Micro-chunk length for grade classification. */
const CHUNK_MI = 0.25
/** Segments shorter than this get absorbed into a neighbor. */
const MIN_SEGMENT_MI = 0.3
/** Grade thresholds: at/above = climb, at/below negative = descent. */
const CLIMB_GRADE_PCT = 3
/** A "flat" stretch with this much gross vert per mile is really rolling. */
const ROLLING_GROSS_FT_PER_MI = 150
/** Max points kept in the rendered elevation profile. */
const MAX_PROFILE_POINTS = 120

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineMi(a: GpxPoint, b: GpxPoint): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Centered moving average over a 5-point window. */
function smooth(values: number[]): number[] {
  const half = 2
  return values.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(values.length - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += values[j]
    return sum / (hi - lo + 1)
  })
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'race'
}

function yearFromDate(date: string | undefined): number {
  const y = parseInt((date ?? '').slice(0, 4), 10)
  return Number.isFinite(y) && y > 1990 ? y : new Date().getFullYear()
}

function categoryForRace(race: RaceInfo): RaceCategory {
  if (race.format === 'road') return 'road'
  if (race.format === 'trail') return 'trail'
  return 'general'
}

function surfacesForCategory(category: RaceCategory): SurfaceType[] {
  if (category === 'trail') return ['singletrack']
  if (category === 'road') return ['pavement']
  return ['gravel']
}

function technicalityForCategory(category: RaceCategory): 1 | 2 | 3 {
  if (category === 'trail') return 3
  if (category === 'road') return 1
  return 2
}

interface Chunk {
  startMile: number
  endMile: number
  netFt: number
  grossFt: number
  avgAltitudeFt: number
  gradePct: number
}

type ChunkClass = SegmentType

function classifyChunk(c: Chunk): ChunkClass {
  if (c.gradePct >= CLIMB_GRADE_PCT) return 'climb'
  if (c.gradePct <= -CLIMB_GRADE_PCT) return 'descent'
  return 'flat'
}

interface RawSegment {
  type: ChunkClass
  chunks: Chunk[]
}

function segmentLengthMi(s: RawSegment): number {
  return s.chunks[s.chunks.length - 1].endMile - s.chunks[0].startMile
}

/** Merge adjacent same-type raw segments in place-order. */
function mergeAdjacent(segments: RawSegment[]): RawSegment[] {
  const out: RawSegment[] = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    if (prev && prev.type === seg.type) prev.chunks.push(...seg.chunks)
    else out.push({ type: seg.type, chunks: [...seg.chunks] })
  }
  return out
}

/**
 * Build a real Course from an uploaded GPX trace. Returns null when the
 * trace is too short/degenerate to describe a race course.
 */
export function synthesizeCourseFromGpx(race: RaceInfo, points: GpxPoint[]): Course | null {
  if (!race.name || points.length < 2) return null

  // Cumulative distance and smoothed elevations (feet).
  const miles: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    miles.push(miles[i - 1] + haversineMi(points[i - 1], points[i]))
  }
  const totalMi = miles[miles.length - 1]
  if (totalMi < 0.5) return null

  const elevationsFt = smooth(points.map(p => p.elevationM * FT_PER_M))

  // Gain/loss with hysteresis: only commit moves larger than the noise floor.
  let gainFt = 0
  let lossFt = 0
  let committed = elevationsFt[0]
  for (const e of elevationsFt) {
    const delta = e - committed
    if (delta >= HYSTERESIS_FT) {
      gainFt += delta
      committed = e
    } else if (delta <= -HYSTERESIS_FT) {
      lossFt += -delta
      committed = e
    }
  }

  // Downsampled elevation profile, lat/lon preserved for the 3D preview.
  const step = Math.max(1, Math.floor(points.length / MAX_PROFILE_POINTS))
  const elevationProfile: ElevationPoint[] = []
  for (let i = 0; i < points.length; i += step) {
    elevationProfile.push({
      mile: Math.round(miles[i] * 100) / 100,
      elevationFt: Math.round(elevationsFt[i]),
      latitude: points[i].latitude,
      longitude: points[i].longitude,
    })
  }
  const lastIdx = points.length - 1
  if (elevationProfile[elevationProfile.length - 1].mile !== Math.round(miles[lastIdx] * 100) / 100) {
    elevationProfile.push({
      mile: Math.round(miles[lastIdx] * 100) / 100,
      elevationFt: Math.round(elevationsFt[lastIdx]),
      latitude: points[lastIdx].latitude,
      longitude: points[lastIdx].longitude,
    })
  }

  // Micro-chunks (~0.25 mi) with per-chunk grade, then grade-classified
  // segments merged from them.
  const chunks: Chunk[] = []
  let chunkStart = 0
  for (let i = 1; i < points.length; i++) {
    const isLast = i === points.length - 1
    if (miles[i] - miles[chunkStart] < CHUNK_MI && !isLast) continue
    const lengthMi = miles[i] - miles[chunkStart]
    if (lengthMi <= 0) continue
    const netFt = elevationsFt[i] - elevationsFt[chunkStart]
    let grossFt = 0
    let altSum = 0
    for (let j = chunkStart + 1; j <= i; j++) {
      grossFt += Math.abs(elevationsFt[j] - elevationsFt[j - 1])
      altSum += elevationsFt[j]
    }
    chunks.push({
      startMile: miles[chunkStart],
      endMile: miles[i],
      netFt,
      grossFt,
      avgAltitudeFt: altSum / (i - chunkStart),
      gradePct: (netFt / (lengthMi * 5280)) * 100,
    })
    chunkStart = i
  }
  if (chunks.length === 0) return null

  let raw = mergeAdjacent(chunks.map(c => ({ type: classifyChunk(c), chunks: [c] })))
  // Absorb sub-threshold slivers into their larger neighbor until stable.
  let absorbed = true
  while (absorbed && raw.length > 1) {
    absorbed = false
    for (let i = 0; i < raw.length; i++) {
      if (segmentLengthMi(raw[i]) >= MIN_SEGMENT_MI) continue
      const prev = raw[i - 1]
      const next = raw[i + 1]
      const target = !prev ? next : !next ? prev : segmentLengthMi(prev) >= segmentLengthMi(next) ? prev : next
      if (!target) break
      target.chunks = target === prev ? [...prev.chunks, ...raw[i].chunks] : [...raw[i].chunks, ...next!.chunks]
      raw.splice(i, 1)
      raw = mergeAdjacent(raw)
      absorbed = true
      break
    }
  }

  const category = categoryForRace(race)
  const surfaces = surfacesForCategory(category)
  const technicality = technicalityForCategory(category)
  const year = yearFromDate(race.date)
  const slug = slugify(race.name)
  const familyId = `user-gpx-${slug}`
  const courseId = `${familyId}-${year}`

  const counters: Record<SegmentType, number> = { climb: 0, descent: 0, flat: 0, rolling: 0 }
  const NAMES: Record<SegmentType, string> = { climb: 'Climb', descent: 'Descent', flat: 'Flat', rolling: 'Rolling' }
  const segments: CourseSegment[] = raw.map((seg, idx) => {
    const startMile = seg.chunks[0].startMile
    const endMile = seg.chunks[seg.chunks.length - 1].endMile
    const lengthMi = endMile - startMile
    const netFt = seg.chunks.reduce((s, c) => s + c.netFt, 0)
    const grossFt = seg.chunks.reduce((s, c) => s + c.grossFt, 0)
    // A low-net stretch that still climbs+drops a lot is rolling, not flat.
    const type: SegmentType =
      seg.type === 'flat' && grossFt / Math.max(lengthMi, 0.01) >= ROLLING_GROSS_FT_PER_MI
        ? 'rolling'
        : seg.type
    counters[type] += 1
    const gradeExtreme = seg.chunks.reduce(
      (m, c) => (Math.abs(c.gradePct) > Math.abs(m) ? c.gradePct : m),
      0,
    )
    return {
      id: `${courseId}:seg-${idx + 1}`,
      name: `${NAMES[type]} ${counters[type]}`,
      type,
      startMile: Math.round(startMile * 100) / 100,
      endMile: Math.round(endMile * 100) / 100,
      lengthMi: Math.round(lengthMi * 100) / 100,
      avgGradePct: Math.round((netFt / (lengthMi * 5280)) * 1000) / 10,
      peakGradePct: type === 'climb' || type === 'descent' ? Math.round(gradeExtreme * 10) / 10 : undefined,
      netVerticalFt: Math.round(netFt),
      surfaces,
      avgAltitudeFt: Math.round(seg.chunks.reduce((s, c) => s + c.avgAltitudeFt * (c.endMile - c.startMile), 0) / Math.max(lengthMi, 0.01)),
      technicality,
    }
  })

  const startAltitudeFt = Math.round(elevationsFt[0])
  const peakAltitudeFt = Math.round(Math.max(...elevationsFt))
  const minAltitudeFt = Math.round(Math.min(...elevationsFt))

  return {
    id: courseId,
    familyId,
    name: race.name,
    year,
    category,
    distanceMi: Math.round(totalMi * 100) / 100,
    distanceKm: Math.round(totalMi * 1.60934 * 10) / 10,
    verticalGainFt: Math.round(gainFt),
    verticalLossFt: Math.round(lossFt),
    startAltitudeFt,
    peakAltitudeFt,
    minAltitudeFt,
    location: {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      label: '',
    },
    elevationProfile,
    segments,
    aidStations: [],
    summary: `Built from your GPX upload: ${Math.round(totalMi * 10) / 10} mi with ${Math.round(gainFt).toLocaleString()} ft of climbing across ${segments.length} segment${segments.length === 1 ? '' : 's'}.`,
    metadata: { tags: ['user_gpx'] },
  }
}

/**
 * Data-free estimated course from RaceInfo alone. Distance + total vert
 * only; profile/segments stay empty so nothing downstream fabricates
 * terrain. Returns null for Hyrox (indoor station race — a course card is
 * meaningless) and for races without a usable distance.
 */
export function estimatedCourseFromRace(race: RaceInfo): Course | null {
  if (!race.name || !(race.distanceMiles > 0)) return null
  if (race.format === 'hyrox' || /\bhyrox\b/i.test(race.name)) return null

  const category = categoryForRace(race)
  const year = yearFromDate(race.date)
  const slug = slugify(race.name)
  const familyId = `estimated-${slug}`
  const gainFt = Math.max(0, Math.round(race.elevationGainFt ?? 0))

  return {
    id: `${familyId}-${year}`,
    familyId,
    name: race.name,
    year,
    category,
    distanceMi: Math.round(race.distanceMiles * 100) / 100,
    distanceKm: Math.round(race.distanceMiles * 1.60934 * 10) / 10,
    verticalGainFt: gainFt,
    // Loop assumption — what goes up comes down. Point-to-point courses
    // need a GPX to say otherwise.
    verticalLossFt: gainFt,
    startAltitudeFt: 0,
    peakAltitudeFt: 0,
    minAltitudeFt: 0,
    location: { latitude: 0, longitude: 0, label: '' },
    elevationProfile: [],
    segments: [],
    aidStations: [],
    summary: `Estimated from your race details: ${race.distanceMiles} mi${gainFt > 0 ? ` with ~${gainFt.toLocaleString()} ft of climbing` : ''}. Upload a GPX to unlock the elevation profile, segment breakdown, and course-aware race pacing.`,
    metadata: { tags: ['estimated'] },
  }
}
