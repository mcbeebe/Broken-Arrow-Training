/**
 * The season, block by block — the structural answer to "what is the
 * whole plan, and why is it shaped like this?"
 *
 * `methodologyContext.ts` explains the METHOD (philosophy, periodization
 * theory, citations). This explains THIS plan: which weeks belong to which
 * block, what each block is actually for, what the volume does across it,
 * which sessions carry it, and where the athlete is standing right now.
 *
 * Pure and deterministic — derived from the plan weeks themselves rather
 * than from method metadata, so a season-spliced multi-race chain (whose
 * blocks come from different methods) describes itself correctly.
 */
import type { TrainingPlan, TrainingWeek, RaceInfo, Season } from '../types'
import { raceDateToIso } from '../engines/season'
import { todayDateString } from './planDates'

export type BlockId = 'base' | 'build' | 'peak' | 'taper' | 'race'

export interface SeasonBlock {
  id: BlockId
  label: string
  /** 1-indexed, inclusive. */
  weekFrom: number
  weekTo: number
  /** e.g. "Sep 1 – Oct 5" — empty when weeks carry no startIso. */
  dateRange: string
  /** e.g. "24–38 mi" — the volume arc across the block. */
  volumeRange: string
  /** What this block is FOR, in plain English. */
  job: string
  /** The distinct hard sessions that carry the block (max 4). */
  keySessions: string[]
  /** True for the block containing today. */
  isCurrent: boolean
}

export interface SeasonPosition {
  weekNum: number
  totalWeeks: number
  blockId: BlockId
  daysToRace: number | null
  /** Completed share of the plan, 0–1. */
  progress: number
}

export interface SeasonStructure {
  raceName: string
  blocks: SeasonBlock[]
  position: SeasonPosition | null
  /** Total prescribed miles across every week. */
  totalMiles: number
  peakWeekMiles: number
  peakWeekNum: number
  /** Every race in the season, earliest first (multi-race only). */
  races: { name: string; dateIso: string; isPrimary: boolean; priority?: string }[]
}

const BLOCK_LABEL: Record<BlockId, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
}

const BLOCK_JOB: Record<BlockId, string> = {
  base:
    'Build the aerobic floor. These weeks are mostly easy running because that is what grows the engine — more capillaries, better fat use, tendons and bones that tolerate load. Nothing here is supposed to feel impressive; it is supposed to be repeatable.',
  build:
    'Make the fitness race-specific. Volume keeps climbing but the quality work now looks like the demands of race day, so the engine you built in base learns to work at the effort the race asks for.',
  peak:
    'The heaviest the plan gets. This block is meant to feel hard — you are deliberately accumulating more fatigue than you can absorb week to week, because the taper is what converts it. Judge these weeks on completion, not on how you feel.',
  taper:
    'Spend less, keep everything. Volume drops sharply while intensity stays sharp, so accumulated fatigue clears and the fitness underneath surfaces. Feeling restless and undertrained here is the taper working, not a warning.',
  race:
    'Arrive fresh. Nothing this week adds fitness and plenty can subtract it. Short, easy, familiar — the job is sleep, food, logistics, and a rested start line.',
}

function milesOf(w: TrainingWeek): number {
  return typeof w.miles === 'number' ? w.miles : parseFloat(String(w.miles)) || 0
}

/** Classify each week. Mirrors raceNarrative's phase logic (remaining-weeks
 *  based) so the two surfaces never disagree about what block you're in. */
