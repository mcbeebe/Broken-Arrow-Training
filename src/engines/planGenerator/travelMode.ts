/**
 * Travel mode — consume the trip the athlete already told us about.
 *
 * Onboarding collects "Travel, blackout dates, or other constraints" and
 * its placeholder promises behaviour ("Travel May 15–22, no equipment").
 * Until now that note was written once and read by nothing: known trips
 * rotted into "Missed?" chips and amber Monday reviews. This module turns
 * a declared trip (date range + what kit is on hand) into ONE undoable
 * batch of equipment-aware day substitutions, applied through the same
 * `usePlanEdits` op-log a coach proposal rides on — so Undo is free and
 * the base plan is never mutated.
 *
 * DOCTRINE (inherited from replan.ts — travel is a planned interruption):
 *  - A travel adaptation never INCREASES a day's or a week's volume. Every
 *    substitution swaps down or sideways, never up. Enforced by construction
 *    (non-running swaps carry zone "—" → 0 estimated miles) and asserted.
 *  - Race day is never rewritten. Rest and existing travel days are left
 *    exactly as they are.
 *  - A key long session is preserved, not deleted: when the kit can't
 *    support running away, the long run is moved to a legal home day in the
 *    same week rather than lost — and only when that move is clean (no
 *    three-consecutive-hard violation). Otherwise it adapts in place.
 *  - The mileage a travel week displays is recomputed from its adapted days
 *    so the total never lies (the "week.miles = sum of days" contract).
 */
import type {
  TrainingWeek,
  PlannedDay,
  PlanEditOpInput,
  DayUpdates,
} from '../../types'

/**
 * What the athlete has to train with while away. A single honest choice,
 * ordered from most to least capable — the substitution branches on it the
 * way `suggestIndoorSwap` branches on workout type.
 */
export type TravelKit =
  /** Hotel/destination gym with weights + cardio, and room to run. Runs and
   *  strength both survive; days are marked travel but content is kept. */
  | 'full'
  /** Can run (treadmill or outdoors) but no weights. Runs survive; strength
   *  becomes a bodyweight circuit. */
  | 'run'
  /** Hotel room only — bodyweight and mobility. Runs become room cardio;
   *  strength becomes a bodyweight circuit. */
  | 'bodyweight'
  /** Full travel days — flights, transit, no training expected. Everything
   *  becomes a rest-grade travel day. */
  | 'rest'

export const TRAVEL_KIT_LABELS: Record<TravelKit, string> = {
  full: 'Hotel gym + running',
  run: 'Running only',
  bodyweight: 'Bodyweight only',
  rest: 'Full travel — no training',
}

/** A declared trip. `startIso`/`endIso` are inclusive calendar dates. */
export interface TravelDeclaration {
  startIso: string
  endIso: string
  kit: TravelKit
}

/**
 * A declared trip that has been applied to the plan. The day rewrites live
 * in the `usePlanEdits` op-log under `batchId`; this record is the handle
 * the plan view uses to show the "travel mode active · Undo" strip and to
 * tear the whole window down (`undoBatch(batchId)`).
 */
export interface TravelWindow extends TravelDeclaration {
  id: string
  batchId: string
  appliedAt: number
  summary: string
  affectedDays: number
}

/** Windows whose last day is today or later — the ones still worth a banner. */
export function activeTravelWindows(windows: TravelWindow[], todayIso: string): TravelWindow[] {
  return windows.filter(w => w.endIso >= todayIso)
}

export interface TravelPlanResult {
  /** Ops to hand to `usePlanEdits.applyBatch` — undone as one batch. */
  ops: PlanEditOpInput[]
  /** Days whose content changed. */
  affectedDays: number
  /** Week numbers the trip touched (for the "· travel" tag and the summary). */
  affectedWeeks: number[]
  /** Set when a long run was relocated to a home day. */
  longRunMoved?: { fromDay: string; toDay: string }
  /** One-line preview for the confirm sheet, e.g.
   *  "6 days adapted — bodyweight swaps · long run moved to Sat". */
  summary: string
}

const NEVER_TOUCH: ReadonlySet<PlannedDay['type']> = new Set(['rest', 'race', 'travel'])
const HARD_TYPES: ReadonlySet<PlannedDay['type']> = new Set(['quality', 'long', 'race'])
const isHard = (d: PlannedDay) => HARD_TYPES.has(d.type)

/** Noon-anchored day arithmetic so a trip range never drifts across a DST
 *  or timezone boundary (matches planDates.ts). */
