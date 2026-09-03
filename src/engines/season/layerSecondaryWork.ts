import type { PlannedDay, SeasonRace, TrainingWeek } from '../../types'
import { isHyroxRaceInfo } from './planSeason'
import { dayIsoInWeek } from '../../utils/planDates'
import { raceDateToIso } from './index'
import { stationSpecs, stationCircuit, type StationSpec } from '../hyrox/spec'
import { LAYERED_RAMP } from '../hyrox/heuristics'

/**
 * Layered multi-race preparation (user-directed): a season race marked
 * `integration: 'layered'` contributes race-specific work INSIDE the
 * anchor race's build instead of waiting for its own post-anchor block —
 * a Hyrox 6 weeks after a half marathon cannot be prepared in the gap
 * alone.
 *
 * Mechanics (compromise-session doctrine — never add load):
 *  - transforms EXISTING strength/cross slots only; run days, run volume,
 *    and the week's day count are untouched;
 *  - 1 session/week through the first half of eligible weeks, 2/week in
 *    the second half (escalation toward the anchor race, after which the
 *    dedicated block takes over);
 *  - hard guards: nothing inside the anchor's final 2 pre-race weeks or
 *    race week, nothing on completed days, nothing dated before `today`
 *    (derived state never rewrites history);
 *  - content is defined for Hyrox-format races; other formats pass
 *    through unchanged (their running prep already transfers).
 *
 * Pure and derived: applied inside spliceSeasonWeeks on every render,
 * never persisted. `integration` is asked and confirmed with the athlete
 * — this transform never runs on an unset/sequential race.
 */

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

const TRANSFORMABLE = new Set<PlannedDay['type']>(['strength', 'cross'])

/** A day this transform already produced (possibly for another race). */
function isLayered(day: PlannedDay): boolean {
  return /^Hyrox prep — /.test(day.workout)
}

/**
 * P3.5 — the layered Hyrox session progresses with its position in the
 * eligible run instead of repeating one static template (v1 shipped the
 * identical 'Wall balls 3×15 · …' Monday for 8 straight weeks — zero
 * progressive overload). Two alternating emphases (A: stations-volume,
 * B: strength-endurance + grip) so consecutive weeks never read the same,
 * with volumes ramping toward race spec across the run.
 */
/** The P4.3 prehab block the running generator appends to every strength /
 *  cross day, if this day carries one. Matched from the marker to the end of
 *  the string — note GENERIC_BLOCK is `PREHAB: …` with no parenthesis
 *  (prehab.ts), which is exactly what an athlete gets when they report an
 *  injury and name no area, so a `'PREHAB ('` matcher would drop it for them. */