export function blockForWeek(weekNum: number, totalWeeks: number): BlockId {
  const remaining = totalWeeks - weekNum
  if (remaining === 0) return 'race'
  if (remaining === 1) return 'taper'
  if (remaining === 2) return 'peak'
  if (weekNum <= Math.floor(totalWeeks * 0.3)) return 'base'
  return 'build'
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dateRangeFor(weeks: TrainingWeek[]): string {
  const first = weeks[0]?.startIso
  const last = weeks[weeks.length - 1]?.startIso
  if (!first || !last) return ''
  const end = new Date(`${last}T12:00:00`)
  end.setDate(end.getDate() + Math.max(0, (weeks[weeks.length - 1].days?.length ?? 7) - 1))
  return `${fmtDate(first)} – ${fmtDate(end.toISOString().slice(0, 10))}`
}

/** The hard sessions that define a block, de-duplicated and de-numbered so
 *  "6×800m" and "8×800m" collapse into one entry. */
function keySessionsFor(weeks: TrainingWeek[]): string[] {
  const seen = new Map<string, string>()
  for (const w of weeks) {
    for (const d of w.days) {
      if (d.type !== 'quality' && d.type !== 'long') continue
      const name = d.workout.replace(/^\s*BENCHMARK:\s*/i, 'Benchmark: ').trim()
      const key = name.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ')
      if (!seen.has(key)) seen.set(key, name)
    }
  }
  return [...seen.values()].slice(0, 4)
}

function weekIndexForToday(weeks: TrainingWeek[], todayIso: string): number {
  for (let i = 0; i < weeks.length; i++) {
    const start = weeks[i].startIso
    if (!start) continue
    const offset = Math.round(
      (Date.parse(`${todayIso}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / 86_400_000,
    )
    if (offset >= 0 && offset < (weeks[i].days?.length ?? 7)) return i
  }
  return -1
}

export function buildSeasonStructure(
  plan: TrainingPlan,
  opts?: { season?: Season | null; todayIso?: string },
): SeasonStructure {
  const todayIso = opts?.todayIso ?? todayDateString()
  const weeks = plan.weeks
  const total = weeks.length
  const todayIdx = weekIndexForToday(weeks, todayIso)
  const currentBlock = todayIdx >= 0 ? blockForWeek(todayIdx + 1, total) : null

  // Group consecutive weeks by block.
  const blocks: SeasonBlock[] = []
  let runStart = 0
  for (let i = 0; i <= total; i++) {
    const here = i < total ? blockForWeek(i + 1, total) : null
    const prev = blockForWeek(runStart + 1, total)
    if (here === prev && i < total) continue
    const slice = weeks.slice(runStart, i)
    if (slice.length > 0) {
      const mi = slice.map(milesOf).filter(m => m > 0)
      const lo = mi.length ? Math.min(...mi) : 0
      const hi = mi.length ? Math.max(...mi) : 0
      blocks.push({
        id: prev,
        label: BLOCK_LABEL[prev],
        weekFrom: runStart + 1,
        weekTo: i,
        dateRange: dateRangeFor(slice),
        volumeRange: hi === 0 ? '' : lo === hi ? `${Math.round(hi)} mi` : `${Math.round(lo)}–${Math.round(hi)} mi`,
        job: BLOCK_JOB[prev],
        keySessions: keySessionsFor(slice),
        isCurrent: currentBlock === prev && todayIdx + 1 >= runStart + 1 && todayIdx + 1 <= i,
      })
    }
    runStart = i
  }

  const allMiles = weeks.map(milesOf)
  const peakWeekMiles = allMiles.length ? Math.max(...allMiles) : 0
  const peakWeekNum = allMiles.indexOf(peakWeekMiles) + 1

  const raceIso = plan.race ? raceDateToIso(plan.race.date) : null
  const daysToRace = raceIso
    ? Math.round((Date.parse(`${raceIso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86_400_000)
    : null

  return {
    raceName: plan.race?.name?.trim() || 'your race',
    blocks,
    position: todayIdx >= 0
      ? {
          weekNum: todayIdx + 1,
          totalWeeks: total,
          blockId: blockForWeek(todayIdx + 1, total),
          daysToRace,
          progress: total > 0 ? (todayIdx + 1) / total : 0,
        }
      : null,
    totalMiles: Math.round(allMiles.reduce((a, b) => a + b, 0)),
    peakWeekMiles: Math.round(peakWeekMiles),
    peakWeekNum,
    races: racesOf(opts?.season, plan.race),
  }
}

function racesOf(season: Season | null | undefined, anchor: RaceInfo | undefined) {
  if (!season) return []
  const dated = season.races
    .map(r => ({ r, iso: raceDateToIso(r.raceInfo.date) }))
    .filter((x): x is { r: (typeof season.races)[number]; iso: string } => x.iso !== null)
    .sort((a, b) => a.iso.localeCompare(b.iso))
  if (dated.length < 2) return []
  return dated.map(({ r, iso }) => ({
    name: r.raceInfo.name || (anchor?.name ?? 'Race'),
    dateIso: iso,
    isPrimary: !!r.isPrimary,
    priority: r.priority,
  }))
}
