import type { CoachAction, PlannedDay, PlanEditOp, PlanEditOpInput, DayUpdates, WeekUpdates, TrainingWeek, ProposedBenchmark, ProposedReshape } from '../types'
import { DAY_ROLES, WEEKDAYS, WEEKDAY_SHORT, roleLabel, changedWeekdays, type DayRole, type WeekShape, type Weekday } from '../engines/planGenerator/weekShape'
import { BENCHMARK_KINDS, isPlausible, type BenchmarkKind, type BenchmarkUnit } from '../engines/benchmark/log'
import { formatBenchmarkValue } from '../engines/benchmark/preview'
import { parseTimeToSeconds } from './parseTime'

/**
 * Parse ```proposal fenced code blocks from LLM output.
 *
 * Two accepted shapes inside the block:
 *   1. Batch (preferred): { "ops": [ { "kind": "...", ... }, ... ], "rationale": "..." }
 *      — any mix of structural ops (add/delete/update day or week).
 *   2. Legacy single-day: { "weekNum", "dayIndex", "updates", "rationale" }
 *      — wrapped into one `updateDay` op for backward compatibility.
 *   3. Benchmarks: { "benchmarks": [ { "kind", "value", "dateIso", ... } ], "rationale" }
 *      — a measured result the athlete reported ("I ran a 21:40 5K"),
 *      to be recorded in the benchmark log. May ride along with `ops`.
 *   4. Reshape: { "reshape": { "shape": { "mon": "rest", ... }, "fromWeek", "mode" }, "rationale" }
 *      — a new week layout ("move my long run to Saturday"), applied
 *      through the Plan tab's sheet from a week onward. Its own block.
 *
 * Returns the content with the block stripped + a structured CoachAction of
 * type 'propose_edit'. Validation is ATOMIC: if any op in a batch is invalid,
 * the whole proposal is rejected (action: null) rather than partially applied.
 */
// Match proposal blocks with various backtick counts (1-4) and optional whitespace.
// The LLM sometimes uses single backticks instead of triple.
const PROPOSAL_BLOCK_RE = /`{1,4}\s*proposal\s*\n([\s\S]*?)\n`{1,4}/

