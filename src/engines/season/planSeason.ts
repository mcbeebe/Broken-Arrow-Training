import type {
  PlanAdvisory,
  Season,
  SeasonBlock,
  SeasonRace,
} from '../../types'
import { postRaceRecovery } from '../../utils/recovery'
import { raceDateToIso, sortedSeasonRaces } from './index'
import {
  BRIDGE_MAX_DAYS,
  BRIDGE_MIN_DAYS,
  MIN_PEAK_SPACING_DAYS,
  PROXIMITY_THRESHOLD_DAYS,
  TAPER_DAYS,
  residualsAtBridgeStart,
} from './residuals'

/**
 * The inter-event state machine (G1a) — the thing Garmin lacks.
 *
 * `planSeason` deterministically derives the whole block timeline from
 * `(races, today)`:
 *
 *   BUILD → TAPER → RACE → RECOVER → BRIDGE → BUILD → TAPER → RACE → …
 *
 * Locked design rule (plan §1-D2): season state is DERIVED on every call —
 * never stored as a mutable "current block" — so the engine cannot wedge
 * the way Garmin's post-race Daily Suggested Workouts documentedly do.
 * Whatever happens (a skipped race, a device offline for a month), the
 * next call recomputes a valid timeline from the calendar and today.
 *
 * Grammar (converged market grammar + our science layer, plan §7):
 *  - Only A and B races CHAIN (get recovery + their own build/taper);
 *    C races are trained through — a RACE day-stamp inside whatever block
 *    they fall in. A B race closer than PROXIMITY_THRESHOLD_DAYS to the
 *    next chained race is demoted to trained-through (+ advisory).
 *  - Tapers: A 14 d · B 7 d · C none (TAPER_DAYS), with Friel TSB tier
 *    targets carried by `taperTierTarget`.
 *  - RECOVER length comes from the shipped R5 formulas (postRaceRecovery).
 *  - BRIDGE is residual-aware: it exists only when the gap affords one
 *    (BRIDGE_MIN..BRIDGE_MAX days) and carries the residual profile at its
 *    start so content selection (blockWeeks.ts) is quantitative.
 */

export interface SeasonPlanResult {
  season: Season
  advisories: PlanAdvisory[]
}

