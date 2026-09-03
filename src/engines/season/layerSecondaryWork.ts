import type { PlannedDay, SeasonRace, TrainingWeek } from '../../types'
import { isHyroxRaceInfo } from './planSeason'
import { dayIsoInWeek } from '../../utils/planDates'
import { raceDateToIso } from './index'
import { stationSpecs, stationCircuit, type StationSpec } from '../hyrox/spec'
import { LAYERED_RAMP, LAYERED_EASED_MULT, MASTERS_RECOVERY } from '../hyrox/heuristics'

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
 *  - placement prefers the slot NOT adjacent to that week's quality or long
 *    run (measured by calendar date, so it sees across week boundaries); when
 *    every reachable slot is adjacent, the session is eased rather than
 *    skipped — a veto here just re-creates "we said we would layer it";
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

/** Day types a layered session must not crowd. Easy runs are not on this
 *  list on purpose — a station circuit the day after a shakeout costs the
 *  athlete nothing; the day beside the week's quality session or long run is
 *  the one that turns a compromise session into a wrecked run. */
const HARD_TYPES = new Set<PlannedDay['type']>(['quality', 'long', 'race'])

/** The one station whose cost is landing impact rather than work. Masters
 *  athletes drop it: 80 m of an hour-long race, and repeated broad-jump
 *  landings are what connective tissue recovers from slowest with age. The
 *  threshold is MASTERS_RECOVERY's — the engine gets one masters line, not two. */
const MASTERS_DROPPED_STATION: StationSpec['key'] = 'burpee_broad_jump'

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
  /** D4 — the chosen slot still sits the day before or after a quality or
   *  long run. The session is eased, never dropped: see EASED_NOTE. */
  eased: boolean,
  /** Masters athlete (age ≥ MASTERS_RECOVERY threshold) — the broad jumps are
   *  already out of `specs`, so this only picks the substitute and the note. */
  masters: boolean,
): PlannedDay {
  const t = totalEligible > 1 ? pos / (totalEligible - 1) : 1 // 0 → 1 across the eligible run
  const ramp = LAYERED_RAMP.value
  const mult = eased ? LAYERED_EASED_MULT.value : 1
  const pct = (ramp.startPct + (ramp.endPct - ramp.startPct) * t) * mult // submaximal by doctrine: the anchor race owns the plan
  const isA = (pos + doseIndexInWeek) % 2 === 0
  // Read by key, never by index: masters athletes have a station removed from
  // `specs`, and `specs[5]` silently became the sandbag lunges for them — a
  // farmer carry prescribed at the sandbag's load.
  const carryLoad = specs.find(s => s.key === 'farmers_carry')?.load ?? ''
  // Plyometrics are the first thing out when the legs are spoken for: the
  // landing load is what carries into the next day's run, and it is the one
  // demand here with no running transfer to repay it. The swap happens on the
  // SPEC LIST as well as the strength template — the circuit renders straight
  // from `specs`, so a template-only swap left the jumps in on every other day
  // and made both notes below false.
  const dropJumps = masters || eased
  const daySpecs = eased ? specs.filter(sp => sp.key !== MASTERS_DROPPED_STATION) : specs
  const stepUps = `Step-ups ${Math.max(8, Math.round((12 + 8 * t) * mult))}/leg, box at knee height`
  const detail = isA
    ? `STATIONS (progressive): ${stationCircuit(daySpecs, pct)}${dropJumps ? ` · ${stepUps}` : ''} · Moderate effort, crisp form. ` +
      `Layered toward ${raceName} — your run plan is unchanged.`
    : `STRENGTH-ENDURANCE: Walking lunges 3×${10 + Math.round(4 * t)}/leg · Wall balls ${Math.round((20 + 30 * t) * mult / 5) * 5} unbroken sets · ` +
      `Farmer carry ${Math.round((60 + 80 * t) * mult / 10) * 10}m @ ${carryLoad} · ` +
      `${dropJumps ? stepUps : `Burpee broad jumps ${Math.round((20 + 30 * t) / 5) * 5}m`} · ` +
      `GRIP: 2× dead hang to near-failure. Layered toward ${raceName} — your run plan is unchanged.`
  // Say what was changed and why, on the day itself. An eased session that
  // looks like a full one just reads as a plan that shrank for no reason.
  const notes = [
    eased ? EASED_NOTE : null,
    masters ? MASTERS_NOTE : null,
  ].filter((n): n is string => n !== null)
  // Replacing `detail` wholesale used to delete the injury-prehab block the
  // running generator had already appended — measured, a knee-injury athlete
  // lost prehab on half their weeks the moment they opted into layering.
  const prehabTail = day.detail.match(PREHAB_TAIL)?.[1]
  return {
    ...day,
    type: 'strength',
    workout: isA ? 'Hyrox prep — station volumes' : 'Hyrox prep — strength-endurance + grip',
    detail: [detail, ...notes, prehabTail].filter(Boolean).join(' · '),
    zone: eased ? 'Z2' : 'Z2–3',
    time: `${Math.round((45 + Math.round(10 * t)) * mult / 5) * 5} min`,
  }
}

