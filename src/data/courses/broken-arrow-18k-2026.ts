import type { Course } from '../../types/course'

/**
 * Broken Arrow 18K — 2026 edition. Palisades Tahoe.
 *
 * Elevation profile, named features, and aid station mile markers seeded
 * from the existing hardcoded data in src/components/RaceElevationProfile.tsx
 * (lifted into a proper data layer here). Segment groupings, surfaces, and
 * technicality scores are curated estimates; verify against the official
 * course brief before treating any segment as authoritative.
 */

const COURSE_ID = 'broken-arrow-18k-2026'
const FAMILY_ID = 'broken-arrow-18k'

const brokenArrow18k2026: Course = {
  id: COURSE_ID,
  familyId: FAMILY_ID,
  name: 'Broken Arrow 18K',
  year: 2026,
  category: 'skyrace',
  distanceMi: 11.2,
  distanceKm: 18.0,
  verticalGainFt: 3850,
  verticalLossFt: 3850,
  startAltitudeFt: 6200,
  peakAltitudeFt: 9000,
  minAltitudeFt: 6200,
  location: {
    latitude: 39.1958,
    longitude: -120.2348,
    label: 'Palisades Tahoe, CA',
  },
  summary:
    "A short skyrace with a heavy punch. Two miles of fire-road climb out of the base area, then a sustained singletrack push to Stairway to Heaven, a rocky scramble to Washeshu Peak at 9,000 ft, then a brutal technical descent down Siberia and Shirley Canyon before a runnable finish on the Western States Trail. Quads decide your finish time more than your engine does.",
  // Coordinates are approximate, hand-traced from publicly known course
  // landmarks at Palisades Tahoe. The two legs are deliberately offset so
  // the loop reads as a loop in 3D: climb (mile 0–4.7) sweeps S/SW out of
  // the base via KT-22 / Red Dog / Stairway; descent (mile 4.9–11.2)
  // returns N/NE through the Siberia → Shirley Canyon → WST corridor on
  // the *other* side of the ridge. Replace with an official GPX trace
  // when one is published.
  elevationProfile: [
    { mile: 0.0, elevationFt: 6200, label: 'Start (Base Area)', latitude: 39.1968, longitude: -120.2348 },
    { mile: 0.5, elevationFt: 6450, latitude: 39.1940, longitude: -120.2360 },
    { mile: 1.0, elevationFt: 6750, latitude: 39.1912, longitude: -120.2382 },
    { mile: 1.5, elevationFt: 7100, latitude: 39.1887, longitude: -120.2415 },
    { mile: 2.0, elevationFt: 7400, label: 'KT-22 Saddle', latitude: 39.1862, longitude: -120.2445 },
    { mile: 2.5, elevationFt: 7650, latitude: 39.1842, longitude: -120.2480 },
    { mile: 3.0, elevationFt: 7900, label: 'Red Dog Ridge', latitude: 39.1822, longitude: -120.2515 },
    { mile: 3.5, elevationFt: 8300, latitude: 39.1805, longitude: -120.2548 },
    { mile: 4.0, elevationFt: 8650, label: 'Stairway to Heaven', latitude: 39.1790, longitude: -120.2580 },
    { mile: 4.5, elevationFt: 8950, latitude: 39.1782, longitude: -120.2610 },
    { mile: 4.7, elevationFt: 9000, label: 'Washeshu Peak (HIGH POINT)', latitude: 39.1780, longitude: -120.2625 },
    { mile: 4.9, elevationFt: 8850, label: 'Siberia Aid Station', latitude: 39.1810, longitude: -120.2640 },
    { mile: 5.5, elevationFt: 8400, latitude: 39.1845, longitude: -120.2655 },
    { mile: 6.0, elevationFt: 7900, latitude: 39.1882, longitude: -120.2655 },
    { mile: 6.5, elevationFt: 7500, label: 'Shirley Canyon', latitude: 39.1918, longitude: -120.2630 },
    { mile: 7.0, elevationFt: 7100, latitude: 39.1948, longitude: -120.2595 },
    { mile: 7.6, elevationFt: 6800, label: "Julia's Aid Station", latitude: 39.1972, longitude: -120.2545 },
    { mile: 8.0, elevationFt: 6650, latitude: 39.1985, longitude: -120.2510 },
    { mile: 8.5, elevationFt: 6550, latitude: 39.1990, longitude: -120.2475 },
    { mile: 9.0, elevationFt: 6450, label: 'Western States Trail', latitude: 39.1990, longitude: -120.2440 },
    { mile: 9.5, elevationFt: 6380, latitude: 39.1985, longitude: -120.2412 },
    { mile: 10.0, elevationFt: 6300, latitude: 39.1980, longitude: -120.2388 },
    { mile: 10.5, elevationFt: 6250, latitude: 39.1975, longitude: -120.2368 },
    { mile: 11.2, elevationFt: 6200, label: 'Finish! Ring das bell!', latitude: 39.1968, longitude: -120.2348 },
  ],
  segments: [
    {
      id: `${COURSE_ID}:kt22-climb`,
      name: 'KT-22 Climb',
      type: 'climb',
      startMile: 0.0,
      endMile: 2.0,
      lengthMi: 2.0,
      avgGradePct: 11.4,
      peakGradePct: 14,
      netVerticalFt: 1200,
      surfaces: ['fire_road', 'singletrack'],
      avgAltitudeFt: 6800,
      technicality: 2,
      trainingAnalog: 'Sustained 30-min climb on fire road at 10–14% grade.',
      notes: 'Sets the cardiac tone for the day. Don\'t spike the heart rate in the first mile.',
    },
    {
      id: `${COURSE_ID}:red-dog-ridge`,
      name: 'Red Dog Ridge',
      type: 'climb',
      startMile: 2.0,
      endMile: 3.0,
      lengthMi: 1.0,
      avgGradePct: 9.5,
      peakGradePct: 12,
      netVerticalFt: 500,
      surfaces: ['singletrack'],
      avgAltitudeFt: 7650,
      technicality: 3,
      trainingAnalog: 'Steady singletrack climb, 15 min sustained at ~10% grade.',
    },
    {
      id: `${COURSE_ID}:stairway-to-heaven`,
      name: 'Stairway to Heaven',
      type: 'climb',
      startMile: 3.0,
      endMile: 4.7,
      lengthMi: 1.7,
      avgGradePct: 13.5,
      peakGradePct: 18,
      netVerticalFt: 1100,
      surfaces: ['technical_trail', 'rocky_scramble'],
      avgAltitudeFt: 8475,
      technicality: 5,
      trainingAnalog: 'Steepest sustained climb on technical rocky terrain — 8×400m hill repeats at 12%+ grade, plus stair work.',
      notes: 'Hike-walk this. Trying to run it is a quad-killer that costs you on the descent.',
    },
    {
      id: `${COURSE_ID}:siberia-descent`,
      name: 'Siberia Descent',
      type: 'descent',
      startMile: 4.7,
      endMile: 6.0,
      lengthMi: 1.3,
      avgGradePct: -16.5,
      peakGradePct: -20,
      netVerticalFt: -1100,
      surfaces: ['technical_trail', 'rocky_scramble'],
      avgAltitudeFt: 8500,
      technicality: 5,
      trainingAnalog: 'Sustained technical descent at -15% on rocky terrain — eccentric-loaded downhill repeats, 30+ min total.',
      notes: 'The race\'s most dangerous section. Pacing here saves quads for the run-in.',
    },
    {
      id: `${COURSE_ID}:shirley-canyon`,
      name: 'Shirley Canyon',
      type: 'descent',
      startMile: 6.0,
      endMile: 7.6,
      lengthMi: 1.6,
      avgGradePct: -13.0,
      peakGradePct: -17,
      netVerticalFt: -1100,
      surfaces: ['technical_trail', 'singletrack'],
      avgAltitudeFt: 7350,
      technicality: 4,
      trainingAnalog: 'Long sustained descent on technical singletrack at -12 to -16% grade.',
    },
    {
      id: `${COURSE_ID}:western-states-runout`,
      name: 'Western States Run-out',
      type: 'descent',
      startMile: 7.6,
      endMile: 11.2,
      lengthMi: 3.6,
      avgGradePct: -3.2,
      peakGradePct: -8,
      netVerticalFt: -600,
      surfaces: ['singletrack', 'fire_road'],
      avgAltitudeFt: 6450,
      technicality: 2,
      trainingAnalog: 'Runnable rolling descent on smooth singletrack — tempo-pace finish on tired legs.',
      notes: 'If your quads survived Siberia, this is where you make up time.',
    },
  ],
  aidStations: [
    {
      id: `${COURSE_ID}:siberia`,
      name: 'Siberia Aid',
      mile: 4.9,
      altitudeFt: 8850,
      services: ['water', 'electrolyte', 'food', 'gels', 'medical'],
      crewAccess: false,
      notes: 'Top of the course. Quick stop — the descent starts immediately after.',
    },
    {
      id: `${COURSE_ID}:julias`,
      name: "Julia's",
      mile: 7.6,
      altitudeFt: 6800,
      services: ['water', 'electrolyte', 'food', 'gels', 'crew_access', 'medical'],
      crewAccess: true,
      notes: 'Crew-accessible. Last full aid before the run-in to the finish.',
    },
  ],
  metadata: {
    officialUrl: 'https://brokenarrowskyrace.com',
    tags: ['altitude', 'technical_descent', 'exposed_ridge'],
  },
}

export default brokenArrow18k2026
