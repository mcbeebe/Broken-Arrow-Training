import type { PlannedDay, TrainingWeek } from '../../types'
import type { OnboardingConfig, RaceDistance } from '../../hooks/useOnboarding'
import type { SeasonPlanResult } from './planSeason'
import { isHyroxRace, isHyroxRaceInfo } from './planSeason'
import {
  bridgeDayStream,
  dayLabel,
  recoverDayStream,
  weekDates,
  type StreamDay,
} from './blockWeeks'
import { getMethodById, RECOMMENDABLE_METHODS } from '../../data/methods'
import { generatePlanFromMethod } from '../planGenerator/generatePlan'
import { generateHyroxPlan } from '../../utils/planGenerator'
import { parseDayToDate } from '../../utils/planDates'
import { raceDateToIso } from './index'

/**
 * G1 completion — splice the season into the athlete-facing plan.
 *
 * The anchor race's plan (the plan the athlete onboarded onto) stays as
 * generated — the locked guard: a single-race season returns the base
 * weeks untouched, and in a multi-race season the anchor's weeks are
 * byte-identical EXCEPT that days dated after the anchor race day are
 * trimmed (post-race days are the RECOVER block's job; two weeks may
 * never contain the same calendar date). What splicing adds, appended
 * after the anchor race with continuous week numbering, is the rest of
 * the chain:
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
  const anchorRaceBlock = season.blocks.find(b => b.kind === 'RACE' && b.raceId === anchorId)
  const anchorIso = anchorRaceBlock?.startDate
    ?? (season.races[0] ? raceDateToIso(season.races[0].raceInfo.date) : null)

  // Calendar reconciliation: anchor-plan days dated AFTER the anchor race
  // are the RECOVER block's job — trimming them here is what guarantees no
  // date can appear in two weeks (the field bug where the calendar's
  // last-write-wins map let "Post-race rest" overwrite race day). The
  // race-week remap in the generator makes this a no-op for freshly
  // generated plans; it stands as the safety net for stored ones. Anchor
  // weeks are otherwise byte-identical.
  const trimmedBase = anchorIso
    ? baseWeeks
        .map(w => {
          const days = w.days.filter(d => {
            const iso = parseDayToDate(d.day, w.dates, anchorIso)
            return !iso || iso <= anchorIso
          })
          return days.length === w.days.length ? w : { ...w, days }
        })
        .filter(w => w.days.length > 0)
    : baseWeeks

  // Blocks strictly after the anchor race, future-only, in date order.
  const laterBlocks = season.blocks
    .filter(b => !anchorRaceBlock || b.startDate > anchorRaceBlock.startDate)
    .filter(b => b.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const racesById = new Map(season.races.map(r => [r.id, r]))
  const generatedRaceIds = new Set<string>()

  // Appended weeks accumulate WITHOUT numbers; numbering happens once at
  // the end so late race-day injections keep the sequence continuous.
  const appended: TrainingWeek[] = []
  // RECOVER/BRIDGE days accumulate as one dated stream and are chunked at
  // MONDAY boundaries when flushed, so season weeks share the anchor
  // plan's Mon–Sun convention (one leading partial week allowed — e.g.
  // the Sunday after a Saturday race).
  let pendingStream: StreamDay[] = []
  // Bridge continuation state for gap-fill before a Monday-snapped build.
  let bridgeState: { nextIsHyrox: boolean; consumed: number; label: string } | null = null
  const raceStamps: { iso: string; race: (typeof season.races)[number] }[] = []

  const flushPending = () => {
    if (pendingStream.length === 0) return
    appended.push(...chunkStreamAtMondays(pendingStream))
    pendingStream = []
    bridgeState = null
  }

  for (const block of laterBlocks) {
    const race = racesById.get(block.raceId)
    if (!race) continue

    if (block.kind === 'RECOVER') {
      const prev = racesById.get(block.raceId)
      const miles = prev?.raceInfo.distanceMiles || 13.1
      const highVert = (prev?.raceInfo.elevationGainFt ?? 0) > 100 * miles
      const label = `After ${prev?.raceInfo.name ?? 'race'}`
      pendingStream.push(...recoverDayStream(block, miles, { highVert })
        .map(s => ({ ...s, focus: `[${label}] ${s.focus}` })))
      continue
    }

    if (block.kind === 'BRIDGE') {
      const label = `Toward ${race.raceInfo.name}`
      const stream = bridgeDayStream(block.startDate, block.endDate, isHyroxRace(race))
      pendingStream.push(...stream.map(s => ({ ...s, focus: `[${label}] ${s.focus}` })))
      bridgeState = { nextIsHyrox: isHyroxRace(race), consumed: stream.length, label }
      continue
    }

    // TAPER: covered by the generated build plan (its final weeks ARE the
    // taper + race week) — consumed explicitly, validated by tests. Never
    // silently fall through: that silence was how the second race lost
    // its entire tail in the field.
    if (block.kind === 'TAPER') continue

    // RACE (non-anchor): remember the date; after assembly we verify a
    // race-day card exists on it (the generated plan normally carries it)
    // and stamp/inject one when it doesn't — a C-priority train-through
    // race is ONLY a RACE block and would otherwise contribute nothing.
    if (block.kind === 'RACE') {
      raceStamps.push({ iso: block.startDate, race })
      continue
    }

    // BUILD: one full plan per subsequent race, generated at the block's
    // start (the generated plan carries its own taper + race day).
    if (block.kind === 'BUILD' && !generatedRaceIds.has(race.id)) {
      generatedRaceIds.add(race.id)
      const raceConfig = configForSeasonRace(config, race)
      if (!raceConfig) continue
      const genToday = block.startDate >= today ? block.startDate : today
      const plan = safeGenerate(raceConfig, genToday)
      if (!plan) continue
      // Hard guarantee (P0): a spliced week may NEVER predate its block —
      // a generator that back-counts past the block start would stack its
      // weeks on top of the previous race's build. Runway clamps in the
      // generators make this a no-op today; the trim is the safety net.
      const kept = plan.weeks.filter(w => !weekStartsBefore(w, genToday))
      if (kept.length > 0) {
        // Monday-snapped plans may start days after the bridge ended —
        // extend the bridge pattern through the eve of the plan's first
        // covered day so the athlete never faces an unexplained hole.
        const firstCovered = firstDayIso(kept[0], genToday)
        const lastPending = pendingStream[pendingStream.length - 1]?.iso
        if (firstCovered && lastPending && shiftIso(lastPending, 1) < firstCovered) {
          const fillState = bridgeState ?? { nextIsHyrox: isHyroxRace(race), consumed: 0, label: `Toward ${race.raceInfo.name}` }
          pendingStream.push(...bridgeDayStream(shiftIso(lastPending, 1), shiftIso(firstCovered, -1), fillState.nextIsHyrox, fillState.consumed)
            .map(s => ({ ...s, focus: `[${fillState.label}] ${s.focus}` })))
        }
      }
      flushPending()
      for (const w of kept) {
        appended.push({
          ...w,
          focus: `[${race.raceInfo.name}] ${w.focus}`,
          days: w.days.map(d => ({ ...d })),
        })
      }
    }
  }
  flushPending()

  // Race-day guarantees for every non-anchor race (see RACE branch above).
  // Past races are history — never retro-inject them.
  for (const { iso, race } of raceStamps) {
    if (iso < today) continue
    stampRaceDay(appended, iso, race)
  }

  // Continuous numbering after the (possibly trimmed) anchor weeks.
  let nextWeekNum = trimmedBase.reduce((m, w) => Math.max(m, w.num), 0) + 1
  return [...trimmedBase, ...appended.map(w => ({ ...w, num: nextWeekNum++ }))]
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

/** 0=Mon … 6=Sun of an ISO date. */
function mondayOffset(iso: string): number {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7
}

