// PLAN-vs-CODE drift (PR-12, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-12):
//
// 1. Path. Plan says `src/engines/coachSnapshot.ts`; the snapshot builder
//    actually lives at `src/utils/coachSnapshot.ts`. Plan flagged this:
//    "or wherever the snapshot is built — confirm path during the PR."
// 2. CoachSnapshot has no existing `engines` field. Plan's pseudocode
//    (`CoachSnapshot['engines']`) treats it as if it does. We add
//    `engines?: { terrain?: ..., descent?: ... }` from scratch — fully
//    additive, existing snapshots unchanged.
// 3. `weeklyTerrainLoad: TerrainLoadProfile` referenced by the plan but
//    `TerrainLoadProfile` doesn't exist anywhere yet. Plan's own
//    pseudocode marks the field optional (`weeklyTerrainLoad?:`). We
//    omit it from this PR; a later PR can land it once the type exists.
// 4. Builder is a pass-through, not a calculator. The plan implies the
//    builder reads `activity.terrainProfile` — but `StravaActivity` has
//    no such field today. Instead we add `engines` as an optional input
//    to `buildCoachSnapshot`; whoever computes the profile (a future
//    upstream caller) passes it in. Snapshot builder just forwards.
//    Production behaviour: zero change until a caller starts passing
//    `engines`.

import { describe, it, expect } from 'vitest'

import { buildCoachSnapshot } from '../../utils/coachSnapshot'
import type {
  AthleteProfile,
  DailyTRIMP,
  PerformanceMetrics,
  RaceInfo,
  TerrainSegment,
  TrainingWeek,
  EccentricBoutRecord,
  RepeatedBoutState,
} from '../../types'
import type { OverallCompliance } from '../../hooks/useCompliance'

const athlete: AthleteProfile = {
  name: 'Test',
  maxHR: 185,
  currentBase: '',
  weeklyStructure: '',
}

const race: RaceInfo = {
  name: 'Test',
  date: '2026-06-20',
  startTime: '',
  distance: '18K',
  distanceMiles: 11.2,
  elevation: '',
  elevationRange: '',
  course: '',
  cutoff: '',
  landmarks: [],
  gear: [],
  nutrition: '',
  loriNote: '',
}

const week1: TrainingWeek = {
  num: 1,
  dates: '',
  miles: 0,
  focus: '',
  days: [],
}

const compliance: OverallCompliance = {
  weeks: [],
  totalCompleted: 0,
  totalMissed: 0,
  totalWorkouts: 0,
  completionRate: 0,
  totalPlannedMiles: 0,
  totalActualMiles: 0,
  totalActualElevation: 0,
  overallHRCompliance: 0,
  overallDistanceCompliance: 0,
  overallDurationCompliance: 0,
  totalFlagged: 0,
}

const performance: PerformanceMetrics[] = []
const dailyTrimp: DailyTRIMP[] = []

const baseInputs = {
  athleteProfile: athlete,
  race,
  raceDistanceMiles: 11.2,
  raceElevationFt: 0,
  currentWeekNum: 1,
  weeks: [week1],
  readiness: null,
  performance,
  dailyTrimp,
  compliance,
  planStartDate: '2026-04-01',
}

const sampleSegment: TerrainSegment = {
  startSec: 0,
  endSec: 5,
  distanceM: 12,
  meanGradePct: -18,
  runMultiplier: 0.81,
  paceMps: 2.4,
  eccentricBucket: 4,
}

const sampleRepeatedBoutState: RepeatedBoutState = {
  recentBouts: [
    { date: '2026-04-23', doseAU: 110 } satisfies EccentricBoutRecord,
  ],
  protectionFactor: 0.45,
  peakAt: '2026-04-23',
}

