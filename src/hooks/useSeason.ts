import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RaceInfo, RacePriority, Season, SeasonRace } from '../types'
import {
  SEASON_STORAGE_KEY,
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
  removeRace: (raceId: string) => void
}

export function useSeason(
  activeRace: RaceInfo,
  athleteId?: string,
  /** Races captured at onboarding (config.additionalRaces) — seeded into
   *  the calendar exactly ONCE per athlete (stamped), so removing one on
   *  the season panel is never undone by a re-seed. */
  seedRaces?: { name: string; date: string; priority: RacePriority; distanceMiles?: number; description?: string; integration?: 'layered' | 'sequential' }[],
): UseSeasonReturn {
  const [stored, setStored] = useState<Season | null>(() => readSeason(athleteId))

  useEffect(() => {
    setStored(readSeason(athleteId))
  }, [athleteId])

  // One-time onboarding seed (G1b). The stamp — not the race list — is
  // what makes this idempotent across renders, devices, and removals.
  useEffect(() => {
    if (!seedRaces || seedRaces.length === 0) return
    const stampKeyName = `ba_season_seeded_v1_${athleteId ?? ''}`
    try {
      if (localStorage.getItem(stampKeyName)) return
      const current = readSeason(athleteId) ?? { races: [], blocks: [] }
      const additions: SeasonRace[] = []
      for (const s of seedRaces) {
        const raceInfo: RaceInfo = {
          name: s.name, date: s.date, startTime: '',
          distance: s.distanceMiles ? `${s.distanceMiles} mi` : '',
          distanceMiles: s.distanceMiles ?? 0,
          elevation: '', elevationRange: '', course: '', cutoff: '',
          landmarks: [], gear: [], nutrition: '',
          description: s.description,
        }
        const id = seasonRaceId(raceInfo)
        if (current.races.some(r => r.id === id)) continue
        additions.push({ id, priority: s.priority, raceInfo, status: 'upcoming', integration: s.integration })
      }
      if (additions.length > 0) {
        const next: Season = { races: [...current.races, ...additions], blocks: [] }
        writeSeason(next, athleteId)
        setStored(next)
      }
      localStorage.setItem(stampKeyName, new Date().toISOString())
    } catch { /* seeding is best-effort */ }
  }, [seedRaces, athleteId])

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
    const extras = stored.races.filter(r => r.id !== anchorId)
    // Preserve a stored priority override for the anchor race.
    const anchorStored = stored.races.find(r => r.id === anchorId)
    const anchor = anchorStored ? { ...base.races[0], priority: anchorStored.priority } : base.races[0]
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
    removeRace,
  }
}
