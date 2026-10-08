/**
 * An athlete's own training plan, read from a file they uploaded
 * (initiative 004).
 *
 * It is stored inside `OnboardingConfig.importedPlan`, so sync, backups,
 * Restore and Redo carry it with no storage key of its own. Sessions are
 * keyed by week number and weekday, never by date: week 1 is anchored to the
 * config's pinned start Monday when the plan is rendered, so moving the start
 * moves the whole plan, and no date ever comes from the model.
 *
 * Because the config syncs between devices, everything read back from it goes
 * through `readImportedPlan`, which refuses a broken plan instead of letting
 * it crash the app.
 */

export const IMPORT_SOURCE_KINDS = ['pdf', 'image', 'docx', 'xlsx', 'csv', 'text'] as const
export type ImportSourceKind = typeof IMPORT_SOURCE_KINDS[number]

export const IMPORTED_SPORTS = ['road', 'trail', 'hyrox', 'general'] as const
export type ImportedSport = typeof IMPORTED_SPORTS[number]

/** The subset of the app's WorkoutType a plan we did not write can carry. */
export const IMPORTED_SESSION_TYPES = ['run', 'long', 'quality', 'cross', 'strength', 'rest', 'race'] as const
export type ImportedSessionType = typeof IMPORTED_SESSION_TYPES[number]

/** Effort as the plan itself states it. Mapped to the app's heart-rate zones
 *  at render; absent when the plan names no effort. */
export const IMPORTED_INTENSITIES = ['recovery', 'easy', 'steady', 'tempo', 'interval', 'race'] as const
export type ImportedIntensity = typeof IMPORTED_INTENSITIES[number]

export interface ImportedSession {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  day: number
  type: ImportedSessionType
  title: string
  detail?: string
  distanceMi?: number
  durationMin?: number
  intensity?: ImportedIntensity
}

export interface ImportedWeek {
  focus?: string
  sessions: ImportedSession[]
}

export interface ImportedPlanV1 {
  v: 1
  source: { name: string; kind: ImportSourceKind; importedAt: string }
  title: string
  sport: ImportedSport
  /** The race distance as the plan words it ("Half marathon"), if it names one. */
  raceDistance?: string
  weeks: ImportedWeek[]
  /** What the reader was unsure of, shown on the review screen. */
  notes?: string[]
}

export const IMPORT_LIMITS = {
  maxWeeks: 52,
  maxSessionsPerWeek: 14,
  maxNotes: 20,
  title: 120,
  detail: 600,
  focus: 200,
  note: 300,
  sourceName: 200,
  raceDistance: 60,
  maxDistanceMi: 200,
  maxDurationMin: 1440,
} as const

// Control characters other than tab and newline have no business in a plan
// and can upset layout; they are dropped, never rendered.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(CONTROL_CHARS, '').trim()
  if (!cleaned) return undefined
  return cleaned.length > max ? cleaned.slice(0, max).trimEnd() : cleaned
}

function cleanNumber(value: unknown, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.min(value, max)
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSession(raw: unknown): ImportedSession | null {
  if (!isRecord(raw)) return null
  const day = raw.day
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) return null
  if (!isOneOf(IMPORTED_SESSION_TYPES, raw.type)) return null
  const title = cleanText(raw.title, IMPORT_LIMITS.title)
  if (!title) return null
  const session: ImportedSession = { day, type: raw.type, title }
  const detail = cleanText(raw.detail, IMPORT_LIMITS.detail)
  if (detail) session.detail = detail
  const distanceMi = cleanNumber(raw.distanceMi, IMPORT_LIMITS.maxDistanceMi)
  if (distanceMi !== undefined) session.distanceMi = distanceMi
  const durationMin = cleanNumber(raw.durationMin, IMPORT_LIMITS.maxDurationMin)
  if (durationMin !== undefined) session.durationMin = durationMin
  if (isOneOf(IMPORTED_INTENSITIES, raw.intensity)) session.intensity = raw.intensity
  return session
}

/**
 * Read an imported plan back from storage or sync.
 *
 * The plan's frame (version, source, sport, the weeks array) must be intact,
 * or the whole plan is refused and `null` comes back. A single session that
 * is malformed is dropped rather than refusing the plan around it. Text is
 * trimmed and capped, and numbers outside sensible bounds are dropped or
 * capped. Returns a fresh, cleaned copy; the input is never mutated.
 */
export function readImportedPlan(raw: unknown): ImportedPlanV1 | null {
  if (!isRecord(raw) || raw.v !== 1) return null
  const src = raw.source
  if (!isRecord(src) || !isOneOf(IMPORT_SOURCE_KINDS, src.kind)) return null
  const sourceName = cleanText(src.name, IMPORT_LIMITS.sourceName)
  const importedAt = cleanText(src.importedAt, 40)
  if (!sourceName || !importedAt) return null
  if (!isOneOf(IMPORTED_SPORTS, raw.sport)) return null
  if (!Array.isArray(raw.weeks) || raw.weeks.length === 0 || raw.weeks.length > IMPORT_LIMITS.maxWeeks) return null

  const weeks: ImportedWeek[] = []
  for (const rawWeek of raw.weeks) {
    if (!isRecord(rawWeek) || !Array.isArray(rawWeek.sessions)) return null
    if (rawWeek.sessions.length > IMPORT_LIMITS.maxSessionsPerWeek) return null
    const sessions = rawWeek.sessions
      .map(readSession)
      .filter((s): s is ImportedSession => s !== null)
    const week: ImportedWeek = { sessions }
    const focus = cleanText(rawWeek.focus, IMPORT_LIMITS.focus)
    if (focus) week.focus = focus
    weeks.push(week)
  }

  const plan: ImportedPlanV1 = {
    v: 1,
    source: { name: sourceName, kind: src.kind, importedAt },
    title: cleanText(raw.title, IMPORT_LIMITS.title) ?? sourceName,
    sport: raw.sport,
    weeks,
  }
  const raceDistance = cleanText(raw.raceDistance, IMPORT_LIMITS.raceDistance)
  if (raceDistance) plan.raceDistance = raceDistance
  if (Array.isArray(raw.notes)) {
    const notes = raw.notes
      .map(n => cleanText(n, IMPORT_LIMITS.note))
      .filter((n): n is string => !!n)
      .slice(0, IMPORT_LIMITS.maxNotes)
    if (notes.length) plan.notes = notes
  }
  return plan
}
