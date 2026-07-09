import type { TrainingWeek } from '../../types'
import type { OnboardingConfig, RaceDistance } from '../../hooks/useOnboarding'
import type { SeasonPlanResult } from './planSeason'
import { isHyroxRace } from './planSeason'
import { bridgeWeeks, recoverWeeks } from './blockWeeks'
import { getMethodById, RECOMMENDABLE_METHODS } from '../../data/methods'
import { generatePlanFromMethod } from '../planGenerator/generatePlan'
import { generateHyroxPlan } from '../../utils/planGenerator'
import { parseDayToDate } from '../../utils/planDates'
import { raceDateToIso } from './index'

/**
 * G1 completion — splice the season into the athlete-facing plan.
 *
 * The anchor race's plan (the plan the athlete onboarded onto) stays
 * EXACTLY as generated — the locked guard: a single-race season returns
 * the base weeks untouched, and in a multi-race season the anchor's weeks
 * are still byte-identical. What splicing adds, appended after the anchor
 * race with continuous week numbering, is the rest of the chain:
 *
 *   RECOVER weeks (shipped R5 formulas as scheduled days)
 *   → BRIDGE weeks (residual-aware content per blockWeeks.ts)
 *   → the NEXT race's full generated plan (its own build + taper via the
 *     same engines: the athlete's method for trail/road, the Hyrox engine
 *     for Hyrox), runway-clamped to that race's date.
 *
 * Derived-state discipline (D2/D3): splicing recomputes from
 * (blocks, today) on every call and only generates FUTURE blocks — a
 * fully-past block contributes nothing, so nothing can wedge and history
 * is never rewritten. Splices run BEFORE swaps/edits/actuals in the
 * weeks pipeline, so all existing plan machinery (compliance, push,
 * realignment, repace) applies to season weeks for free.
 */

/** Nearest plan-distance bucket for a race captured by miles alone. */
export function nearestRaceDistance(miles: number): RaceDistance {
  if (miles <= 3.5) return '5k'
  if (miles <= 7) return '10k'
  if (miles <= 16) return 'half_marathon'
  if (miles <= 27) return 'marathon'
  if (miles <= 35) return '50k'
  if (miles <= 55) return '50_mile'
  if (miles <= 70) return '100k'
  return '100_mile'
}

export function spliceSeasonWeeks(
  baseWeeks: TrainingWeek[],
  result: SeasonPlanResult,
  config: OnboardingConfig | null,
  today: string,
): TrainingWeek[] {
  const { season } = result
  if (season.races.length < 2 || !config) return baseWeeks // the guard

  const anchorId = season.races[0]?.id
  const out = [...baseWeeks]
  let nextWeekNum = baseWeeks.reduce((m, w) => Math.max(m, w.num), 0) + 1

  // Blocks strictly after the anchor race, future-only, in date order.
  const anchorRaceBlock = season.blocks.find(b => b.kind === 'RACE' && b.raceId === anchorId)
  const laterBlocks = season.blocks
    .filter(b => !anchorRaceBlock || b.startDate > anchorRaceBlock.startDate)
    .filter(b => b.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const racesById = new Map(season.races.map(r => [r.id, r]))
  const generatedRaceIds = new Set<string>()

  for (const block of laterBlocks) {
    const race = racesById.get(block.raceId)
    if (!race) continue

    if (block.kind === 'RECOVER') {
      const prev = racesById.get(block.raceId)
      const miles = prev?.raceInfo.distanceMiles || 13.1
      const highVert = (prev?.raceInfo.elevationGainFt ?? 0) > 100 * miles
      const weeks = recoverWeeks(block, miles, { highVert, startWeekNum: nextWeekNum })
      appendLabeled(out, weeks, `After ${prev?.raceInfo.name ?? 'race'}`)
      nextWeekNum += weeks.length
      continue
    }

    if (block.kind === 'BRIDGE') {
      const weeks = bridgeWeeks(block, isHyroxRace(race), { startWeekNum: nextWeekNum })
      appendLabeled(out, weeks, `Toward ${race.raceInfo.name}`)
      nextWeekNum += weeks.length
      continue
    }

    // BUILD (and its TAPER — the generated plan carries its own taper):
    // one full plan per subsequent race, generated at the block's start.
    if (block.kind === 'BUILD' && !generatedRaceIds.has(race.id)) {
      generatedRaceIds.add(race.id)
      const raceConfig = configForSeasonRace(config, race)
      if (!raceConfig) continue
      const genToday = block.startDate >= today ? block.startDate : today
      const plan = safeGenerate(raceConfig, genToday)
      if (!plan) continue
      for (const w of plan.weeks) {
        // Hard guarantee (P0): a spliced week may NEVER predate its block —
        // a generator that back-counts past the block start (the Hyrox
        // template bug) would otherwise stack its weeks on top of the
        // previous race's build, corrupting week numbering and dates.
        // Runway clamps in the generators make this a no-op today; the
        // trim stands as the safety net for any future generator.
        if (weekStartsBefore(w, genToday)) continue
        out.push({
          ...w,
          num: nextWeekNum++,
          focus: `[${race.raceInfo.name}] ${w.focus}`,
          days: w.days.map(d => ({ ...d })),
        })
      }
    }
  }

  return out
}

/** The generation config for a subsequent season race: the athlete's own
 *  answers, re-aimed at the next race. Null when the race can't drive a
 *  generator (no date). */
function configForSeasonRace(
  config: OnboardingConfig,
  race: { raceInfo: { name: string; date: string; distanceMiles: number; description?: string } },
): (OnboardingConfig & { raceDate: string }) | null {
  const iso = raceDateToIso(race.raceInfo.date)
  if (!iso) return null
  const hyrox = `${race.raceInfo.name} ${race.raceInfo.description ?? ''}`.toLowerCase().includes('hyrox')
  return {
    ...config,
    raceType: hyrox ? 'hyrox' : (config.raceType === 'general' ? 'road' : config.raceType),
    raceName: race.raceInfo.name,
    raceDate: iso,
    raceDescription: race.raceInfo.description ?? undefined,
    raceDistance: hyrox ? undefined
      : nearestRaceDistance(race.raceInfo.distanceMiles || 13.1),
    // Goal time was for the anchor race — never re-aim it at a different
    // distance (the honesty rule; a tune-up confirms new paces instead).
    goalRaceTimeSeconds: undefined,
  }
}

function safeGenerate(config: OnboardingConfig, today: string) {
  try {
    if (config.raceType === 'hyrox') return generateHyroxPlan(config, today)
    const method = (config.selectedMethodId && getMethodById(config.selectedMethodId)) || RECOMMENDABLE_METHODS[0]
    if (!method) return null
    return generatePlanFromMethod(method, config, today)
  } catch {
    return null // a broken subsequent-race config never breaks the anchor plan
  }
}

/** True when a generated week's first parseable day predates `minIso`. */
function weekStartsBefore(week: TrainingWeek, minIso: string): boolean {
  for (const d of week.days) {
    const iso = parseDayToDate(d.day)
    if (iso) return iso < minIso
  }
  return false // undatable weeks are kept — never silently drop content
}

function appendLabeled(out: TrainingWeek[], weeks: TrainingWeek[], label: string) {
  for (const w of weeks) {
    out.push({ ...w, focus: `[${label}] ${w.focus}` })
  }
}
