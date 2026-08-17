import type { PlannedDay, SeasonRace, TrainingWeek } from '../../types'
import { isHyroxRaceInfo } from './planSeason'
import { parseDayToDate } from '../../utils/planDates'
import { stationSpecs, stationCircuit } from '../hyrox/spec'

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

/**
 * P3.5 — the layered Hyrox session progresses with its position in the
 * eligible run instead of repeating one static template (v1 shipped the
 * identical 'Wall balls 3×15 · …' Monday for 8 straight weeks — zero
 * progressive overload). Two alternating emphases (A: stations-volume,
 * B: strength-endurance + grip) so consecutive weeks never read the same,
 * with volumes ramping toward race spec across the run.
 */
function hyroxLayeredDay(day: PlannedDay, raceName: string, pos: number, totalEligible: number): PlannedDay {
  const t = totalEligible > 1 ? pos / (totalEligible - 1) : 1 // 0 → 1 across the eligible run
  const pct = 0.35 + 0.4 * t // station volumes: 35% → 75% of race spec while the run plan stays primary
  const specs = stationSpecs()
  const isA = pos % 2 === 0
  const detail = isA
    ? `STATIONS (progressive): ${stationCircuit(specs, pct)} · Moderate effort, crisp form. ` +
      `Layered toward ${raceName} — your run plan is unchanged.`
    : `STRENGTH-ENDURANCE: Walking lunges 3×${10 + Math.round(4 * t)}/leg · Wall balls ${Math.round((20 + 30 * t) / 5) * 5} unbroken sets · ` +
      `Farmer carry ${Math.round((60 + 80 * t) / 10) * 10}m @ race load · Burpee broad jumps ${Math.round((20 + 30 * t) / 5) * 5}m · ` +
      `GRIP: 2× dead hang to near-failure. Layered toward ${raceName} — your run plan is unchanged.`
  return {
    ...day,
    type: 'strength',
    workout: isA ? 'Hyrox prep — station volumes' : 'Hyrox prep — strength-endurance + grip',
    detail,
    zone: 'Z2–3',
    time: `${45 + Math.round(10 * t)} min`,
  }
}

export function layerSecondaryWork(
  anchorWeeks: TrainingWeek[],
  race: SeasonRace,
  anchorRaceIso: string,
  today: string,
): TrainingWeek[] {
  if (race.integration !== 'layered') return anchorWeeks
  if (!isHyroxRaceInfo(race.raceInfo)) return anchorWeeks

  // Guard boundary: no layered work inside the anchor's final 2 pre-race
  // weeks (taper is sacred) or race week.
  const guardIso = shiftIso(anchorRaceIso, -14)

  // Eligible = weeks whose first day is before the guard and that carry at
  // least one transformable, un-completed, not-in-the-past slot.
  const weekFirstIso = anchorWeeks.map(w => {
    for (const d of w.days) {
      const iso = parseDayToDate(d.day, w.dates, anchorRaceIso)
      if (iso) return iso
    }
    return null
  })
  const eligible: number[] = []
  anchorWeeks.forEach((w, i) => {
    const first = weekFirstIso[i]
    if (!first || first >= guardIso) return
    const hasSlot = w.days.some(d => TRANSFORMABLE.has(d.type) && !d.actual)
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
      const iso = parseDayToDate(d.day, w.dates, anchorRaceIso)
      if (iso && iso < today) continue // history stays history
      w.days[i] = hyroxLayeredDay(d, race.raceInfo.name, pos, eligible.length)
      applied++
    }
  })
  return out
}