// Fallback: proposal block with opening backticks but missing closing (truncated response)
const PROPOSAL_BLOCK_OPEN_RE = /`{1,4}\s*proposal\s*\n([\s\S]*)/

// Also try to match a standalone JSON object with proposal fields
// at the end of the message (fallback when the LLM doesn't use a fenced block)
const PROPOSAL_JSON_RE = /\n\s*(\{[\s\S]*?("weekNum"|"ops"|"benchmarks"|"reshape")\s*:[\s\S]*?\})\s*$/

const ALLOWED_UPDATE_FIELDS: (keyof DayUpdates)[] = [
  'type', 'workout', 'detail', 'zone', 'route', 'time',
]

const WORKOUT_TYPES = ['strength', 'run', 'quality', 'long', 'cross', 'rest', 'limited', 'travel', 'race'] as const

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v
}

function cleanDayUpdates(raw: unknown): DayUpdates | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const out: DayUpdates = {}
  for (const key of ALLOWED_UPDATE_FIELDS) {
    const v = o[key]
    if (typeof v === 'string') {
      if (key === 'type') {
        if ((WORKOUT_TYPES as readonly string[]).includes(v)) out.type = v as PlannedDay['type']
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (out as any)[key] = v
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function cleanWeekUpdates(raw: unknown): WeekUpdates | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const out: WeekUpdates = {}
  if (typeof o.dates === 'string') out.dates = o.dates
  if (typeof o.focus === 'string') out.focus = o.focus
  if (typeof o.miles === 'string' || typeof o.miles === 'number') out.miles = o.miles
  return Object.keys(out).length > 0 ? out : null
}

/** Coerce a raw day object into a full PlannedDay. Requires a non-empty
 *  `day` label — actuals/manual-log matching keys off it, so a day without
 *  one would silently never receive logged data. */
function coerceDay(raw: unknown): PlannedDay | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const day = str(o.day)?.trim()
  if (!day) return null
  const type = str(o.type)
  return {
    day,
    type: (type && (WORKOUT_TYPES as readonly string[]).includes(type) ? type : 'run') as PlannedDay['type'],
    workout: str(o.workout)?.trim() || '—',
    detail: str(o.detail)?.trim() || '—',
    zone: str(o.zone)?.trim() || '—',
    route: str(o.route)?.trim() || '—',
    time: str(o.time)?.trim() || '—',
  }
}

function coerceWeek(raw: unknown): TrainingWeek | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isInt(o.num) || o.num < 1 || o.num > 60) return null
  const daysRaw = Array.isArray(o.days) ? o.days : []
  const days: PlannedDay[] = []
  for (const d of daysRaw) {
    const cd = coerceDay(d)
    if (!cd) return null  // atomic: a malformed day invalidates the week op
    days.push(cd)
  }
  return {
    num: o.num,
    dates: str(o.dates)?.trim() || '',
    miles: (typeof o.miles === 'number' || typeof o.miles === 'string') ? o.miles : 0,
    focus: str(o.focus)?.trim() || '',
    days,
  }
}

/** Validate + normalize one op. Returns the clean op or null. */
function parseOp(raw: unknown): PlanEditOp | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  switch (o.kind) {
    case 'updateDay': {
      if (!isInt(o.weekNum) || o.weekNum < 1 || o.weekNum > 30) return null
      if (!isInt(o.dayIndex) || o.dayIndex < 0 || o.dayIndex > 12) return null
      const updates = cleanDayUpdates(o.updates)
      if (!updates) return null
      return { kind: 'updateDay', weekNum: o.weekNum, dayIndex: o.dayIndex, updates }
    }
    case 'addDay': {
      if (!isInt(o.weekNum) || o.weekNum < 1 || o.weekNum > 30) return null
      if (!isInt(o.atIndex) || o.atIndex < 0 || o.atIndex > 13) return null
      const day = coerceDay(o.day)
      if (!day) return null
      return { kind: 'addDay', weekNum: o.weekNum, atIndex: o.atIndex, day }
    }
    case 'deleteDay': {
      if (!isInt(o.weekNum) || o.weekNum < 1 || o.weekNum > 30) return null
      if (!isInt(o.dayIndex) || o.dayIndex < 0 || o.dayIndex > 12) return null
      return { kind: 'deleteDay', weekNum: o.weekNum, dayIndex: o.dayIndex }
    }
    case 'updateWeek': {
      if (!isInt(o.weekNum) || o.weekNum < 1 || o.weekNum > 30) return null
      const updates = cleanWeekUpdates(o.updates)
      if (!updates) return null
      return { kind: 'updateWeek', weekNum: o.weekNum, updates }
    }
    case 'addWeek': {
      if (!isInt(o.atNum) || o.atNum < 0 || o.atNum > 30) return null
      const week = coerceWeek(o.week)
      if (!week) return null
      return { kind: 'addWeek', atNum: o.atNum, week }
    }
    case 'deleteWeek': {
      if (!isInt(o.weekNum) || o.weekNum < 1 || o.weekNum > 30) return null
      return { kind: 'deleteWeek', weekNum: o.weekNum }
    }
    default:
      return null
  }
}

const BENCHMARK_UNITS: readonly BenchmarkUnit[] = ['seconds', 'bpm', 'reps', 'lb', 'rpe']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validate + normalize one proposed benchmark. The value may arrive as the
 *  athlete said it ("21:40") or as a number; times become seconds. A preset
 *  kind takes its own unit whatever the model wrote, and must be plausible
 *  for that kind — a mis-heard "2:10" 5K is refused here, not saved. */
export function parseProposedBenchmark(raw: unknown): ProposedBenchmark | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = str(o.kind)
  if (!kind || !(kind in BENCHMARK_KINDS)) return null
  const spec = BENCHMARK_KINDS[kind as BenchmarkKind]
  let unit: BenchmarkUnit = spec.unit
  if (kind === 'other') {
    const u = str(o.unit)
    unit = u && (BENCHMARK_UNITS as readonly string[]).includes(u) ? (u as BenchmarkUnit) : 'seconds'
  }
  let value: number | null = null
  if (typeof o.value === 'number' && Number.isFinite(o.value)) value = o.value
  else if (typeof o.value === 'string') {
    const t = o.value.trim()
    if (unit === 'seconds') value = parseTimeToSeconds(t) ?? null
    else { const n = Number(t); value = Number.isFinite(n) ? n : null }
  }
  if (value == null || value < 0) return null
  if (kind === 'other' ? !Number.isFinite(value) : !isPlausible(kind as BenchmarkKind, value)) return null
  const dateIso = str(o.dateIso)?.trim()
  if (!dateIso || !ISO_DATE_RE.test(dateIso)) return null
  const label = str(o.label)?.trim()
  if (kind === 'other' && !label) return null
  const out: ProposedBenchmark = { kind: kind as BenchmarkKind, value, unit, dateIso }
  if (kind === 'other' && label) out.label = label
  const protocol = str(o.protocol)?.trim()
  if (protocol) out.protocol = protocol.slice(0, 120)
  const note = str(o.note)?.trim()
  if (note) out.note = note.slice(0, 200)
  const rationale = str(o.rationale)?.trim()
  if (rationale) out.rationale = rationale
  return out
}

const WEEKDAY_KEYS: Record<string, Weekday> = {
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
}

/** Validate + normalize a proposed week layout. Weekday keys may be 1–7
 *  or names; every one of the seven must be present with a known role —
 *  a layout with a day missing is not a layout. The engines' own laws
 *  (a rest day, never three hard days) are checked by the card, which
 *  shows them and refuses to apply; here the shape only has to be a
 *  shape. */
export function parseProposedReshape(raw: unknown): ProposedReshape | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const s = o.shape
  if (!s || typeof s !== 'object') return null
  const shape: Partial<WeekShape> = {}
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    const wd = WEEKDAY_KEYS[k.trim().toLowerCase()]
    const role = typeof v === 'string' ? v.trim().toLowerCase() : ''
    if (!wd || !(DAY_ROLES as readonly string[]).includes(role)) return null
    shape[wd] = role as DayRole
  }
  if (!WEEKDAYS.every(wd => shape[wd])) return null
  const out: ProposedReshape = { shape: shape as WeekShape }
  if (o.fromWeek != null) {
    if (!isInt(o.fromWeek) || o.fromWeek < 1 || o.fromWeek > 60) return null
    out.fromWeek = o.fromWeek
  }
  if (o.mode != null) {
    if (o.mode !== 'in_place' && o.mode !== 'rebuild') return null
    out.mode = o.mode
  }
  const rationale = str(o.rationale)?.trim()
  if (rationale) out.rationale = rationale
  return out
}

/** "Tue: easy run → strength · Sat: easy run → long run" against the
 *  layout in force; without one, the whole layout. */
export function summarizeReshape(r: ProposedReshape, current?: WeekShape | null, plan: 'road' | 'trail' | 'hyrox' | 'general' = 'road'): string {
  if (current) {
    const changed = changedWeekdays(current, r.shape)
    if (changed.length === 0) return 'no change to the week'
    return changed.map(wd => `${WEEKDAY_SHORT[wd]}: ${roleLabel(current[wd], plan).toLowerCase()} → ${roleLabel(r.shape[wd], plan).toLowerCase()}`).join(' · ')
  }
  return WEEKDAYS.map(wd => `${WEEKDAY_SHORT[wd]} ${roleLabel(r.shape[wd], plan).toLowerCase()}`).join(' · ')
}

/** One line per proposed benchmark, for the card and the handoff note. */
export function summarizeBenchmark(b: ProposedBenchmark): string {
  const name = b.kind === 'other' && b.label ? b.label : BENCHMARK_KINDS[b.kind].label
  return `${name} ${formatBenchmarkValue(b)} · ${b.dateIso}${b.protocol ? ` · ${b.protocol}` : ''}`
}

interface ParsedBatch {
  ops: PlanEditOpInput[]
  rationale?: string
  benchmarks?: ProposedBenchmark[]
  reshape?: ProposedReshape
}

function parseProposalObject(parsed: unknown): ParsedBatch | null {
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>

  // Shape 4 — a week layout. Its own block: the sheet it applies through
  // is a whole-plan change, not a batch of day edits.
  if (o.reshape != null) {
    const reshape = parseProposedReshape(o.reshape)
    if (!reshape) return null
    if (!reshape.rationale && str(o.rationale)) reshape.rationale = str(o.rationale)
    return { ops: [], rationale: str(o.rationale), reshape }
  }

  // Shape 3 — benchmarks to record. Atomic like ops: one bad entry rejects
  // the block, so a mis-heard number never half-applies. May accompany ops.
  let benchmarks: ProposedBenchmark[] | undefined
  if (Array.isArray(o.benchmarks)) {
    if (o.benchmarks.length === 0 && !Array.isArray(o.ops)) return null
    benchmarks = []
    for (const raw of o.benchmarks) {
      const b = parseProposedBenchmark(raw)
      if (!b) return null
      benchmarks.push(b)
    }
    if (benchmarks.length === 0) benchmarks = undefined
  }

  // Shape 1 — batch of ops. Each entry is { op: {kind,...}, rationale? };
  // also tolerate a flattened {kind,...} entry without the `op` wrapper.
  if (Array.isArray(o.ops)) {
    if (o.ops.length === 0 && !benchmarks) return null
    const ops: PlanEditOpInput[] = []
    for (const raw of o.ops) {
      if (!raw || typeof raw !== 'object') return null
      const r = raw as Record<string, unknown>
      const opRaw = (r.op && typeof r.op === 'object') ? r.op : r
      const op = parseOp(opRaw)
      if (!op) return null  // atomic reject — no partial apply
      ops.push({ op, rationale: str(r.rationale) })
    }
    return { ops, rationale: str(o.rationale), benchmarks }
  }
  if (benchmarks) return { ops: [], rationale: str(o.rationale), benchmarks }

  // Shape 2 — legacy single-day update.
  if (isInt(o.weekNum) && o.weekNum >= 1 && o.weekNum <= 30 &&
      isInt(o.dayIndex) && o.dayIndex >= 0 && o.dayIndex <= 12) {
    const updates = cleanDayUpdates(o.updates)
    if (!updates) return null
    return {
      ops: [{ op: { kind: 'updateDay', weekNum: o.weekNum, dayIndex: o.dayIndex, updates }, rationale: str(o.rationale) }],
      rationale: str(o.rationale),
    }
  }

  return null
}

export function extractProposal(content: string): { content: string; action: CoachAction | null } {
  let match = content.match(PROPOSAL_BLOCK_RE)
  let matchedFull = match?.[0]
  let jsonStr = match?.[1]?.trim()

  if (!jsonStr) {
    match = content.match(PROPOSAL_JSON_RE)
    matchedFull = match?.[0]
    jsonStr = match?.[1]?.trim()
  }

  if (!jsonStr) {
    match = content.match(PROPOSAL_BLOCK_OPEN_RE)
    matchedFull = match?.[0]
    jsonStr = match?.[1]?.trim()
  }

  if (!jsonStr || !matchedFull) return { content, action: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    const repaired = repairJSON(jsonStr)
    if (repaired) {
      try { parsed = JSON.parse(repaired) } catch { /* give up */ }
    }
    if (!parsed) return { content, action: null }
  }

  const batch = parseProposalObject(parsed)
  if (!batch) return { content, action: null }

  const cleanContent = content.replace(matchedFull, '').trim()

  if (batch.reshape) {
    const action: CoachAction = {
      type: 'propose_reshape',
      label: 'Shape my week',
      detail: summarizeReshape(batch.reshape),
      proposedReshape: batch.reshape,
    }
    return { content: cleanContent, action }
  }

  // A block with benchmarks and no plan ops is its own action type; with
  // both, the plan edit carries the benchmarks along.
  const proposedBenchmarks = batch.benchmarks?.length
    ? { entries: batch.benchmarks, rationale: batch.rationale }
    : undefined
  if (batch.ops.length === 0 && proposedBenchmarks) {
    const action: CoachAction = {
      type: 'propose_benchmark',
      label: proposedBenchmarks.entries.length > 1 ? 'Save benchmarks' : 'Save benchmark',
      detail: proposedBenchmarks.entries.map(summarizeBenchmark).join(' · '),
      proposedBenchmarks,
    }
    return { content: cleanContent, action }
  }

  // Populate the legacy single-day mirror when the batch is exactly one
  // updateDay op, so older single-edit UI/state paths keep working.
  const single = batch.ops.length === 1 && batch.ops[0].op.kind === 'updateDay'
    ? batch.ops[0].op
    : null

  const summary = single
    ? summarizeUpdates(single.updates)
    : batch.ops.map(o => summarizeOp(o.op)).join(' · ')

  const action: CoachAction = {
    type: 'propose_edit',
    label: batch.ops.length > 1 ? 'Apply all changes' : 'Apply this change',
    detail: summary,
    proposedEdit: {
      ops: batch.ops,
      rationale: batch.rationale,
      ...(single ? { weekNum: single.weekNum, dayIndex: single.dayIndex, updates: single.updates } : {}),
    },
    ...(proposedBenchmarks ? { proposedBenchmarks } : {}),
  }

  return { content: cleanContent, action }
}

/**
 * Strip an in-progress (unclosed) proposal block from streaming text so
 * the raw JSON doesn't flash on screen before the parser kicks in.
 */
const PROPOSAL_STREAMING_OPEN_RE = /`{1,4}\s*proposal\b[\s\S]*$/
const PROPOSAL_CLOSED_RE = /`{1,4}\s*proposal\s*\n[\s\S]*?\n`{1,4}/