const EASED_NOTE =
  `EASED: a quality or long run sits the day beside this one, so volume is ` +
  `${Math.round((1 - LAYERED_EASED_MULT.value) * 100)}% down and the jumps are out. ` +
  `The run is the session that matters this week — this one bends around it.`

const MASTERS_NOTE =
  'Burpee broad jumps are out of your build: repeated landing impact is the one demand in this race ' +
  'that does not repay a masters athlete. Step-ups drive the same hip extension. Practise the jumps ' +
  'once inside your race-week rehearsal, not as weekly volume.'

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

/**
 * Can this anchor race format lend slots to a layered Hyrox build at all?
 * Exported so the UI never OFFERS a choice the engine will refuse, and never
 * claims layering happened where it cannot happen (D6). One predicate, one
 * answer — the previous shape had the engine's rule in one file and the
 * letter's claim in another, and they disagreed for every Hyrox anchor.
 */
export function canLayerOntoAnchor(anchorRaceType: string | null | undefined): boolean {
  if (!anchorRaceType) return true // unknown → legacy callers stay permitted
  return LAYERABLE_ANCHOR.has(anchorRaceType)
}

/** Why nothing was layered, when nothing was. */
export type LayerRefusal =
  /** The athlete never asked for it (integration is sequential or unset). */
  | 'not-requested'
  /** The second race has no Hyrox content to layer. */
  | 'not-hyrox'
  /** The anchor race's own build has no ordinary slots to lend. */
  | 'anchor-format'
  /** Asked for, allowed, but no week could carry a dose — runway too short,
   *  every week protected, the race already run, or every slot spoken for. */
  | 'no-eligible-weeks'

/** What the transform ACTUALLY did, so nothing downstream has to guess.
 *  D6: the app told the athlete "1–2 sessions/week are layered in" on the
 *  strength of the REQUEST, never the outcome — including for the anchors
 *  where the engine refuses outright and the athlete got zero. */
export interface LayerReport {
  raceName: string
  refusal: LayerRefusal | null
  /** Layered days actually placed. */
  sessions: number
  /** Weeks that carry at least one. */
  weeks: number
  /** Of `sessions`, how many had to be eased around a hard run. */
  eased: number
  /** Calendar span of the layered work, when there is any. */
  firstIso: string | null
  lastIso: string | null
}

/**
 * The reporting form. `layerSecondaryWork` is the thin wrapper for callers
 * that only want the weeks; every guard below returns a REPORT rather than
 * silently returning the input, which is what let the UI keep claiming
 * layering it never got.
 */
