import type {
  RaceInfo,
  Season,
  SeasonBlock,
  SeasonRace,
} from '../../types'

/**
 * Season engine — G1 foundation (PR-1: data model only, zero behavior).
 *
 * The inter-event state machine (`planSeason`: RACE → RECOVER → BRIDGE →
 * BUILD → TAPER with residual-aware bridges) lands in PR-6. This module
 * ships the shared vocabulary plus the migration shim that makes every
 * existing single-race athlete a valid degenerate one-race season, so the
 * rest of the app can start reading `Season` without waiting for the engine.
 *
 * Design rule (locked in docs/gap-closure-build-plan.md §1-D2): season
 * *state* is always derived from `(races, today, loggedActuals)` on read —
 * never stored as a mutable "current block" — so the engine cannot wedge
 * the way Garmin's post-race recovery documentedly does.
 */

/** localStorage / sync key for the athlete's Season (scoped `_<athleteId>`
 *  like every other hook key; registered in src/utils/migrate.ts and
 *  api/_sync/allowlist.py). */
export const SEASON_STORAGE_KEY = 'ba_season_v1'

/** Parse the free-text RaceInfo.date ("Sunday, June 21, 2026" or
 *  "2026-06-21") to ISO YYYY-MM-DD. Null when unparseable — callers must
 *  tolerate legacy hand-authored dates. */
export function raceDateToIso(raceDate: string): string | null {
  const raw = raceDate.match(/\w+,\s*(.+)/)?.[1] || raceDate
  const parsed = new Date(raw)
  if (isNaN(parsed.getTime())) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Migration shim: wrap an existing single-race plan's RaceInfo into the
 * degenerate one-race Season (priority A, no blocks — the single plan IS
 * the BUILD→TAPER→RACE arc, so block decomposition is deferred to PR-6).
 * Idempotent by construction: the race id derives from name + date.
 */
export function seasonFromSingleRace(race: RaceInfo, today?: string): Season {
  const iso = raceDateToIso(race.date)
  const status: SeasonRace['status'] =
    iso && today && iso < today ? 'completed' : 'upcoming'
  return {
    races: [{
      id: seasonRaceId(race),
      priority: 'A',
      raceInfo: race,
      status,
    }],
    blocks: [],
  }
}

/** Stable, regeneration-safe race id (used by SeasonBlock.raceId). */
export function seasonRaceId(race: RaceInfo): string {
  const slug = (race.name || 'race')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug}_${raceDateToIso(race.date) ?? 'undated'}`
}

/** Runtime validator for data read back from storage/sync. Conservative:
 *  anything malformed → null, callers fall back to the single-race shim. */
export function parseSeason(raw: unknown): Season | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<Season>
  if (!Array.isArray(s.races) || !Array.isArray(s.blocks)) return null
  for (const r of s.races) {
    if (!r || typeof r.id !== 'string' || !r.raceInfo) return null
    if (r.priority !== 'A' && r.priority !== 'B' && r.priority !== 'C') return null
  }
  for (const b of s.blocks as SeasonBlock[]) {
    if (!b || typeof b.id !== 'string' || typeof b.raceId !== 'string') return null
    if (!['BUILD', 'TAPER', 'RACE', 'RECOVER', 'BRIDGE'].includes(b.kind)) return null
    if (typeof b.startDate !== 'string' || typeof b.endDate !== 'string') return null
  }
  return raw as Season
}

/** Races sorted by date (undated last), the canonical season ordering. */
export function sortedSeasonRaces(season: Season): SeasonRace[] {
  return [...season.races].sort((a, b) => {
    const da = raceDateToIso(a.raceInfo.date) ?? '9999-99-99'
    const db = raceDateToIso(b.raceInfo.date) ?? '9999-99-99'
    return da.localeCompare(db)
  })
}
