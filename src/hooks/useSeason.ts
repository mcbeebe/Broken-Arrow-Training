import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RaceInfo, RacePriority, Season, SeasonRace } from '../types'
import {
  SEASON_STORAGE_KEY,
  isNearDuplicateRace,
  parseSeason,
  seasonFromSingleRace,
  seasonRaceId,
} from '../engines/season'
import { planSeason, type SeasonPlanResult } from '../engines/season/planSeason'
import { todayDateString } from '../utils/planDates'
import { stampKey } from '../utils/syncStamps'

/**
 * The athlete's Season (G1b): localStorage-backed like every other hook
 * (`ba_season_v1_<athleteId>`, registered in both preserve/sync allowlists
 * since PR-1), lazily initialized from the active plan's race via the
 * degenerate-season shim — so a single-race athlete has a valid Season
 * without ever seeing season UI (the guard).
 *
 * The block timeline is DERIVED via planSeason on every change (locked
 * decision D2) — only the race calendar is stored, never a "current block".
 */

function scopedKey(athleteId?: string): string {
  return athleteId ? `${SEASON_STORAGE_KEY}_${athleteId}` : SEASON_STORAGE_KEY
}

function readSeason(athleteId?: string): Season | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    return raw ? parseSeason(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeSeason(season: Season, athleteId?: string): void {
  const key = scopedKey(athleteId)
  try {
    // Blocks are derived state — persist the calendar only, so a stale
    // stored timeline can never wedge a future computation.
    localStorage.setItem(key, JSON.stringify({ races: season.races, blocks: [] }))
    stampKey(key)
  } catch { /* quota */ }
}

export interface UseSeasonReturn {
  season: Season
  /** Derived block timeline + season advisories (recomputed, never stored). */
  planResult: SeasonPlanResult
  isMultiRace: boolean
  addRace: (race: RaceInfo, priority: RacePriority, integration?: 'layered' | 'sequential') => void
  setPriority: (raceId: string, priority: RacePriority) => void
  /** Set/confirm how a race integrates with the anchor build ('layered'
   *  weaves sessions in now). Asked, never silently applied. */
  setIntegration: (raceId: string, integration: 'layered' | 'sequential') => void
  /** Move the season's main goal to `raceId` — the old primary is demoted
   *  to a key race (B). One atomic write; at most one primary ever. */
  setPrimary: (raceId: string) => void
  removeRace: (raceId: string) => void
}

export function useSeason(
  activeRace: RaceInfo,
  athleteId?: string,
  /** Races captured at onboarding (config.additionalRaces) — seeded into
   *  the calendar exactly ONCE per athlete (stamped), so removing one on
   *  the season panel is never undone by a re-seed. */
  seedRaces?: { name: string; date: string; priority: RacePriority; distanceMiles?: number; description?: string; integration?: 'layered' | 'sequential'; format?: 'road' | 'trail' | 'hyrox'; isPrimary?: boolean }[],
  /** The config generation that produced `seedRaces` (config.completedAt).
   *  Seeding is idempotent PER GENERATION: a redo (new completedAt) seeds
   *  the newly captured races; within a generation the stamp keeps panel
   *  removals from being undone by re-renders. */
  seedGenerationId?: string,
): UseSeasonReturn {
  const [stored, setStored] = useState<Season | null>(() => readSeason(athleteId))

  useEffect(() => {
    setStored(readSeason(athleteId))
  }, [athleteId])

  // Onboarding seed (G1b) — idempotent PER PLAN GENERATION. The original
  // once-per-athlete-forever stamp was a field bug: an athlete who REDID
  // onboarding with four races kept their year-old single-race season
  // because the stamp blocked the re-seed.
  useEffect(() => {
    if (!seedRaces || seedRaces.length === 0) return
    const stampKeyName = `ba_season_seeded_v1_${athleteId ?? ''}`
    const generation = seedGenerationId || 'legacy'
    try {
      if (localStorage.getItem(stampKeyName) === generation) return
      const current = readSeason(athleteId) ?? { races: [], blocks: [] }
      const additions: SeasonRace[] = []
      let races = current.races
      for (const s of seedRaces) {
        const raceInfo: RaceInfo = {
          name: s.name, date: s.date, startTime: '',
          distance: s.format === 'hyrox' ? 'Hyrox' : s.distanceMiles ? `${s.distanceMiles} mi` : '',
          distanceMiles: s.distanceMiles ?? 0,
          elevation: '', elevationRange: '', course: '', cutoff: '',
          landmarks: [], gear: [], nutrition: '',
          description: s.description,
          format: s.format,
        }
        const id = seasonRaceId(raceInfo)
        const existing = races.find(r => r.id === id)
        if (existing) {
          // Re-captured race (same name+date): adopt the fresh answers —
          // priority, integration, format, description — without duplicating.
          races = races.map(r => r.id === id ? {
            ...r,
            priority: s.priority,
            integration: s.integration ?? r.integration,
            isPrimary: s.isPrimary ?? r.isPrimary,
            raceInfo: { ...r.raceInfo, description: s.description ?? r.raceInfo.description, format: s.format ?? r.raceInfo.format },
          } : r)
          continue
        }
        // Same date + near-identical name = the same race typed with a typo
        // ("Maraton" → "Marathon"): REPLACE the stored entry (corrected name,
        // fresh id, adopted answers) instead of duplicating it — a duplicate
        // chains its own build and corrupts the whole season timeline.
        const nearDup = races.find(r => isNearDuplicateRace(
          { name: r.raceInfo.name, date: r.raceInfo.date },
          { name: s.name, date: s.date },
        ))
        if (nearDup) {
          races = races.map(r => r.id === nearDup.id ? {
            ...r,
            id,
            priority: s.priority,
            integration: s.integration ?? r.integration,
            isPrimary: s.isPrimary ?? r.isPrimary,
            raceInfo: { ...r.raceInfo, ...raceInfo, description: s.description ?? r.raceInfo.description },
          } : r)
          continue
        }
        additions.push({ id, priority: s.priority, raceInfo, status: 'upcoming', integration: s.integration, isPrimary: s.isPrimary })
      }
      if (additions.length > 0 || races !== current.races) {
        const next: Season = { races: [...races, ...additions], blocks: [] }
        writeSeason(next, athleteId)
        setStored(next)
      }
      localStorage.setItem(stampKeyName, generation)
    } catch { /* seeding is best-effort */ }
  }, [seedRaces, athleteId, seedGenerationId])

  // Cross-device sync writes dispatch synthetic storage events (same
  // pattern as usePlanEdits) — pick them up without a refresh.
  useEffect(() => {
    const watched = scopedKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key === watched) setStored(readSeason(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  // The plan's race is always race #1: stored seasons that predate a plan
  // change re-anchor on it, and empty storage yields the degenerate season.
  const season = useMemo<Season>(() => {
    const base = seasonFromSingleRace(activeRace, todayDateString())
    if (!stored || stored.races.length === 0) return base
    const anchorId = base.races[0].id
    // Near-dup guard alongside the exact-id filter: a stored race that is
    // the anchor with a typo'd name must not ride along as a second race.
    const extras = stored.races.filter(r => r.id !== anchorId &&
      !isNearDuplicateRace(
        { name: r.raceInfo.name, date: r.raceInfo.date },
        { name: activeRace.name, date: activeRace.date },
      ))
    // Preserve stored overrides for the anchor race (priority, main-goal
    // flag). Without a stored override, the anchor is the main goal only
    // when no other race claims it — at most one primary, always.
    const anchorStored = stored.races.find(r => r.id === anchorId)
    const anchorIsPrimary = anchorStored?.isPrimary ?? !extras.some(e => e.isPrimary)
    const anchor = {
      ...base.races[0],
      ...(anchorStored ? { priority: anchorStored.priority } : {}),
      isPrimary: anchorIsPrimary,
    }
    return { races: [anchor, ...extras], blocks: [] }
  }, [stored, activeRace])

  const planResult = useMemo(
    () => planSeason(season.races, todayDateString()),
    [season],
  )

  const commit = useCallback((races: SeasonRace[]) => {
    const next: Season = { races, blocks: [] }
    writeSeason(next, athleteId)
    setStored(next)
  }, [athleteId])

  const addRace = useCallback((race: RaceInfo, priority: RacePriority, integration?: 'layered' | 'sequential') => {
    const newRace: SeasonRace = {
      id: seasonRaceId(race),
      priority,
      raceInfo: race,
      status: 'upcoming',
      integration,
    }
    if (season.races.some(r => r.id === newRace.id)) return // idempotent
    commit([...season.races, newRace])
  }, [season, commit])

  const setPriority = useCallback((raceId: string, priority: RacePriority) => {
    commit(season.races.map(r => (r.id === raceId ? { ...r, priority } : r)))
  }, [season, commit])

  const setIntegration = useCallback((raceId: string, integration: 'layered' | 'sequential') => {
    commit(season.races.map(r => (r.id === raceId ? { ...r, integration } : r)))
  }, [season, commit])

  // Move the season's MAIN GOAL. One atomic write: the target gains the
  // flag and priority 'A'; the former primary is demoted to 'B' (a key
  // race with a short taper); everyone else just loses the flag — so no
  // dual-primary state can ever persist or sync.
  const setPrimary = useCallback((raceId: string) => {
    if (!season.races.some(r => r.id === raceId)) return
    commit(season.races.map(r => r.id === raceId
      ? { ...r, isPrimary: true, priority: 'A' as RacePriority }
      : { ...r, isPrimary: false, priority: r.isPrimary ? 'B' as RacePriority : r.priority }))
  }, [season, commit])

  const removeRace = useCallback((raceId: string) => {
    // The anchor (plan) race can't be removed here — it IS the plan.
    if (season.races[0]?.id === raceId) return
    commit(season.races.filter(r => r.id !== raceId))
  }, [season, commit])

  return {
    season,
    planResult,
    isMultiRace: season.races.length > 1,
    addRace,
    setPriority,
    setIntegration,
    setPrimary,
    removeRace,
  }
}
