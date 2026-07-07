import { expect } from 'vitest'
import type { Season, SeasonBlockKind } from '../../types'

/**
 * Season test assertions (G1 harness — docs/gap-closure-build-plan.md §0).
 * Written in PR-1 so PR-6's engine tests read as specs; the block-sequence
 * and window checks below encode the state-machine grammar and the
 * science bounds the engine must satisfy.
 */

/** Assert the season's blocks, in date order, follow exactly `kinds`. */
export function expectBlockSequence(season: Season, kinds: SeasonBlockKind[]) {
  const ordered = [...season.blocks].sort((a, b) => a.startDate.localeCompare(b.startDate))
  expect(ordered.map(b => b.kind)).toEqual(kinds)
}

/** Assert every block's dates are coherent and non-overlapping in order. */
export function expectCoherentBlockDates(season: Season) {
  const ordered = [...season.blocks].sort((a, b) => a.startDate.localeCompare(b.startDate))
  for (const b of ordered) {
    expect(b.startDate <= b.endDate, `block ${b.id} (${b.kind}) start after end`).toBe(true)
  }
  for (let i = 1; i < ordered.length; i++) {
    expect(
      ordered[i - 1].endDate < ordered[i].startDate,
      `blocks ${ordered[i - 1].id} and ${ordered[i].id} overlap`,
    ).toBe(true)
  }
}

/** Assert every block references a race that exists in the season. */
export function expectBlocksReferenceRaces(season: Season) {
  const raceIds = new Set(season.races.map(r => r.id))
  for (const b of season.blocks) {
    expect(raceIds.has(b.raceId), `block ${b.id} references unknown race ${b.raceId}`).toBe(true)
  }
}

/** Days between two ISO dates (end - start). */
export function daysBetweenIso(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86_400_000)
}

/** Assert consecutive A-race peaks are at least `minWeeks` apart —
 *  the ≥8-week rule (TrainerRoad hard rule; plan §6 traceability). */
export function expectPeakSpacing(season: Season, minWeeks = 8) {
  const aDates = season.races
    .filter(r => r.priority === 'A')
    .map(r => r.raceInfo.date)
  for (let i = 1; i < aDates.length; i++) {
    const gapDays = daysBetweenIso(isoOf(aDates[i - 1]), isoOf(aDates[i]))
    expect(gapDays >= minWeeks * 7, `A races ${i - 1}→${i} only ${gapDays}d apart`).toBe(true)
  }
}

function isoOf(freeTextDate: string): string {
  const raw = freeTextDate.match(/\w+,\s*(.+)/)?.[1] || freeTextDate
  const d = new Date(raw)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}
