import type { SeasonBlock } from '../../types'
import type { SeasonPlanResult } from './planSeason'
import { isHyroxRace } from './planSeason'
import { bridgeEmphasis, taperTierTarget } from './residuals'
import { raceDateToIso } from './index'

/**
 * SEASON coach narration (G1b) — no competitor's AI can explain a season.
 * Produces the grounded context string `build_context_block` renders as the
 * SEASON section: where the athlete is in the chain, what this block
 * protects, and why today serves the NEXT race. Null for single-race
 * athletes — the guard: no phantom season narration.
 */

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T12:00:00`) - Date.parse(`${aIso}T12:00:00`)) / 86_400_000)
}

function blockPurpose(block: SeasonBlock, result: SeasonPlanResult): string {
  const race = result.season.races.find(r => r.id === block.raceId)
  const raceName = race?.raceInfo.name ?? 'the next race'
  switch (block.kind) {
    case 'RECOVER':
      return `RECOVER after ${raceName} — the training today IS recovery: rest first, then easy reverse-taper movement; no quality until this block ends.`
    case 'BRIDGE': {
      const nextIsHyrox = race ? isHyroxRace(race) : false
      return `BRIDGE toward ${raceName} — ${bridgeEmphasis(nextIsHyrox).rationale}`
    }
    case 'BUILD':
      return `BUILD toward ${raceName} — the main work of this chain; today's session exists to make that race day possible.`
    case 'TAPER': {
      const tier = race ? taperTierTarget(race.priority) : null
      return `TAPER into ${raceName}${tier ? ` — shedding fatigue toward a race-day form balance of +${tier.tsbLow}..+${tier.tsbHigh} (A-race tier)` : ''}. Less is the plan.`
    }
    case 'RACE':
      return `RACE: ${raceName} is here.`
  }
}

export function buildSeasonContext(result: SeasonPlanResult, today: string): string | null {
  const { season, advisories } = result
  if (season.races.length < 2) return null // single race = no season narration (guard)

  const current = season.blocks.find(b => b.startDate <= today && today <= b.endDate)
  const nextRace = season.races
    .map(r => ({ r, iso: raceDateToIso(r.raceInfo.date) }))
    .filter((x): x is { r: typeof x.r; iso: string } => !!x.iso && x.iso >= today)
    .sort((a, b) => a.iso.localeCompare(b.iso))[0]

  const calendar = season.races
    .map(r => `${r.raceInfo.name} (${r.priority}${raceDateToIso(r.raceInfo.date) ? `, ${raceDateToIso(r.raceInfo.date)}` : ''})`)
    .join(' · ')

  const parts: string[] = [`Season calendar: ${calendar}.`]
  if (current) parts.push(`Current block: ${blockPurpose(current, result)}`)
  if (nextRace) parts.push(`Next race: ${nextRace.r.raceInfo.name} in ${daysBetween(today, nextRace.iso)} days.`)
  const seasonAdvisories = advisories.filter(a => a.id.startsWith('season_') || a.id.startsWith('b_race_'))
  if (seasonAdvisories.length > 0) {
    parts.push(`Season advisories: ${seasonAdvisories.map(a => `${a.title} — ${a.detail}`).join(' · ')}`)
  }
  return parts.join(' ')
}
