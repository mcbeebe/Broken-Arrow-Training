/**
 * Course library — the data foundation for Tier-1 differentiators:
 *  - "Your training matches X% of the Broken Arrow climb"
 *  - "Course-segment PRs" (replacing generic 5K/10K PRs)
 *  - "Last year vs this year on the same race"
 *  - Race-week aid station / cutoff briefs
 *
 * A Course is a *specific edition of a race in a specific year*. Year-over-year
 * comparisons aggregate Courses by CourseFamily.familyId, so a re-routed
 * 2027 edition doesn't pollute 2026 splits.
 *
 * Optional fields are tolerated everywhere so partial seeds (just a polyline,
 * no aid stations yet) still register and render.
 */

/** Surface a runner is moving over. Drives training-match similarity and
 *  race-week gear suggestions. */
export type SurfaceType =
  | 'pavement'
  | 'gravel'
  | 'fire_road'
  | 'singletrack'
  | 'technical_trail'
  | 'rocky_scramble'
  | 'snow'
  | 'sand'
  | 'stairs'

export type SegmentType = 'climb' | 'descent' | 'flat' | 'rolling'

/** Course classification. Drives default training defaults (zone splits,
 *  descent emphasis) and the type of seed data we curate. "general" is the
 *  fallback for distances without a registered course. */
export type RaceCategory = 'road' | 'trail' | 'ultra' | 'skyrace' | 'general'

export type AidService =
  | 'water'
  | 'electrolyte'
  | 'food'
  | 'gels'
  | 'crew_access'
  | 'medical'
  | 'drop_bag'
  | 'restroom'

export interface ElevationPoint {
  /** Mile from course start. */
  mile: number
  /** Elevation in feet. */
  elevationFt: number
  /** Optional waypoint label — "Washeshu Peak", "Julia's Aid". */
  label?: string
  /** Optional geographic position. When present on every point, the profile
   *  doubles as a route polyline the 3D renderer can extrude over terrain. */
  latitude?: number
  longitude?: number
}

/** Versioned heightmap asset for the 3D course renderer. Authored offline
 *  by `npm run fetch:terrain` from USGS 3DEP / SRTM tiles; lives in
 *  `src/data/terrain/<courseId>.json`. Schema is stable so the renderer
 *  can consume any future course's terrain without code changes. */
export interface TerrainHeightmap {
  /** Schema version. Bump on breaking changes; renderer guards against
   *  mismatched versions rather than silently rendering garbage. */
  version: 1
  /** Course id this heightmap belongs to. */
  courseId: string
  /** Geographic bounds of the grid, WGS84. */
  bounds: {
    minLatitude: number
    maxLatitude: number
    minLongitude: number
    maxLongitude: number
  }
  /** Grid width (columns / longitude steps). */
  width: number
  /** Grid height (rows / latitude steps). */
  height: number
  /** Row-major elevation samples in feet. Length must equal width * height.
   *  Stored flat (not 2D) so the renderer can upload it to a Float32 buffer
   *  without an extra copy. */
  elevationsFt: number[]
  /** Minimum / maximum elevation in the grid in feet — convenience for the
   *  renderer's color ramp without a second pass over the samples. */
  minElevationFt: number
  maxElevationFt: number
  /** Provenance — which dataset, when fetched. Keeps the seed honest. */
  source: {
    /** "USGS 3DEP" | "SRTM 30m" | "OpenTopoData srtm30m" | etc. */
    dataset: string
    /** ISO-8601 timestamp the fetch script ran. */
    fetchedAt: string
    /** Sampling resolution in meters between adjacent grid cells. */
    resolutionMeters: number
  }
}