function dayIso(weekStartIso: string, dayIndex: number): string {
  const ms = Date.parse(`${weekStartIso}T12:00:00`) + dayIndex * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function inRange(iso: string, startIso: string, endIso: string): boolean {
  return iso >= startIso && iso <= endIso
}

/**
 * The one-day substitution — a travel-flavoured mirror of
 * `suggestIndoorSwap`. Returns the fields to patch, or null when the day
 * should be left exactly as authored (rest / race / existing travel, and
 * anything the kit already covers).
 */
export function travelSwap(day: PlannedDay, kit: TravelKit): DayUpdates | null {
  if (NEVER_TOUCH.has(day.type)) return null

  // Full travel days: nothing trains.
  if (kit === 'rest') {
    return {
      type: 'travel',
      workout: 'Travel day',
      detail: 'Travelling — no session today. Walk the terminal, hydrate, mobilise on arrival. Nothing to make up; the plan bends forward.',
      zone: '—',
      route: 'Away',
      time: '—',
    }
  }

  const isRun = day.type === 'run' || day.type === 'long' || day.type === 'quality'

  if (kit === 'full') {
    // Gym + running on hand — the session survives; we only mark it as an
    // away day so the calendar shows the suitcase and the note sets context.
    return {
      route: 'Away',
      detail: `${day.detail} · Away this day — hotel gym / running both available, so the session stands.`,
    }
  }

  if (kit === 'run') {
    if (isRun) {
      return {
        route: 'Away · treadmill or outdoors',
        detail: `${day.detail} · Away — run outdoors or on the hotel treadmill; effort over pace on unfamiliar ground.`,
      }
    }
    // strength / cross without weights → bodyweight.
    return bodyweightStrength(day)
  }

  // kit === 'bodyweight'
  if (isRun) {
    return {
      type: 'cross',
      workout: 'Room cardio (travel)',
      detail: 'Bodyweight intervals 20–30 min · Burpees / mountain-climbers / high-knees, 40s on 20s off · Mobility 10 min. Keeps the aerobic habit without a run.',
      zone: '—',
      route: 'Hotel room',
      time: day.time,
    }
  }
  return bodyweightStrength(day)
}

function bodyweightStrength(day: PlannedDay): DayUpdates {
  return {
    type: 'strength',
    workout: 'Bodyweight strength (travel)',
    detail: 'Squats / split squats / push-ups / plank / glute bridge — 3 rounds, controlled tempo · Core 10 min. No kit needed.',
    zone: '—',
    route: 'Hotel room',
    time: day.time,
  }
}

/** Would placing a hard day at `idx` create three hard days in a row? */
function wouldTripleHard(days: PlannedDay[], idx: number): boolean {
  const hard = days.map(isHard)
  hard[idx] = true
  let run = 0
  for (const h of hard) {
    run = h ? run + 1 : 0
    if (run >= 3) return true
  }
  return false
}

const asTravelDay = (from: PlannedDay): DayUpdates => ({
  type: 'travel',
  workout: 'Travel day',
  detail: `Travelling — the ${from.workout.toLowerCase()} moved to a home day this week. Rest today; the plan bends forward.`,
  zone: '—',
  route: 'Away',
  time: '—',
})

/**
 * Build the undoable batch for a declared trip. Pure: takes the base weeks
 * (pre-edit) and the declaration, returns ops + a preview summary. Apply
 * with `usePlanEdits.applyBatch(result.ops)` and remember the returned
 * batchId to Undo.
 */
export function buildTravelBatch(
  weeks: TrainingWeek[],
  decl: TravelDeclaration,
): TravelPlanResult {
  const ops: PlanEditOpInput[] = []
  const affectedWeekNums = new Set<number>()
  let affectedDays = 0
  let longRunMoved: TravelPlanResult['longRunMoved']

  const runningAway = decl.kit === 'full' || decl.kit === 'run'

  for (const week of weeks) {
    if (!week.startIso) continue

    // Which day indices in this week fall inside the trip.
    const inTrip: number[] = []
    for (let di = 0; di < week.days.length; di++) {
      if (inRange(dayIso(week.startIso, di), decl.startIso, decl.endIso)) inTrip.push(di)
    }
    if (inTrip.length === 0) continue

    // Track a working copy of types so relocation legality is checked
    // against the moves we're already making this week.
    const workingDays = week.days.map(d => ({ ...d }))
    const handled = new Set<number>()

    // Preserve the key long session when the kit can't run: move it to a
    // legal HOME day AFTER the trip in the same week — the "long run moved
    // to Sat" behaviour. Never before the trip (the athlete isn't back
    // yet); take the soonest eligible day back.
    const lastTripIdx = inTrip[inTrip.length - 1]
    if (!runningAway) {
      for (const di of inTrip) {
        if (workingDays[di].type !== 'long') continue
        if (workingDays[di].locked) continue  // a pinned long run stays put
        const longDay = week.days[di]
        let target = -1
        for (let ti = lastTripIdx + 1; ti < week.days.length; ti++) {
          if (inTrip.includes(ti)) continue
          const t = workingDays[ti]
          if (t.locked) continue  // never land a moved session on a pinned day
          if (t.type !== 'rest' && t.type !== 'run') continue
          // Simulate: long lands at ti, original becomes a travel (non-hard) day.
          const sim = workingDays.map(d => ({ ...d }))
          sim[ti] = { ...sim[ti], type: 'long' }
          sim[di] = { ...sim[di], type: 'travel' }
          if (!wouldTripleHard(sim, ti)) { target = ti; break }
        }
        if (target >= 0) {
          ops.push({
            op: {
              kind: 'updateDay',
              weekNum: week.num,
              dayIndex: target,
              updates: {
                type: 'long',
                workout: longDay.workout,
                detail: `${longDay.detail} · Moved here from your travel days so the week keeps its long run.`,
                zone: longDay.zone,
                route: longDay.route,
                time: longDay.time,
              },
            },
            rationale: 'Travel: long run kept, moved to a home day',
          })
          ops.push({
            op: { kind: 'updateDay', weekNum: week.num, dayIndex: di, updates: asTravelDay(longDay) },
            rationale: 'Travel: long run moved off this day',
          })
          workingDays[target] = { ...workingDays[target], type: 'long' }
          workingDays[di] = { ...workingDays[di], type: 'travel' }
          handled.add(di)
          handled.add(target)
          affectedDays += 2
          if (!longRunMoved) longRunMoved = { fromDay: longDay.day, toDay: week.days[target].day }
          affectedWeekNums.add(week.num)
        }
      }
    }

    // Substitute the remaining trip days by kit.
    for (const di of inTrip) {
      if (handled.has(di)) continue
      if (week.days[di].locked) continue  // a pinned day is left exactly as authored
      const updates = travelSwap(week.days[di], decl.kit)
      if (!updates) continue
      ops.push({
        op: { kind: 'updateDay', weekNum: week.num, dayIndex: di, updates },
        rationale: 'Travel adaptation',
      })
      workingDays[di] = { ...workingDays[di], ...updates }
      handled.add(di)
      affectedDays += 1
      affectedWeekNums.add(week.num)
    }

    // Recompute the week's displayed mileage from its adapted days and tag it
    // so the total stays honest and the focus reads as a travel week.
    if (affectedWeekNums.has(week.num)) {
      const newMiles = Math.round(workingDays.reduce((t, d) => t + roughDayMiles(d), 0) * 10) / 10
      const TAG = ' · travel'
      const focus = week.focus.includes(TAG) ? week.focus : `${week.focus}${TAG}`
      ops.push({
        op: { kind: 'updateWeek', weekNum: week.num, updates: { miles: newMiles, focus } },
        rationale: 'Travel: week volume recomputed from adapted days',
      })
    }
  }

  return {
    ops,
    affectedDays,
    affectedWeeks: [...affectedWeekNums].sort((a, b) => a - b),
    longRunMoved,
    summary: summarise(affectedDays, decl.kit, longRunMoved),
  }
}

/** Lightweight mileage read for the week-total recompute. Mirrors
 *  estimateDayMiles' fallback: parse "N mi" from the zone; adapted travel
 *  days carry zone "—" → 0. (Kept local so this module has no dependency on
 *  the QA engine.) */
function roughDayMiles(d: PlannedDay): number {
  const m = d.zone?.match(/^([\d.]+)\s*mi/)
  return m ? parseFloat(m[1]) : 0
}

function summarise(days: number, kit: TravelKit, moved?: TravelPlanResult['longRunMoved']): string {
  if (days === 0) return 'No training days fall inside those dates — nothing to adapt.'
  const swap =
    kit === 'rest' ? 'travel days'
      : kit === 'bodyweight' ? 'bodyweight swaps'
        : kit === 'run' ? 'running kept, strength to bodyweight'
          : 'away, kit covers it'
  const tail = moved ? ` · long run moved to ${moved.toDay}` : ''
  return `${days} ${days === 1 ? 'day' : 'days'} adapted — ${swap}${tail}`
}
