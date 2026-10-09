/**
 * From the plan-import endpoint's reply to the plan the app stores
 * (initiative 004, PR 4).
 *
 * The endpoint (`api/coach/_plan_import.py`) transcribes a document into
 * weeks of sessions in the document's own terms: weekday codes or "any",
 * distances in the document's units. This turns that into `ImportedPlanV1`:
 *
 * - **Weekdays.** A session the plan puts on no weekday is placed here, in
 *   code, always keeping the plan's order. A week of exactly seven such
 *   sessions becomes Monday to Sunday. Otherwise they spread across the
 *   usual training days, with a long run that closes the week on Sunday.
 * - **Units.** Kilometres become miles, and the plan's own figure ("10 km")
 *   stays at the front of the session's detail, so nothing the athlete wrote
 *   is lost (D12).
 * - **Sessions stay separate.** Two sessions on one day are two stored
 *   sessions. Combining a day happens in one place only: `toTrainingPlan.ts`.
 *
 * Dates the document printed come back as `suggestions` for the review
 * screen and are never stored: week 1 is anchored to the start the athlete
 * confirms. The result goes through `readImportedPlan`, the same check stored
 * and synced plans pass, so a plan this returns is one the app can open.
 */

import {
  IMPORTED_INTENSITIES,
  IMPORTED_SESSION_TYPES,
  IMPORTED_SPORTS,
  IMPORT_LIMITS,
  readImportedPlan,
  type ImportSourceKind,
  type ImportedIntensity,
  type ImportedPlanV1,
  type ImportedSession,
  type ImportedSessionType,
  type ImportedSport,
} from './types'

const KM_PER_MILE = 1.609344
const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const SUNDAY = 7
/** Where unplaced sessions go, best first: spread out, the weekend last. */
const TRAINING_DAY_ORDER = [2, 4, 6, 7, 1, 3, 5]

/** What the review screen can prefill and the athlete confirms. */
export interface ImportSuggestions {
  startDate?: string
  raceName?: string
  raceDate?: string
}

export interface NormalizedImport {
  plan: ImportedPlanV1
  suggestions: ImportSuggestions
  /** Every version the document holds, when it holds several. */
  levels: string[]
  /** For the review screen: the reader's doubts, the server's warnings and
   *  what this step did (placed days, converted units). */
  notes: string[]
}

export type NormalizeFailure = 'not_a_plan' | 'unreadable' | 'empty'

export interface NormalizeInput {
  /** The endpoint's `extraction`, re-checked here rather than trusted. */
  extraction: unknown
  /** The endpoint's `warnings`. */
  warnings?: unknown
  source: { name: string; kind: ImportSourceKind }
  /** When the athlete imported it (ISO). Passed in so tests are exact. */
  importedAt: string
}

interface RawSession {
  d: number | 'any'
  t: ImportedSessionType
  w: string
  x?: string
  dist?: number
  min?: number
  z?: ImportedIntensity
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((s): s is string => !!s) : []
}