export interface CourseSegment {
  /** Stable id — "broken-arrow-18k-2026:kt22-climb". Used for course-segment
   *  PRs so a re-routed climb in 2027 gets a new id without losing the 2026
   *  baseline. */
  id: string
  /** Display name a runner would say out loud — "KT-22 Climb". */
  name: string
  type: SegmentType
  startMile: number
  endMile: number
  /** Cached for convenience — equal to endMile - startMile. */
  lengthMi: number
  /** Mean grade across the segment as a percentage. Positive = climb,
   *  negative = descent. Reported with one decimal, signed. */
  avgGradePct: number
  /** Steepest sustained grade. Sustained 20% feels very different from
   *  18% with spikes — both inform training analog selection. */
  peakGradePct?: number
  /** Net vertical change in feet. Positive = gain (climbs), negative = loss
   *  (descents). For rolling segments use net; gross gain/loss can live in
   *  metadata if needed later. */
  netVerticalFt: number
  /** Surfaces encountered, ordered by dominance. At minimum length 1. */
  surfaces: SurfaceType[]
  /** Mean altitude in feet — drives "altitude weeks needed" surfacing. */
  avgAltitudeFt: number
  /** 1 (groomed road) to 5 (technical scramble). Mechanical-demand proxy
   *  in the spirit of Vernillo 2017 for descent eccentric load. */
  technicality: 1 | 2 | 3 | 4 | 5
  /** Runner-spoken description of what training mimics this segment:
   *  "8×400 hill repeats at 12% grade". Used as the seed for "your hill
   *  repeats Tuesday hit the same grade as Squaw Peak mile 4." */
  trainingAnalog?: string
  /** Race-day notes — pacing band, gear cue, common mistakes. */
  notes?: string
}

export interface AidStation {
  /** Stable id — "broken-arrow-18k-2026:siberia". */
  id: string
  /** Display name. */
  name: string
  /** Mile from start. */
  mile: number
  /** Approximate altitude in feet at the aid station — useful when the
   *  aid sits at a peak or saddle. */
  altitudeFt?: number
  /** Services available. */
  services: AidService[]
  /** Cutoff time relative to race start in ISO-8601 duration form
   *  (e.g. "PT4H30M"). Omit when no cutoff is enforced. */
  cutoff?: string
  /** Whether crew can meet the runner here. Surfaced separately because
   *  "is my crew waiting" is a different question than "what's on the
   *  table". */
  crewAccess?: boolean
  notes?: string
}

export interface CourseLocation {
  latitude: number
  longitude: number
  /** Human-readable name — "Palisades Tahoe, CA". */
  label: string
}

export interface CourseMetadata {
  /** Overall cutoff as ISO-8601 duration. */
  overallCutoff?: string
  /** Mandatory or strongly recommended gear list. */
  mandatoryGear?: string[]
  /** Course records by gender, free-form ("3:42:18"). */
  courseRecords?: { mens?: string; womens?: string }
  /** Official race-page URL. */
  officialUrl?: string
  /** URL to a downloadable GPX or KML. */
  gpxUrl?: string
  /** Free-form tags — "altitude", "technical_descent", "exposed_ridge". */
  tags?: string[]
}

export interface Course {
  /** Year-scoped unique id. */
  id: string
  /** Year-agnostic family id. Multiple Courses (one per year) share this. */
  familyId: string
  /** Display name — "Broken Arrow 18K". */
  name: string
  /** Calendar year this edition runs. */
  year: number
  category: RaceCategory
  /** Canonical distance in miles. */
  distanceMi: number
  /** Distance in km for runners who think in km (most trail/sky). */
  distanceKm: number
  /** Total vertical gain over the full course in feet. */
  verticalGainFt: number
  /** Total vertical loss. Equal to gain for loops; differs for point-to-point. */
  verticalLossFt: number
  startAltitudeFt: number
  peakAltitudeFt: number
  minAltitudeFt: number
  location: CourseLocation
  /** Mile-by-mile elevation profile. The seed for area charts and the
   *  source-of-truth for derived segment grades. */
  elevationProfile: ElevationPoint[]
  /** Named segments in order of occurrence along the course. */
  segments: CourseSegment[]
  /** Aid stations in order of occurrence. */
  aidStations: AidStation[]
  /** One-paragraph plain-English course summary. Customer language. */
  summary: string
  /** Extensible bucket for race-ops fields. */
  metadata?: CourseMetadata
  /** Optional flag — true when this course has a terrain heightmap
   *  registered in `src/data/terrain/`. The renderer uses
   *  `hasTerrainAsset(courseId)` to do the actual lookup; this field exists
   *  for seeds that want to assert the asset is required and fail loudly
   *  if it ever goes missing. */
  hasTerrain?: boolean
}

/** Year-agnostic anchor for a series of Courses. The thing year-over-year
 *  comparisons aggregate against. */
export interface CourseFamily {
  /** Family slug — "broken-arrow-18k". */
  id: string
  /** Display name. */
  name: string
  category: RaceCategory
  /** Default distance for "what most users mean by this race". */
  defaultDistanceMi: number
  /** Editions known to the library, ordered most-recent first. */
  editions: Course[]
}

/** Lookup result shape used by the registry helpers. */
export interface CourseLookup {
  family: CourseFamily
  course: Course
}