/** Chunk a dated day stream at Monday boundaries (leading partial week
 *  allowed). Each chunk's focus comes from its first day's block. */
function chunkStreamAtMondays(stream: StreamDay[]): TrainingWeek[] {
  const weeks: TrainingWeek[] = []
  let chunk: StreamDay[] = []
  const flush = () => {
    if (chunk.length === 0) return
    weeks.push({
      num: 0, // assigned by the caller
      dates: weekDates(chunk[0].iso, chunk[chunk.length - 1].iso),
      miles: chunk.filter(s => s.day.type !== 'rest' && s.day.type !== 'strength').length * 3,
      focus: chunk[0].focus,
      days: chunk.map(s => s.day),
    })
    chunk = []
  }
  for (const s of stream) {
    if (chunk.length > 0 && mondayOffset(s.iso) === 0) flush()
    chunk.push(s)
  }
  flush()
  return weeks
}

/** First parseable ISO date of a week (anchored year inference). */
function firstDayIso(week: TrainingWeek, anchorIso: string): string | null {
  for (const d of week.days) {
    const iso = parseDayToDate(d.day, week.dates, anchorIso)
    if (iso) return iso
  }
  return null
}

/** Ensure `iso` carries a race-day card for `race` somewhere in the
 *  appended weeks: already-generated race weeks pass through, a covered
 *  date gets its day replaced (the C-priority train-through case), and an
 *  uncovered date gets a one-day race week injected in date order. */
