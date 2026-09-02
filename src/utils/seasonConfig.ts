import type { AdditionalRace, OnboardingConfig, RaceDistance, RaceType } from '../hooks/useOnboarding'
import { nearestRaceDistance } from '../engines/season/spliceSeason'
import { isHyroxRaceInfo } from '../engines/season/planSeason'
import { raceDateToIso } from '../engines/season'

/** Approx race distance in miles — goal-time sanity checks and the
 *  anchor-swap demotion below. */
export const RACE_DISTANCE_MILES: Record<RaceDistance, number> = {
  '5k': 3.1, '10k': 6.2, half_marathon: 13.1, marathon: 26.2,
  '50k': 31.1, '50_mile': 50, '100k': 62.1, '100_mile': 100, mountain_ultra: 31,
}

/**
 * The plan is always anchored on the CHRONOLOGICALLY FIRST race — you train
 * for the season in calendar order no matter which race you happened to
 * type into the race step.
 *
 * Field failure this fixes: the athlete entered their MAIN GOAL (a Hyrox in
 * December) as "the race" and added an earlier half marathon. The entered
 * race became the anchor plan, and the season splice — which only chains
 * blocks AFTER the anchor — silently dropped the half: race day 10/24
 * showed Hyrox build content, and August (their chosen start) was empty.
 *
 * When an additional race predates the entered race, the earliest race is
 * PROMOTED to the config's scalar anchor fields (it drives the base plan)
 * and the entered race is DEMOTED into `additionalRaces`, carrying the
 * main-goal flag with it. Pure function; legacy configs (no earlier
 * additional race) pass through unchanged.
 */
export function normalizeSeasonConfig(config: OnboardingConfig): OnboardingConfig {
  const extras = config.additionalRaces
  if (!config.raceDate || !extras || extras.length === 0) return config
  const anchorIso = raceDateToIso(config.raceDate)
  if (!anchorIso) return config

  // Chronologically earliest extra with a parseable date.
  let earliest: AdditionalRace | null = null
  let earliestIso = anchorIso
  for (const r of extras) {
    const iso = raceDateToIso(r.date)
    if (iso && iso < earliestIso) {
      earliest = r
      earliestIso = iso
    }
  }
  // Ties keep the entered anchor; nothing earlier → no-op.
  if (!earliest) return config

  // ── Promote the earliest extra to the scalar anchor ─────────────
  const promotedIsHyrox = earliest.format
    ? earliest.format === 'hyrox'
    : isHyroxRaceInfo({ name: earliest.name, description: earliest.description })
  const promotedType: RaceType = promotedIsHyrox
    ? 'hyrox'
    : earliest.format ?? (config.raceType === 'trail' || config.raceType === 'road' ? config.raceType : 'road')

  // ── Demote the entered race into the additional list ────────────
  const enteredWasPrimary = config.anchorIsPrimary !== false
  const enteredIsHyrox = config.raceType === 'hyrox'
  const demoted: AdditionalRace = {
    name: config.raceName,
    date: anchorIso,
    priority: enteredWasPrimary ? 'A' : 'B',
    isPrimary: enteredWasPrimary || undefined,
    distanceMiles: config.raceDistance
      ? RACE_DISTANCE_MILES[config.raceDistance]
      : enteredIsHyrox ? 8 : undefined,
    description: config.raceDescription,
    format: config.raceType !== 'general' ? config.raceType : undefined,
    hyroxDivision: enteredIsHyrox ? config.hyroxDivision : undefined,
    // The entered race never saw the integration ask; mirror the season
    // builder's defaults (Hyrox layers into the current build).
    integration: enteredIsHyrox ? 'layered' : 'sequential',
  }
  const newAdditional = [demoted, ...extras.filter(r => r !== earliest)]

  return {
    ...config,
    raceType: promotedType,
    // P3.1 — the promoted Hyrox brings its own division; the entered
    // config's division (if it was a Hyrox) is the fallback.
    hyroxDivision: promotedIsHyrox ? (earliest.hyroxDivision ?? config.hyroxDivision) : config.hyroxDivision,
    raceName: earliest.name,
    raceDate: earliestIso,
    raceDescription: earliest.description ?? undefined,
    // undefined for Hyrox is load-bearing: App's MethodSelection gate keys
    // on raceDistance, and a Hyrox plan must not ask for a running method.
    raceDistance: promotedIsHyrox ? undefined : nearestRaceDistance(earliest.distanceMiles || 13.1),
    // The goal time was aimed at the ENTERED race's distance — never
    // re-aim it at a different race (the honesty rule).
    goalRaceTimeSeconds: undefined,
    // A method chosen for the entered race's type may not fit the new
    // anchor type — App re-asks when needed (its MethodSelection gate).
    selectedMethodId: undefined,
    additionalRaces: newAdditional,
    anchorIsPrimary: !newAdditional.some(r => r.isPrimary),
  }
}