const PREHAB_TAIL = /(?:^|· )(PREHAB[ (:].*)$/

function hyroxLayeredDay(
  day: PlannedDay,
  raceName: string,
  pos: number,
  totalEligible: number,
  specs: StationSpec[],
  /** Which dose this is within its week (0-based) — so two sessions in the
   *  same week alternate emphasis instead of rendering byte-identically. */
  doseIndexInWeek: number,
): PlannedDay {
  const t = totalEligible > 1 ? pos / (totalEligible - 1) : 1 // 0 → 1 across the eligible run
  const ramp = LAYERED_RAMP.value
  const pct = ramp.startPct + (ramp.endPct - ramp.startPct) * t // submaximal by doctrine: the anchor race owns the plan
  const isA = (pos + doseIndexInWeek) % 2 === 0
  const detail = isA
    ? `STATIONS (progressive): ${stationCircuit(specs, pct)} · Moderate effort, crisp form. ` +
      `Layered toward ${raceName} — your run plan is unchanged.`
    : `STRENGTH-ENDURANCE: Walking lunges 3×${10 + Math.round(4 * t)}/leg · Wall balls ${Math.round((20 + 30 * t) / 5) * 5} unbroken sets · ` +
      `Farmer carry ${Math.round((60 + 80 * t) / 10) * 10}m @ ${specs[5].load} · Burpee broad jumps ${Math.round((20 + 30 * t) / 5) * 5}m · ` +
      `GRIP: 2× dead hang to near-failure. Layered toward ${raceName} — your run plan is unchanged.`
  // Replacing `detail` wholesale used to delete the injury-prehab block the
  // running generator had already appended — measured, a knee-injury athlete
  // lost prehab on half their weeks the moment they opted into layering.
  const prehabTail = day.detail.match(PREHAB_TAIL)?.[1]
  return {
    ...day,
    type: 'strength',
    workout: isA ? 'Hyrox prep — station volumes' : 'Hyrox prep — strength-endurance + grip',
    detail: prehabTail ? `${detail} · ${prehabTail}` : detail,
    zone: 'Z2–3',
    time: `${45 + Math.round(10 * t)} min`,
  }
}

/** Weeks whose own job outranks a layered session: the anchor's taper and
 *  race week, and any cutback / recovery week. The running generator's focus
 *  vocabulary is exactly 'Taper' | 'Cutback' | phase.name, so this cannot
 *  match a build week by accident. */
const PROTECTED_WEEK = /taper|cutback|recover|race\s*week|deload/i

/** Anchor race types whose build has ordinary strength/cross slots to lend.
 *  A Hyrox anchor already trains every station to full spec and benchmarks
 *  strength twice; layering over it overwrote 19 of its own days, including
 *  the only full-spec rehearsal. A General Fitness anchor is strength-led for
 *  the same reason. Unknown (legacy callers) stays permitted. */
const LAYERABLE_ANCHOR = new Set(['road', 'trail'])

export function layerSecondaryWork(
  anchorWeeks: TrainingWeek[],
  race: SeasonRace,
  anchorRaceIso: string,
  today: string,
  /** The athlete's own division/sex, and the ANCHOR race's type — a Hyrox or
   *  General Fitness anchor is never layered over. */
  athlete?: { hyroxDivision?: 'open' | 'pro'; sex?: string; anchorRaceType?: string },
): TrainingWeek[] {
  if (race.integration !== 'layered') return anchorWeeks
  if (!isHyroxRaceInfo(race.raceInfo)) return anchorWeeks
  if (athlete?.anchorRaceType && !LAYERABLE_ANCHOR.has(athlete.anchorRaceType)) return anchorWeeks
  // P3.1 — layered sessions render from THIS race's division and the
  // athlete's sex, never the men's Open default (v1 prescribed 152 kg sled
  // pushes to every woman on this path).
  const specs = stationSpecs(
    race.raceInfo.hyroxDivision ?? athlete?.hyroxDivision ?? 'open',
    athlete?.sex === 'female' ? 'female' : 'male',
  )

  // Guard boundary: no layered work inside the anchor's final 2 pre-race
  // weeks (taper is sacred) or race week — and never past the layered race's
  // own date, since nothing in the app ever marks a race completed and the
  // ramp otherwise kept prescribing prep for a race already run.
  const anchorGuard = shiftIso(anchorRaceIso, -14)
  const raceIso = raceDateToIso(race.raceInfo.date)
  const guardIso = raceIso && raceIso < anchorGuard ? raceIso : anchorGuard

  // Eligible = weeks that start before the guard, are not the anchor's own
  // taper / cutback / recovery, and carry at least one transformable,
  // un-completed, not-in-the-past, not-already-layered slot.
  const weekFirstIso = anchorWeeks.map(w => {
    for (const d of w.days) {
      const iso = dayIsoInWeek(d.day, w, anchorRaceIso)
      if (iso) return iso
    }
    return null
  })
  const eligible: number[] = []
  anchorWeeks.forEach((w, i) => {
    const first = weekFirstIso[i]
    if (!first || first >= guardIso) return
    if (PROTECTED_WEEK.test(w.focus)) return
    const hasSlot = w.days.some(d => TRANSFORMABLE.has(d.type) && !d.actual && !isLayered(d))
    if (hasSlot) eligible.push(i)
  })
  if (eligible.length === 0) return anchorWeeks

  // Escalation: the second half of eligible weeks gets 2 sessions/week.
  const midStart = Math.ceil(eligible.length / 2)

  const out = anchorWeeks.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
  eligible.forEach((weekIdx, pos) => {
    const doses = pos >= midStart ? 2 : 1
    let applied = 0
    const w = out[weekIdx]
    for (let i = 0; i < w.days.length && applied < doses; i++) {
      const d = w.days[i]
      if (!TRANSFORMABLE.has(d.type) || d.actual) continue
      // A second layered race must not re-render the first's sessions at its
      // own loads and label them toward the later race.
      if (isLayered(d)) continue
      const iso = dayIsoInWeek(d.day, w, anchorRaceIso)
      if (iso && iso < today) continue // history stays history
      // Per-DAY guard, not per-week: a week straddling the boundary used to
      // leak a dose past it.
      if (iso && iso >= guardIso) continue
      w.days[i] = hyroxLayeredDay(d, race.raceInfo.name, pos, eligible.length, specs, applied)
      applied++
    }
  })
  return out
}