export function layerSecondaryWorkReport(
  anchorWeeks: TrainingWeek[],
  race: SeasonRace,
  anchorRaceIso: string,
  today: string,
  /** The athlete's own division/sex/age, and the ANCHOR race's type — a Hyrox
   *  or General Fitness anchor is never layered over. */
  athlete?: { hyroxDivision?: 'open' | 'pro'; sex?: string; age?: number; anchorRaceType?: string },
): { weeks: TrainingWeek[]; report: LayerReport } {
  const raceName = race.raceInfo?.name ?? 'this race'
  const refused = (refusal: LayerRefusal) => ({
    weeks: anchorWeeks,
    report: { raceName, refusal, sessions: 0, weeks: 0, eased: 0, firstIso: null, lastIso: null },
  })
  if (race.integration !== 'layered') return refused('not-requested')
  if (!isHyroxRaceInfo(race.raceInfo)) return refused('not-hyrox')
  if (!canLayerOntoAnchor(athlete?.anchorRaceType)) return refused('anchor-format')
  // P3.1 — layered sessions render from THIS race's division and the
  // athlete's sex, never the men's Open default (v1 prescribed 152 kg sled
  // pushes to every woman on this path).
  const allSpecs = stationSpecs(
    race.raceInfo.hyroxDivision ?? athlete?.hyroxDivision ?? 'open',
    athlete?.sex === 'female' ? 'female' : 'male',
  )
  // The masters swap happens on the SPEC LIST, not on the strength template
  // alone — the station circuit renders straight from `specs`, so filtering
  // only the template left every masters athlete still doing 80 m of broad
  // jumps on every other layered day.
  const masters = (athlete?.age ?? 0) >= MASTERS_RECOVERY.value.ageThreshold
  const specs = masters ? allSpecs.filter(sp => sp.key !== MASTERS_DROPPED_STATION) : allSpecs

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
  // D4 — every hard day in the whole build, by calendar date, so adjacency is
  // measured across week boundaries too: a Sunday slot is one day after the
  // previous week's Saturday long run, and the old first-slot-wins scan had no
  // way to see that at all.
  const hardIsos = new Set<string>()
  for (const w of anchorWeeks) {
    for (const d of w.days) {
      if (!HARD_TYPES.has(d.type)) continue
      const iso = dayIsoInWeek(d.day, w, anchorRaceIso)
      if (iso) hardIsos.add(iso)
    }
  }
  const crowding = (iso: string | null): number =>
    iso === null ? 0 : (hardIsos.has(shiftIso(iso, -1)) ? 1 : 0) + (hardIsos.has(shiftIso(iso, 1)) ? 1 : 0)

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
  if (eligible.length === 0) return refused('no-eligible-weeks')

  // Escalation: the second half of eligible weeks gets 2 sessions/week.
  const midStart = Math.ceil(eligible.length / 2)

  const out = anchorWeeks.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
  const placed: { iso: string | null; eased: boolean }[] = []
  const weeksTouched = new Set<number>()
  eligible.forEach((weekIdx, pos) => {
    const doses = pos >= midStart ? 2 : 1
    const w = out[weekIdx]
    const candidates: { i: number; crowded: boolean }[] = []
    for (let i = 0; i < w.days.length; i++) {
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
      candidates.push({ i, crowded: crowding(iso) > 0 })
    }
    // Least-crowded slot first, plan order among equals. This is a PREFERENCE,
    // never a veto: rejecting crowded slots outright zeroed layering for half
    // the measured configurations — in an ordinary 5-day week every strength
    // and cross slot touches something hard — which is just the "we said we
    // would layer it and we didn't" defect wearing a safety label. The dose
    // count never changes; what adjacency changes is the CONTENT.
    candidates.sort((a, b) => Number(a.crowded) - Number(b.crowded) || a.i - b.i)
    candidates.slice(0, doses).forEach((c, doseIndexInWeek) => {
      w.days[c.i] = hyroxLayeredDay(
        w.days[c.i], race.raceInfo.name, pos, eligible.length, specs, doseIndexInWeek, c.crowded, masters,
      )
      placed.push({ iso: dayIsoInWeek(w.days[c.i].day, w, anchorRaceIso), eased: c.crowded })
      weeksTouched.add(weekIdx)
    })
  })
  const isos = placed.map(p => p.iso).filter((i): i is string => i !== null).sort()
  const report: LayerReport = {
    raceName,
    // Asked for, allowed, and yet nothing landed — every candidate was
    // completed, already claimed by an earlier layered race, or past the
    // guard. That is still zero sessions, and it must read as zero.
    refusal: placed.length === 0 ? 'no-eligible-weeks' : null,
    sessions: placed.length,
    weeks: weeksTouched.size,
    eased: placed.filter(p => p.eased).length,
    firstIso: isos[0] ?? null,
    lastIso: isos[isos.length - 1] ?? null,
  }
  return { weeks: out, report }
}

/** Weeks only — the shape every existing caller wants. */
export function layerSecondaryWork(
  anchorWeeks: TrainingWeek[],
  race: SeasonRace,
  anchorRaceIso: string,
  today: string,
  athlete?: { hyroxDivision?: 'open' | 'pro'; sex?: string; age?: number; anchorRaceType?: string },
): TrainingWeek[] {
  return layerSecondaryWorkReport(anchorWeeks, race, anchorRaceIso, today, athlete).weeks
}