interface DatedRace {
  race: SeasonRace
  iso: string
  /** True when this race gets its own recovery/build/taper chain. */
  chains: boolean
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T12:00:00`) - Date.parse(`${aIso}T12:00:00`)) / 86_400_000)
}

/** Detect a Hyrox event from the race facts (drives bridge emphasis). */
export function isHyroxRace(race: SeasonRace): boolean {
  const text = `${race.raceInfo.name} ${race.raceInfo.distance} ${race.raceInfo.description ?? ''}`.toLowerCase()
  return text.includes('hyrox')
}

export function planSeason(
  races: SeasonRace[],
  today: string,
): SeasonPlanResult {
  const advisories: PlanAdvisory[] = []

  // ── Resolve, sort, and classify the calendar ────────────────────
  const dated: DatedRace[] = []
  for (const race of sortedSeasonRaces({ races, blocks: [] })) {
    const iso = raceDateToIso(race.raceInfo.date)
    if (!iso) {
      advisories.push({
        id: `season_undated_race_${race.id}`,
        severity: 'caution',
        title: 'Race has no readable date',
        detail: `"${race.raceInfo.name}" has no parseable date, so the season plan can't place it.`,
        suggestion: 'Add a date to include it in the chained season.',
      })
      continue
    }
    if (race.status === 'skipped') continue
    dated.push({ race, iso, chains: race.priority !== 'C' })
  }

  // Proximity demotion: a B race too close to the NEXT chained race is
  // trained through (the exact edge Athletica's founder confirmed gets no
  // sport-specific taper; we make it explicit + honest).
  for (let i = 0; i < dated.length; i++) {
    const cur = dated[i]
    if (cur.race.priority !== 'B' || !cur.chains) continue
    const nextChained = dated.slice(i + 1).find(d => d.chains)
    if (nextChained && daysBetween(cur.iso, nextChained.iso) < PROXIMITY_THRESHOLD_DAYS + TAPER_DAYS[nextChained.race.priority]) {
      cur.chains = false
      advisories.push({
        id: `b_race_proximity_${cur.race.id}`,
        severity: 'info',
        title: 'B race trained through',
        detail: `"${cur.race.raceInfo.name}" sits too close to "${nextChained.race.raceInfo.name}" for its own taper and recovery.`,
        suggestion: 'It stays on the calendar as a hard training day — race it on tired legs by design.',
      })
    }
  }

  // Season-level honesty (plan G1a spec): too many A races wastes the
  // season (Friel: 1–2 per season); A peaks need ≥8 weeks apart.
  const aRaces = dated.filter(d => d.race.priority === 'A')
  if (aRaces.length >= 3) {
    advisories.push({
      id: 'season_too_many_a_races',
      severity: 'caution',
      title: `${aRaces.length} A races this season`,
      detail: 'Every A race demands a full peak and taper — three or more dilutes all of them (Friel: 1–2 A races per season).',
      suggestion: 'Consider B-tagging the one that matters least; it keeps a mini-taper without costing a build.',
    })
  }
  for (let i = 1; i < aRaces.length; i++) {
    const gap = daysBetween(aRaces[i - 1].iso, aRaces[i].iso)
    if (gap < MIN_PEAK_SPACING_DAYS) {
      advisories.push({
        id: `season_peaks_too_close_${aRaces[i].race.id}`,
        severity: 'caution',
        title: 'A races closer than 8 weeks',
        detail: `"${aRaces[i - 1].race.raceInfo.name}" → "${aRaces[i].race.raceInfo.name}" is ${gap} days — under the ~8 weeks a second full peak needs.`,
        suggestion: `The second build will be compressed. Consider B-tagging "${aRaces[i].race.raceInfo.name}" or "${aRaces[i - 1].race.raceInfo.name}".`,
      })
    }
  }

  // ── Derive the block timeline ───────────────────────────────────
  const blocks: SeasonBlock[] = []
  const chained = dated.filter(d => d.chains)
  const trainedThrough = dated.filter(d => !d.chains)

  let cursor = today
  let prev: DatedRace | null = null

  for (const cur of chained) {
    if (cur.iso < today) {
      // Past race: emit its RACE block for the record; recovery for a race
      // finished long ago is elapsed naturally via the cursor.
      blocks.push(raceBlock(cur))
      prev = cur
      cursor = maxIso(cursor, shiftIso(cur.iso, 1))
      continue
    }

    const taperDays = TAPER_DAYS[cur.race.priority]

    if (prev && prev.iso >= today) {
      // Chain from the previous future race: RECOVER → BRIDGE → BUILD.
      const recovery = postRaceRecovery(prev.race.raceInfo.distanceMiles || 13.1, {
        highVert: (prev.race.raceInfo.elevationGainFt ?? 0) > 100 * (prev.race.raceInfo.distanceMiles || 1),
      })
      const gap = daysBetween(prev.iso, cur.iso) - 1 // days strictly between
      const recoverDays = Math.min(recovery.restDays + 2, Math.max(2, gap)) // rest + 2 reverse-taper easy days
      const remaining = Math.max(0, gap - recoverDays - taperDays)

      // Bridge sizing: a real week when the gap affords one, growing with
      // surplus up to the residual-safe cap; skipped entirely when the
      // build needs every day it can get.
      const bridgeDays = remaining >= 35
        ? Math.min(Math.max(BRIDGE_MIN_DAYS, Math.round(remaining * 0.2)), BRIDGE_MAX_DAYS)
        : remaining >= 21 ? BRIDGE_MIN_DAYS : 0
      const buildDays = remaining - bridgeDays

      const recoverStart = shiftIso(prev.iso, 1)
      blocks.push({
        id: `recover_${prev.race.id}`,
        kind: 'RECOVER',
        raceId: prev.race.id,
        startDate: recoverStart,
        endDate: shiftIso(recoverStart, recoverDays - 1),
      })
      cursor = shiftIso(recoverStart, recoverDays)

      if (bridgeDays > 0) {
        blocks.push({
          id: `bridge_${cur.race.id}`,
          kind: 'BRIDGE',
          raceId: cur.race.id,
          startDate: cursor,
          endDate: shiftIso(cursor, bridgeDays - 1),
          residualsCarried: residualsAtBridgeStart(recoverDays),
        })
        cursor = shiftIso(cursor, bridgeDays)
      }

      if (buildDays > 0) {
        blocks.push({
          id: `build_${cur.race.id}`,
          kind: 'BUILD',
          raceId: cur.race.id,
          startDate: cursor,
          endDate: shiftIso(cursor, buildDays - 1),
        })
        cursor = shiftIso(cursor, buildDays)
      }
    } else {
      // First future race (or first after already-past races): everything
      // from today up to the taper is BUILD.
      const buildDays = Math.max(0, daysBetween(cursor, cur.iso) - taperDays)
      if (buildDays > 0) {
        blocks.push({
          id: `build_${cur.race.id}`,
          kind: 'BUILD',
          raceId: cur.race.id,
          startDate: cursor,
          endDate: shiftIso(cursor, buildDays - 1),
        })
        cursor = shiftIso(cursor, buildDays)
      }
    }

    if (taperDays > 0 && cur.iso > today) {
      const taperStart = shiftIso(cur.iso, -taperDays)
      blocks.push({
        id: `taper_${cur.race.id}`,
        kind: 'TAPER',
        raceId: cur.race.id,
        startDate: maxIso(taperStart, today),
        endDate: shiftIso(cur.iso, -1),
      })
    }

    blocks.push(raceBlock(cur))
    prev = cur
    cursor = shiftIso(cur.iso, 1)
  }

  // Trained-through races: a RACE day-stamp inside whatever block they
  // fall in — no transitions, exactly the C-race grammar.
  for (const tt of trainedThrough) {
    blocks.push(raceBlock(tt))
  }

  blocks.sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.kind === 'RACE' ? 1 : -1))

  return { season: { races, blocks }, advisories }
}

function raceBlock(d: DatedRace): SeasonBlock {
  return {
    id: `race_${d.race.id}`,
    kind: 'RACE',
    raceId: d.race.id,
    startDate: d.iso,
    endDate: d.iso,
  }
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b
}