function readRawSession(raw: unknown): RawSession | null {
  if (!isRecord(raw)) return null
  const t = oneOf(IMPORTED_SESSION_TYPES, raw.t)
  const w = text(raw.w)
  if (!t || !w) return null
  const code = oneOf(DAY_CODES, raw.d)
  const session: RawSession = { d: code ? DAY_CODES.indexOf(code) + 1 : 'any', t, w }
  const x = text(raw.x)
  if (x) session.x = x
  const dist = positive(raw.dist)
  if (dist !== undefined) session.dist = dist
  const min = positive(raw.min)
  if (min !== undefined) session.min = min
  const z = oneOf(IMPORTED_INTENSITIES, raw.z)
  if (z) session.z = z
  return session
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Weekdays for a week's sessions. Named days are kept. Unnamed ones:
 * exactly seven, all unnamed, become Monday to Sunday in order. Otherwise
 * unnamed rest days are dropped (with no weekdays they mark nothing); a long
 * run that is the week's last session goes to Sunday when Sunday is free;
 * the rest take free days in `TRAINING_DAY_ORDER`, assigned in the plan's
 * own order, so the order never changes. Returns the placed sessions,
 * Monday first, and how many had their day chosen here.
 */
export function placeWeek(sessions: RawSession[]): { placed: Array<RawSession & { d: number }>; chosen: number } {
  const unnamed = sessions.filter(s => s.d === 'any')
  if (unnamed.length === 0) {
    // Stable: two sessions on one day keep the plan's order.
    const named = [...sessions] as Array<RawSession & { d: number }>
    return { placed: named.sort((a, b) => a.d - b.d), chosen: 0 }
  }

  if (unnamed.length === 7 && sessions.length === 7) {
    return {
      placed: sessions.map((s, i) => ({ ...s, d: i + 1 })),
      chosen: sessions.filter(s => s.t !== 'rest').length,
    }
  }

  const named = sessions.filter((s): s is RawSession & { d: number } => s.d !== 'any')
  const toPlace = unnamed.filter(s => s.t !== 'rest')
  const busy = new Map<number, number>()
  for (const s of named) busy.set(s.d, (busy.get(s.d) ?? 0) + 1)

  // A long run that closes the week takes Sunday; anywhere else in the week
  // it keeps its place, or the plan's order would change.
  const sundayLong = toPlace.length > 0 && toPlace[toPlace.length - 1].t === 'long' && !busy.get(SUNDAY)
  if (sundayLong) busy.set(SUNDAY, 1)
  const spread = sundayLong ? toPlace.slice(0, -1) : toPlace

  // Free days first, then the least-used ones, always in the preferred order.
  const days: number[] = []
  while (days.length < spread.length) {
    const free = TRAINING_DAY_ORDER.filter(d => !(busy.get(d)) && !days.includes(d))
    const pool = free.length
      ? free
      : [...TRAINING_DAY_ORDER].sort((a, b) => (busy.get(a) ?? 0) - (busy.get(b) ?? 0))
    const day = pool[0]
    days.push(day)
    busy.set(day, (busy.get(day) ?? 0) + 1)
  }
  // Ascending days in the plan's order: the first session takes the earliest.
  days.sort((a, b) => a - b)
  const placedUnnamed = spread.map((s, i) => ({ ...s, d: days[i] }))
  if (sundayLong) placedUnnamed.push({ ...toPlace[toPlace.length - 1], d: SUNDAY })

  const placed = [...named, ...placedUnnamed].sort((a, b) => a.d - b.d)
  return { placed, chosen: toPlace.length }
}

function toStored(s: RawSession & { d: number }, units: 'mi' | 'km' | 'none'): ImportedSession {
  const session: ImportedSession = { day: s.d, type: s.t, title: s.w }
  let detail = s.x
  if (s.dist !== undefined) {
    if (units === 'km') {
      session.distanceMi = Math.round((s.dist / KM_PER_MILE) * 100) / 100
      const original = `${formatNumber(s.dist)} km`
      // Whole number only: "8 km" is not already in "Build to 18 km".
      const already = detail && new RegExp(`(^|[^\\d.])${original.replace('.', '\\.')}\\b`).test(detail)
      if (!already) detail = detail ? `${original} — ${detail}` : original
    } else {
      session.distanceMi = s.dist
    }
  }
  if (detail) session.detail = detail
  if (s.min !== undefined) session.durationMin = s.min
  if (s.z) session.intensity = s.z
  return session
}

function fileTitle(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || 'My plan'
}

/**
 * Turn the endpoint's reply into the plan the app stores, or say why not.
 *
 * Returns `{ ok: true, value }` with the stored plan, the review screen's
 * suggestions, the document's levels and notes; or `{ ok: false, reason }`
 * when the document wasn't a plan, couldn't be read, or held no sessions.
 * Never throws, whatever the reply holds.
 */
export function normalizeExtraction(
  input: NormalizeInput,
): { ok: true; value: NormalizedImport } | { ok: false; reason: NormalizeFailure } {
  const ex = input.extraction
  if (!isRecord(ex)) return { ok: false, reason: 'unreadable' }
  if (ex.status === 'not_a_plan') return { ok: false, reason: 'not_a_plan' }
  if (ex.status !== 'ok') return { ok: false, reason: 'unreadable' }

  const units = oneOf(['mi', 'km', 'none'] as const, ex.units) ?? 'none'
  const sport: ImportedSport = oneOf(IMPORTED_SPORTS, ex.sport) ?? 'road'
  const rawWeeks = Array.isArray(ex.weeks) ? ex.weeks.slice(0, IMPORT_LIMITS.maxWeeks) : []

  let chosen = 0
  const weeks = rawWeeks.map(rawWeek => {
    const raw = isRecord(rawWeek) && Array.isArray(rawWeek.s) ? rawWeek.s : []
    const sessions = raw.map(readRawSession).filter((s): s is RawSession => s !== null)
    const { placed, chosen: n } = placeWeek(sessions)
    chosen += n
    const week: { focus?: string; sessions: ImportedSession[] } = {
      sessions: placed.slice(0, IMPORT_LIMITS.maxSessionsPerWeek).map(s => toStored(s, units)),
    }
    const focus = isRecord(rawWeek) ? text(rawWeek.focus) : undefined
    if (focus) week.focus = focus
    return week
  })
  if (!weeks.some(w => w.sessions.some(s => s.type !== 'rest'))) return { ok: false, reason: 'empty' }

  // What this step did and the server's warnings come first: the stored plan
  // keeps 20 notes, and the reader may have sent that many on its own.
  const notes: string[] = []
  if (chosen > 0) {
    notes.push(
      `${chosen} session${chosen === 1 ? '' : 's'} had no day in your plan, so we spread ${chosen === 1 ? 'it' : 'them'} across the week in the plan's order. Move any of them after import.`,
    )
  }
  if (units === 'km' && weeks.some(w => w.sessions.some(s => s.distanceMi !== undefined))) {
    notes.push('Distances were in kilometres and are shown in miles. Each session keeps its original distance in its notes.')
  }
  notes.push(...strings(input.warnings), ...strings(ex.notes))

  const race = isRecord(ex.race) ? ex.race : {}
  const stored = readImportedPlan({
    v: 1,
    source: { name: input.source.name.trim() || 'My plan', kind: input.source.kind, importedAt: input.importedAt },
    title: text(ex.title) ?? fileTitle(input.source.name),
    sport,
    raceDistance: text(race.distance),
    weeks,
    notes,
  })
  if (!stored) return { ok: false, reason: 'unreadable' }

  const suggestions: ImportSuggestions = {}
  const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  const startDate = isoDate(ex.start_date)
  if (startDate) suggestions.startDate = startDate
  const raceName = text(race.name)
  if (raceName) suggestions.raceName = raceName
  const raceDate = isoDate(race.date)
  if (raceDate) suggestions.raceDate = raceDate

  return {
    ok: true,
    value: { plan: stored, suggestions, levels: strings(ex.levels), notes: stored.notes ?? [] },
  }
}