describe('buildCoachSnapshot — engines namespace (PR-12)', () => {
  describe('AC1: no engines input → snapshot.engines is undefined', () => {
    it('omits the engines key entirely when not provided', () => {
      const snap = buildCoachSnapshot(baseInputs)
      expect(snap.engines).toBeUndefined()
    })

    it('existing snapshot fields are still populated', () => {
      const snap = buildCoachSnapshot(baseInputs)
      expect(snap.today).toBeDefined()
      expect(snap.athleteProfile).toBe(athlete)
      expect(snap.race).toBe(race)
      expect(snap.analytics).toBeDefined()
    })
  })

  describe('AC2: terrain input flows through to snapshot.engines.terrain', () => {
    it('whole.gapSeconds round-trips', () => {
      const snap = buildCoachSnapshot({
        ...baseInputs,
        engines: {
          terrain: {
            whole: {
              gapSeconds: 310.5,
              verticalGainM: 1525,
              verticalLossM: 1304,
            },
            segments: [sampleSegment],
          },
        },
      })
      expect(snap.engines?.terrain?.whole.gapSeconds).toBe(310.5)
      expect(snap.engines?.terrain?.whole.verticalGainM).toBe(1525)
      expect(snap.engines?.terrain?.whole.verticalLossM).toBe(1304)
    })

    it('segments array round-trips referentially', () => {
      const segments = [sampleSegment]
      const snap = buildCoachSnapshot({
        ...baseInputs,
        engines: {
          terrain: {
            whole: { gapSeconds: 0, verticalGainM: 0, verticalLossM: 0 },
            segments,
          },
        },
      })
      expect(snap.engines?.terrain?.segments).toBe(segments)
      expect(snap.engines?.terrain?.segments?.[0].eccentricBucket).toBe(4)
    })
  })

  describe('descent input flows through to snapshot.engines.descent', () => {
    it('all 7 descent fields round-trip', () => {
      const snap = buildCoachSnapshot({
        ...baseInputs,
        engines: {
          descent: {
            todayEccentricDose: 102.8,
            rolling7d: 245.1,
            rolling28d: 612.4,
            repeatedBoutState: sampleRepeatedBoutState,
            forecast24h: 56.5,
            forecast48h: 48.0,
            forecast72h: 31.0,
          },
        },
      })
      expect(snap.engines?.descent?.todayEccentricDose).toBe(102.8)
      expect(snap.engines?.descent?.rolling7d).toBe(245.1)
      expect(snap.engines?.descent?.rolling28d).toBe(612.4)
      expect(snap.engines?.descent?.repeatedBoutState).toBe(sampleRepeatedBoutState)
      expect(snap.engines?.descent?.forecast24h).toBe(56.5)
      expect(snap.engines?.descent?.forecast48h).toBe(48.0)
      expect(snap.engines?.descent?.forecast72h).toBe(31.0)
    })
  })

  describe('terrain and descent can coexist independently', () => {
    it('both populated in one snapshot', () => {
      const snap = buildCoachSnapshot({
        ...baseInputs,
        engines: {
          terrain: {
            whole: { gapSeconds: 310.5, verticalGainM: 1525, verticalLossM: 1304 },
            segments: [sampleSegment],
          },
          descent: {
            todayEccentricDose: 102.8,
            rolling7d: 0,
            rolling28d: 0,
            repeatedBoutState: { recentBouts: [], protectionFactor: 0 },
            forecast24h: 102.8,
            forecast48h: 87.4,
            forecast72h: 56.5,
          },
        },
      })
      expect(snap.engines?.terrain).toBeDefined()
      expect(snap.engines?.descent).toBeDefined()
    })

    it('only terrain → descent stays undefined', () => {
      const snap = buildCoachSnapshot({
        ...baseInputs,
        engines: {
          terrain: {
            whole: { gapSeconds: 0, verticalGainM: 0, verticalLossM: 0 },
            segments: [],
          },
        },
      })
      expect(snap.engines?.terrain).toBeDefined()
      expect(snap.engines?.descent).toBeUndefined()
    })

    it('only descent → terrain stays undefined', () => {
      const snap = buildCoachSnapshot({
        ...baseInputs,
        engines: {
          descent: {
            todayEccentricDose: 0,
            rolling7d: 0,
            rolling28d: 0,
            repeatedBoutState: { recentBouts: [], protectionFactor: 0 },
            forecast24h: 0,
            forecast48h: 0,
            forecast72h: 0,
          },
        },
      })
      expect(snap.engines?.descent).toBeDefined()
      expect(snap.engines?.terrain).toBeUndefined()
    })
  })

  describe('production-behavior invariant', () => {
    it('snapshot WITHOUT engines is byte-identical to today\'s shape — the new field is purely additive', () => {
      const snap = buildCoachSnapshot(baseInputs)
      // The snapshot must NOT have an `engines: undefined` key when the
      // input doesn't supply one — that would break JSON serialization
      // contract for downstream prompt construction.
      expect(Object.prototype.hasOwnProperty.call(snap, 'engines')).toBe(false)
    })
  })
})
