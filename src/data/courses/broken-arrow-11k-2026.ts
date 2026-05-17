import type { Course } from '../../types/course'

/**
 * Broken Arrow 11K — 2026 edition. Palisades Tahoe.
 *
 * Elevation profile and named features seeded from the existing hardcoded
 * data in src/components/RaceElevationProfile.tsx. Segment groupings,
 * surfaces, aid stations, and technicality scores are curated estimates;
 * verify against the official course brief before treating as authoritative.
 */

const COURSE_ID = 'broken-arrow-11k-2026'
const FAMILY_ID = 'broken-arrow-11k'

const brokenArrow11k2026: Course = {
  id: COURSE_ID,
  familyId: FAMILY_ID,
  name: 'Broken Arrow 11K',
  year: 2026,
  category: 'trail',
  distanceMi: 6.8,
  distanceKm: 11.0,
  verticalGainFt: 1800,
  verticalLossFt: 1800,
  startAltitudeFt: 6200,
  peakAltitudeFt: 8000,
  minAltitudeFt: 6200,
  location: {
    latitude: 39.1958,
    longitude: -120.2348,
    label: 'Palisades Tahoe, CA',
  },
  summary:
    "A vertical-K style sprint: climb hard for about 3 miles up to Siberia Ridge, then descend even harder back to the base. Shorter than the 18K, but the climb/descent ratio per mile is brutal. Approachable as a first skyrace, ruthless if you misjudge the descent.",
  elevationProfile: [
    { mile: 0.0, elevationFt: 6200, label: 'Start (Base Area)' },
    { mile: 0.5, elevationFt: 6400 },
    { mile: 1.0, elevationFt: 6650 },
    { mile: 1.5, elevationFt: 6950, label: 'Begin Stairway' },
    { mile: 2.0, elevationFt: 7300 },
    { mile: 2.5, elevationFt: 7650, label: 'Stairway to Heaven' },
    { mile: 3.0, elevationFt: 7900 },
    { mile: 3.3, elevationFt: 8000, label: 'Siberia Ridge (HIGH POINT)' },
    { mile: 3.5, elevationFt: 7950 },
    { mile: 4.0, elevationFt: 7750, label: 'Begin descent' },
    { mile: 4.5, elevationFt: 7400 },
    { mile: 5.0, elevationFt: 7000 },
    { mile: 5.5, elevationFt: 6700 },
    { mile: 6.0, elevationFt: 6450 },
    { mile: 6.8, elevationFt: 6200, label: 'Finish! Ring das bell!' },
  ],
  segments: [
    {
      id: `${COURSE_ID}:base-warmup`,
      name: 'Base Warm-up',
      type: 'climb',
      startMile: 0.0,
      endMile: 1.5,
      lengthMi: 1.5,
      avgGradePct: 8.4,
      peakGradePct: 10,
      netVerticalFt: 750,
      surfaces: ['fire_road', 'singletrack'],
      avgAltitudeFt: 6450,
      technicality: 2,
      trainingAnalog: 'Mid-grade fire-road climb at ~8% — 20 min sustained.',
      notes: 'Don\'t race the field here. The climb gets meaner after mile 1.5.',
    },
    {
      id: `${COURSE_ID}:stairway-push`,
      name: 'Stairway Push',
      type: 'climb',
      startMile: 1.5,
      endMile: 3.3,
      lengthMi: 1.8,
      avgGradePct: 11.0,
      peakGradePct: 14,
      netVerticalFt: 1050,
      surfaces: ['technical_trail', 'rocky_scramble', 'singletrack'],
      avgAltitudeFt: 7475,
      technicality: 4,
      trainingAnalog: 'Sustained technical climb at 12–14% grade — hill repeats on rocky terrain plus stair work.',
      notes: 'Hike-walk the steepest sections. Save the legs for the descent.',
    },
    {
      id: `${COURSE_ID}:ridge-descent`,
      name: 'Siberia Ridge Descent',
      type: 'descent',
      startMile: 3.3,
      endMile: 5.5,
      lengthMi: 2.2,
      avgGradePct: -11.2,
      peakGradePct: -16,
      netVerticalFt: -1300,
      surfaces: ['technical_trail', 'singletrack'],
      avgAltitudeFt: 7350,
      technicality: 4,
      trainingAnalog: 'Sustained technical descent at -10 to -15% — eccentric-loaded downhill repeats.',
      notes: 'The leg-shredder. Quad readiness here decides your finish.',
    },
    {
      id: `${COURSE_ID}:finish-runout`,
      name: 'Finish Run-out',
      type: 'descent',
      startMile: 5.5,
      endMile: 6.8,
      lengthMi: 1.3,
      avgGradePct: -7.3,
      peakGradePct: -10,
      netVerticalFt: -500,
      surfaces: ['singletrack', 'fire_road'],
      avgAltitudeFt: 6325,
      technicality: 2,
      trainingAnalog: 'Runnable rolling descent on smooth surface on tired legs.',
    },
  ],
  aidStations: [
    {
      id: `${COURSE_ID}:summit`,
      name: 'Siberia Ridge Aid',
      mile: 3.3,
      altitudeFt: 8000,
      services: ['water', 'electrolyte', 'gels'],
      crewAccess: false,
      notes: 'High-point aid. Quick top-off before the descent.',
    },
  ],
  metadata: {
    officialUrl: 'https://brokenarrowskyrace.com',
    tags: ['altitude', 'technical_descent'],
  },
}

export default brokenArrow11k2026