function stampRaceDay(
  appended: TrainingWeek[],
  iso: string,
  race: { priority?: 'A' | 'B' | 'C'; raceInfo: { name: string } },
): void {
  const trainThrough = race.priority === 'C'
  for (const week of appended) {
    for (let i = 0; i < week.days.length; i++) {
      const dayIso = parseDayToDate(week.days[i].day, week.dates, iso)
      if (dayIso !== iso) continue
      if (week.days[i].type === 'race') {
        // Generated race day — keep its content but make sure the card
        // actually NAMES the race (method generators title race day after
        // whatever workout the picker chose, e.g. "E Run").
        if (!week.days[i].workout.toLowerCase().includes(race.raceInfo.name.toLowerCase())) {
          week.days[i] = { ...week.days[i], workout: `RACE DAY — ${race.raceInfo.name}` }
        }
        return
      }
      week.days[i] = raceDayCard(iso, race.raceInfo.name, trainThrough)
      return
    }
  }
  // No week covers the date (e.g. the generated first week was trimmed for
  // a race days after its block start): inject a one-day race week.
  const injected: TrainingWeek = {
    num: 0, // assigned by the caller
    dates: weekDates(iso, iso),
    miles: 0,
    focus: `[${race.raceInfo.name}] Race week`,
    days: [raceDayCard(iso, race.raceInfo.name, trainThrough)],
  }
  const at = appended.findIndex(w => {
    const first = firstDayIso(w, iso)
    return first !== null && first > iso
  })
  if (at === -1) appended.push(injected)
  else appended.splice(at, 0, injected)
}

function raceDayCard(iso: string, raceName: string, trainThrough: boolean): PlannedDay {
  return {
    day: dayLabel(iso),
    type: 'race',
    workout: `RACE DAY — ${raceName}`,
    detail: trainThrough
      ? 'C-priority: raced on tired legs by design — no taper for this one. Race for practice and data, not a PR.'
      : 'Race day. Nothing new — rehearsed gear, fueling, and pacing only.',
    zone: '—',
    route: raceName,
    time: '—',
  }
}

/** The generation config for a subsequent season race: the athlete's own
 *  answers, re-aimed at the next race. Null when the race can't drive a
 *  generator (no date). */
function configForSeasonRace(
  config: OnboardingConfig,
  race: { raceInfo: { name: string; date: string; distance?: string; distanceMiles: number; description?: string } },
): (OnboardingConfig & { raceDate: string }) | null {
  const iso = raceDateToIso(race.raceInfo.date)
  if (!iso) return null
  const hyrox = isHyroxRaceInfo(race.raceInfo)
  return {
    ...config,
    raceType: hyrox ? 'hyrox' : (config.raceType === 'general' ? 'road' : config.raceType),
    raceName: race.raceInfo.name,
    raceDate: iso,
    raceDescription: race.raceInfo.description ?? undefined,
    // The athlete's chosen plan start applies to the ANCHOR plan only —
    // subsequent blocks start when the state machine says they start.
    planStartDate: undefined,
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

/** True when a generated week's first parseable day predates `minIso`.
 *  `minIso` doubles as the year anchor so a Dec→Jan season doesn't compare
 *  wrong-year dates. */
function weekStartsBefore(week: TrainingWeek, minIso: string): boolean {
  for (const d of week.days) {
    const iso = parseDayToDate(d.day, week.dates, minIso)
    if (iso) return iso < minIso
  }
  return false // undatable weeks are kept — never silently drop content
}