export function stripStreamingProposal(content: string): string {
  if (PROPOSAL_CLOSED_RE.test(content)) return content
  const openMatch = content.match(PROPOSAL_STREAMING_OPEN_RE)
  if (!openMatch) return content
  return content.slice(0, openMatch.index).trimEnd()
}

function repairJSON(s: string): string | null {
  let cleaned = s.replace(/`+\s*$/, '').trim()
  cleaned = cleaned.replace(/,\s*"[^"]*$/, '')
  cleaned = cleaned.replace(/,\s*$/, '')
  cleaned = cleaned.replace(/:\s*"[^"]*$/, ': ""')
  let braces = 0
  let brackets = 0
  for (const c of cleaned) {
    if (c === '{') braces++
    if (c === '}') braces--
    if (c === '[') brackets++
    if (c === ']') brackets--
  }
  if (braces <= 0 && brackets <= 0) return null
  if (brackets > 0) cleaned += ']'.repeat(brackets)
  if (braces > 0) cleaned += '}'.repeat(braces)
  return cleaned
}

function trunc(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** One-line human summary of a single op, for batch cards + handoff notes.
 *  Pass `getDay` to resolve the current workout for a richer "from → to". */
export function summarizeOp(
  op: PlanEditOp,
  getDay?: (weekNum: number, dayIndex: number) => PlannedDay | null,
): string {
  switch (op.kind) {
    case 'updateDay': {
      const cur = getDay?.(op.weekNum, op.dayIndex)
      const label = cur?.day || `Wk${op.weekNum} day ${op.dayIndex + 1}`
      const to = op.updates.workout || op.updates.detail || (op.updates.type ? `change to ${op.updates.type}` : 'update')
      return cur?.workout ? `${label}: ${cur.workout} → ${trunc(to)}` : `${label}: ${trunc(to)}`
    }
    case 'addDay':
      return `Wk${op.weekNum}: add ${op.day.day} — ${trunc(op.day.workout)}`
    case 'deleteDay': {
      const cur = getDay?.(op.weekNum, op.dayIndex)
      return `Wk${op.weekNum}: remove ${cur?.day || `day ${op.dayIndex + 1}`}${cur?.workout ? ` (${cur.workout})` : ''}`
    }
    case 'updateWeek': {
      const parts: string[] = []
      if (op.updates.focus) parts.push(`focus → ${trunc(op.updates.focus)}`)
      if (op.updates.miles != null) parts.push(`${op.updates.miles} mi`)
      if (op.updates.dates) parts.push(op.updates.dates)
      return `Wk${op.weekNum}: ${parts.join(' · ') || 'update'}`
    }
    case 'addWeek':
      return `Add week ${op.week.num}${op.week.focus ? ` — ${trunc(op.week.focus)}` : ''}`
    case 'deleteWeek':
      return `Remove week ${op.weekNum}`
    case 'revoke':
      // Internal bookkeeping — a tombstone recording that earlier edits were
      // undone. Never part of a coach proposal, so it has no card to render;
      // this case exists to keep the switch exhaustive.
      return 'Undo earlier edits'
  }
}

function summarizeUpdates(updates: DayUpdates): string {
  const parts: string[] = []
  if (updates.workout) parts.push(updates.workout)
  if (updates.detail) parts.push(updates.detail.length > 80 ? updates.detail.slice(0, 77) + '…' : updates.detail)
  if (parts.length === 0 && updates.type) parts.push(`Change type to ${updates.type}`)
  return parts.join(' · ')
}
