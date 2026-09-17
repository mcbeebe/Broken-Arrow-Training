/**
 * The benchmark log — every number the athlete has measured, dated, kept.
 *
 * Until now the plan's inputs were scattered: ONE race time captured at
 * onboarding (and never editable again), two erg splits on a Hyrox step,
 * a strength capacity that only a scheduled test session could write, and
 * a tested LTHR in Settings that Hyrox athletes could not even see. Each
 * lived in its own field with its own overwrite rule, and only one of them
 * remembered WHEN it was measured.
 *
 * This is the one place they all go. It is a log, not a form: adding a
 * newer 5K never deletes the older one, the engines read the FRESHEST of
 * each kind, and the history stays visible. Nothing downstream changes —
 * `deriveAnchors` produces exactly the fields the plan generator, the Hyrox
 * projection and the strength engine already consume, so this is a front
 * door onto the existing engines, not a new engine.
 *
 * Two rules carried over from the fields it replaces, now pinned by tests:
 *   - A race result outranks a self-reported easy pace as the pace anchor,
 *     whatever their dates. (A race is a measurement; an easy pace is a
 *     feeling.)
 *   - A tested LTHR lives BESIDE the pace anchor, never in place of it —
 *     the v1 calibration replaced an easy-pace anchor with {type:'lthr'}
 *     and every /mi band vanished from the regenerated plan.
 */

import type { FitnessAnchor, FitnessAnchorType, OnboardingConfig } from '../../hooks/useOnboarding'
import { RETEST_WEEKS, type StrengthCapacity } from '../strength/benchmark'
import { daysBetween, isoFromLocalDate } from '../../utils/planDates'

export type BenchmarkKind =
  // pace anchors (feed VDOT / pace targets)
  | 'race_5k' | 'race_10k' | 'race_hm' | 'race_marathon' | 'easy_pace'
  // HR anchor (feeds HR bands, beside the pace anchor)
  | 'lthr'
  // Hyrox station baselines (feed station targets + the finish projection)
  | 'ski_erg_1k' | 'row_1k' | 'erg_500' | 'erg_1k'
  | 'wall_balls_unbroken' | 'wall_balls_100' | 'sled_push_rpe' | 'run_1k'
  // strength capacity (feed every prescribed load)
  | 'push_ups' | 'goblet_squat_8rm' | 'plank'
  // coach context only
  | 'mile_tt' | 'other'

export type BenchmarkUnit = 'seconds' | 'bpm' | 'reps' | 'lb' | 'rpe'
export type BenchmarkSource = 'manual' | 'logged' | 'derived'
export type PlanKind = 'road' | 'trail' | 'hyrox' | 'general'

export interface Benchmark {
  id: string
  kind: BenchmarkKind
  value: number
  unit: BenchmarkUnit
  /** When it was measured (ISO date). Not when it was typed in. */
  dateIso: string
  source: BenchmarkSource
  /** Free label for `other` ("Murph"); ignored elsewhere. */
  label?: string
  /** How it was tested, in the athlete's words — "unbroken, rested",
   *  "in 2 minutes", "100 for time". Any kind may carry one; the presets
   *  with an engine behind them define what they assume, and a protocol
   *  that contradicts it is still recorded (the coach reads it) but the
   *  athlete is told which one the engine will use. */
  protocol?: string
  note?: string
  /** Wall time the entry was recorded — the union-merge sort key. */
  at: number
  /** Tombstone. A removal is recorded, never an absence, so the cross-device
   *  union cannot resurrect an entry deleted on another device. */
  deleted?: true
}

export interface BenchmarkKindSpec {
  label: string
  unit: BenchmarkUnit
  /** Sanity bounds — a typo must never become a race target. */
  min: number
  max: number
  /** Which plans offer this preset. */
  plans: PlanKind[]
  /** One line, athlete-facing: what changes when this is entered. */
  feeds: string
  /** Weeks after which the engines treat it as needing a re-test; null =
   *  no staleness rule. Race anchors match the generator's 12-week
   *  revalidation; strength items match the strength engine's re-test clock. */
  staleAfterWeeks: number | null
}

const RACE_REVALIDATE_WEEKS = 12

export const BENCHMARK_KINDS: Record<BenchmarkKind, BenchmarkKindSpec> = {
  race_5k:       { label: '5K',            unit: 'seconds', min: 12 * 60,  max: 60 * 60,      plans: ['road', 'trail', 'hyrox', 'general'], feeds: 'Every run pace, from your VDOT.', staleAfterWeeks: RACE_REVALIDATE_WEEKS },
  race_10k:      { label: '10K',           unit: 'seconds', min: 25 * 60,  max: 2 * 3600,     plans: ['road', 'trail', 'general'],          feeds: 'Every run pace, from your VDOT.', staleAfterWeeks: RACE_REVALIDATE_WEEKS },
  race_hm:       { label: 'Half marathon', unit: 'seconds', min: 55 * 60,  max: 4 * 3600,     plans: ['road', 'trail', 'general'],          feeds: 'Every run pace, from your VDOT.', staleAfterWeeks: RACE_REVALIDATE_WEEKS },
  race_marathon: { label: 'Marathon',      unit: 'seconds', min: 2 * 3600, max: 8 * 3600,     plans: ['road', 'trail'],                     feeds: 'Every run pace, from your VDOT.', staleAfterWeeks: RACE_REVALIDATE_WEEKS },
  easy_pace:     { label: 'Easy pace',     unit: 'seconds', min: 5 * 60,   max: 20 * 60,      plans: ['road', 'trail', 'general'],          feeds: 'The slow end of your easy zone — used only until a race time exists.', staleAfterWeeks: null },
  lthr:          { label: 'Threshold HR',  unit: 'bpm',     min: 100,      max: 220,          plans: ['road', 'trail', 'hyrox', 'general'], feeds: 'Every HR band. Your pace anchor is untouched.', staleAfterWeeks: RACE_REVALIDATE_WEEKS },
  ski_erg_1k:    { label: 'SkiErg 1K',     unit: 'seconds', min: 120,      max: 600,          plans: ['hyrox'], feeds: 'The SkiErg target on every station day, and your projected split.', staleAfterWeeks: RETEST_WEEKS },
  row_1k:        { label: 'Row 1K',        unit: 'seconds', min: 120,      max: 600,          plans: ['hyrox'], feeds: 'The rowing target on every station day, and your projected split.', staleAfterWeeks: RETEST_WEEKS },
  erg_500:       { label: 'Erg 500m',      unit: 'seconds', min: 60,       max: 300,          plans: ['hyrox'], feeds: 'Erg interval targets in your strength days.', staleAfterWeeks: RETEST_WEEKS },
  erg_1k:        { label: 'Erg 1K',        unit: 'seconds', min: 120,      max: 600,          plans: ['hyrox'], feeds: 'Erg interval targets in your strength days.', staleAfterWeeks: RETEST_WEEKS },
  wall_balls_unbroken: { label: 'Wall balls, unbroken', unit: 'reps', min: 1, max: 200, plans: ['hyrox'], feeds: 'The size of every wall-ball set you are prescribed.', staleAfterWeeks: RETEST_WEEKS },
  wall_balls_100: { label: 'Wall balls, 100 for time', unit: 'seconds', min: 120, max: 20 * 60, plans: ['hyrox'], feeds: 'Your projected wall-ball station split.', staleAfterWeeks: RETEST_WEEKS },
  sled_push_rpe: { label: 'Sled push',     unit: 'rpe',     min: 1,        max: 10,           plans: ['hyrox'], feeds: 'Sled loading, and your projected sled splits.', staleAfterWeeks: RETEST_WEEKS },
  run_1k:        { label: '1K run',        unit: 'seconds', min: 150,      max: 600,          plans: ['hyrox'], feeds: 'The coach reads it; the run-between-stations targets will use it next.', staleAfterWeeks: RETEST_WEEKS },
  push_ups:      { label: 'Push-ups',      unit: 'reps',    min: 0,        max: 200,          plans: ['hyrox', 'general'], feeds: 'Every pressing prescription.', staleAfterWeeks: RETEST_WEEKS },
  goblet_squat_8rm: { label: 'Goblet squat 8RM', unit: 'lb', min: 0,       max: 200,          plans: ['hyrox', 'general'], feeds: 'Every lower-body load.', staleAfterWeeks: RETEST_WEEKS },
  plank:         { label: 'Plank hold',    unit: 'seconds', min: 0,        max: 600,          plans: ['hyrox', 'general'], feeds: 'Every core hold.', staleAfterWeeks: RETEST_WEEKS },
  mile_tt:       { label: 'Mile time trial', unit: 'seconds', min: 4 * 60, max: 15 * 60,      plans: ['road', 'trail', 'general'], feeds: 'The coach reads it; the pace engine does not use a mile yet.', staleAfterWeeks: null },
  other:         { label: 'Something else', unit: 'seconds', min: 0,       max: 24 * 3600,    plans: ['road', 'trail', 'hyrox', 'general'], feeds: 'A note for the coach. Changes nothing in the plan.', staleAfterWeeks: null },
}

export const RACE_KINDS: readonly BenchmarkKind[] = ['race_5k', 'race_10k', 'race_hm', 'race_marathon']

/** Presets offered for a plan, in the order the sheet shows them. */
export function kindsForPlan(plan: PlanKind): BenchmarkKind[] {
  return (Object.keys(BENCHMARK_KINDS) as BenchmarkKind[]).filter(k => BENCHMARK_KINDS[k].plans.includes(plan))
}

export function planKindOf(config: Pick<OnboardingConfig, 'raceType'> | null | undefined): PlanKind {
  switch (config?.raceType) {
    case 'hyrox': return 'hyrox'
    case 'trail': return 'trail'
    case 'general': return 'general'
    default: return 'road'
  }
}

/** True when the value is inside the kind's sanity bounds. */
export function isPlausible(kind: BenchmarkKind, value: number): boolean {
  const s = BENCHMARK_KINDS[kind]
  return Number.isFinite(value) && value >= s.min && value <= s.max
}

/** Newest live entry of each kind. Newest by the DATE IT WAS MEASURED, then
 *  by when it was recorded — a 5K from June entered today does not outrank
 *  a 5K from August entered last week. */
export function latestByKind(log: readonly Benchmark[]): Partial<Record<BenchmarkKind, Benchmark>> {
  const out: Partial<Record<BenchmarkKind, Benchmark>> = {}
  for (const b of log) {
    if (b.deleted) continue
    const cur = out[b.kind]
    if (!cur || b.dateIso > cur.dateIso || (b.dateIso === cur.dateIso && b.at > cur.at)) out[b.kind] = b
  }
  return out
}

/** Live entries, newest measured first — the history the Settings card shows. */
export function liveEntries(log: readonly Benchmark[]): Benchmark[] {
  return log.filter(b => !b.deleted).sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.at - a.at)
}

// ── Series: the unit of "tracking over time" ───────────────────────────
//
// A preset kind is its own series. `other` is many: the athlete's "Murph"
// and "dead hang" are different benchmarks that happen to share the
// catch-all kind, so they group by label, not by kind.

export type ProgressDirection = 'lower' | 'higher' | 'neutral'

export interface BenchmarkSeries {
  key: string
  kind: BenchmarkKind
  /** Athlete-facing name: the preset label, or the custom label. */
  label: string
  /** Newest measured first. */
  entries: Benchmark[]
}

function normalizedLabel(label: string | undefined): string {
  return (label ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Which series an entry belongs to. */
export function seriesKey(b: Pick<Benchmark, 'kind' | 'label'>): string {
  return b.kind === 'other' ? `other:${normalizedLabel(b.label)}` : b.kind
}

/** Same series as `a` — the kind, and for custom entries the label too. */
export function sameSeries(a: Pick<Benchmark, 'kind' | 'label'>, b: Pick<Benchmark, 'kind' | 'label'>): boolean {
  return seriesKey(a) === seriesKey(b)
}

/** Group live entries into series, each newest-first, in the order the
 *  plan's presets are listed (custom series last, by first appearance). */
export function groupBySeries(live: readonly Benchmark[], plan: PlanKind): BenchmarkSeries[] {
  const order = [...new Set([...kindsForPlan(plan), ...(Object.keys(BENCHMARK_KINDS) as BenchmarkKind[])])]
  const byKey = new Map<string, BenchmarkSeries>()
  for (const b of liveEntries(live)) {
    const key = seriesKey(b)
    const cur = byKey.get(key)
    if (cur) cur.entries.push(b)
    else byKey.set(key, { key, kind: b.kind, label: b.kind === 'other' && b.label ? b.label.trim() : BENCHMARK_KINDS[b.kind].label, entries: [b] })
  }
  const rank = (s: BenchmarkSeries) => order.indexOf(s.kind)
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b))
}

/** Which way is progress for this benchmark. Times fall, reps and loads
 *  rise, a plank hold rises; a threshold HR or an RPE just moves, and a
 *  custom time could be either (a Murph falls, a dead hang rises), so
 *  those are reported without a verdict. */
export function progressDirection(b: Pick<Benchmark, 'kind' | 'unit'>): ProgressDirection {
  if (b.kind === 'other') return b.unit === 'reps' || b.unit === 'lb' ? 'higher' : 'neutral'
  if (b.kind === 'plank') return 'higher'
  switch (b.unit) {
    case 'seconds': return 'lower'
    case 'reps': case 'lb': return 'higher'
    default: return 'neutral'
  }
}

export interface SeriesProgress {
  latest: Benchmark
  previous: Benchmark | null
  oldest: Benchmark
  /** Best by the series' direction; the latest when there is no direction. */
  best: Benchmark
  /** latest − previous, in the series' unit; null with one entry. */
  deltaVsPrevious: number | null
  /** latest − oldest; null with one entry. */
  deltaSinceFirst: number | null
  /** Weeks from oldest to latest measurement. */
  spanWeeks: number
  /** 'better' / 'worse' by direction for deltaVsPrevious; 'same' when
   *  equal; 'neutral' when the series has no direction. */
  verdict: 'better' | 'worse' | 'same' | 'neutral'
}

/** Where the series stands. `entries` newest-first, as groupBySeries gives. */
export function seriesProgress(entries: readonly Benchmark[]): SeriesProgress | null {
  if (entries.length === 0) return null
  const latest = entries[0]
  const previous = entries[1] ?? null
  const oldest = entries[entries.length - 1]
  const dir = progressDirection(latest)
  let best = latest
  if (dir !== 'neutral') {
    for (const e of entries) {
      if (dir === 'lower' ? e.value < best.value : e.value > best.value) best = e
    }
  }
  const deltaVsPrevious = previous ? latest.value - previous.value : null
  const deltaSinceFirst = previous ? latest.value - oldest.value : null
  const spanWeeks = Math.max(0, Math.round(daysBetween(oldest.dateIso.slice(0, 10), latest.dateIso.slice(0, 10)) / 7))
  let verdict: SeriesProgress['verdict'] = 'neutral'
  if (deltaVsPrevious != null && dir !== 'neutral') {
    verdict = deltaVsPrevious === 0 ? 'same' : (dir === 'lower' ? deltaVsPrevious < 0 : deltaVsPrevious > 0) ? 'better' : 'worse'
  }
  return { latest, previous, oldest, best, deltaVsPrevious, deltaSinceFirst, spanWeeks, verdict }
}

export function ageWeeks(b: Pick<Benchmark, 'dateIso'>, todayIso: string): number {
  return Math.max(0, Math.floor(daysBetween(b.dateIso.slice(0, 10), todayIso) / 7))
}

/** Past the engine's own re-test clock for that kind; false when it has none. */
export function isStale(b: Pick<Benchmark, 'kind' | 'dateIso'>, todayIso: string): boolean {
  const weeks = BENCHMARK_KINDS[b.kind].staleAfterWeeks
  return weeks != null && ageWeeks(b, todayIso) > weeks
}

// ── The adapter: log → the fields the engines already read ─────────────

export interface DerivedAnchors {
  fitnessAnchor?: FitnessAnchor
  testedLthrBpm?: number
  skiErg1kSeconds?: number
  row1kSeconds?: number
  /** Only the fields the log can speak to; `measuredAt` is the newest of
   *  them. Absent when the log holds no strength entry at all. */
  capacity?: StrengthCapacity
}

const CAPACITY_FIELD: Partial<Record<BenchmarkKind, keyof StrengthCapacity>> = {
  push_ups: 'pushUps',
  goblet_squat_8rm: 'gobletSquatLb',
  plank: 'plankSec',
  wall_balls_unbroken: 'wallBallsUnbroken',
  sled_push_rpe: 'sledRpe',
  erg_500: 'erg500Sec',
  erg_1k: 'erg1kSec',
}

export function deriveAnchors(log: readonly Benchmark[]): DerivedAnchors {
  const latest = latestByKind(log)
  const out: DerivedAnchors = {}

  // A race outranks an easy pace regardless of date. Among races, newest wins.
  const race = RACE_KINDS.map(k => latest[k]).filter((b): b is Benchmark => !!b)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.at - a.at)[0]
  if (race) {
    out.fitnessAnchor = { type: race.kind as FitnessAnchorType, valueSeconds: race.value, dateIso: race.dateIso }
  } else if (latest.easy_pace) {
    out.fitnessAnchor = { type: 'easy_pace', valueSeconds: latest.easy_pace.value, dateIso: latest.easy_pace.dateIso }
  }

  // The LTHR goes beside the pace anchor, never in its place.
  if (latest.lthr) out.testedLthrBpm = latest.lthr.value
  if (latest.ski_erg_1k) out.skiErg1kSeconds = latest.ski_erg_1k.value
  if (latest.row_1k) out.row1kSeconds = latest.row_1k.value

  let cap: StrengthCapacity | null = null
  for (const [kind, field] of Object.entries(CAPACITY_FIELD) as [BenchmarkKind, keyof StrengthCapacity][]) {
    const b = latest[kind]
    if (!b) continue
    if (!cap) cap = { measuredAt: b.dateIso }
    ;(cap as unknown as Record<string, unknown>)[field] = b.value
    if (b.dateIso > cap.measuredAt) cap.measuredAt = b.dateIso
    if ((kind === 'erg_500' || kind === 'erg_1k') && b.source === 'manual') cap.ergManual = true
  }
  if (cap) out.capacity = cap

  return out
}

// ── Seeding: the fields it replaces become its first entries ───────────

/** Deterministic ids so seeding twice (two devices, first load each) unions
 *  to one entry per field instead of duplicating it. */
function seedId(kind: BenchmarkKind): string {
  return `seed_${kind}`
}

/** Build the log's first entries from what the athlete has already told the
 *  app. Runs only when the log is empty. Dates come from the fields that
 *  carry one; the rest fall back to when onboarding finished. */
export function seedFromExisting(
  config: OnboardingConfig | null | undefined,
  capacity: StrengthCapacity | null | undefined,
  at: number,
): Benchmark[] {
  const out: Benchmark[] = []
  // Local calendar date, never a UTC round-trip — see localDateDiscipline.test.
  const fallbackDate = (config?.completedAt || '').slice(0, 10) || isoFromLocalDate(new Date(at))

  const fa = config?.fitnessAnchor
  if (fa && fa.type !== 'none') {
    const kind = fa.type as BenchmarkKind
    if (fa.type === 'lthr' && fa.bpm) {
      out.push({ id: seedId('lthr'), kind: 'lthr', value: fa.bpm, unit: 'bpm', dateIso: fa.dateIso ?? fallbackDate, source: 'derived', at })
    } else if (fa.valueSeconds && kind in BENCHMARK_KINDS) {
      out.push({ id: seedId(kind), kind, value: fa.valueSeconds, unit: 'seconds', dateIso: fa.dateIso ?? fallbackDate, source: 'derived', at })
    }
  }
  if (config?.testedLthrBpm && !out.some(b => b.kind === 'lthr')) {
    out.push({ id: seedId('lthr'), kind: 'lthr', value: config.testedLthrBpm, unit: 'bpm', dateIso: fallbackDate, source: 'derived', at })
  }
  if (config?.skiErg1kSeconds) out.push({ id: seedId('ski_erg_1k'), kind: 'ski_erg_1k', value: config.skiErg1kSeconds, unit: 'seconds', dateIso: fallbackDate, source: 'derived', at })
  if (config?.row1kSeconds) out.push({ id: seedId('row_1k'), kind: 'row_1k', value: config.row1kSeconds, unit: 'seconds', dateIso: fallbackDate, source: 'derived', at })

  if (capacity) {
    for (const [kind, field] of Object.entries(CAPACITY_FIELD) as [BenchmarkKind, keyof StrengthCapacity][]) {
      const v = capacity[field]
      if (typeof v !== 'number') continue
      out.push({
        id: seedId(kind), kind, value: v, unit: BENCHMARK_KINDS[kind].unit,
        dateIso: capacity.measuredAt.slice(0, 10),
        source: (kind === 'erg_500' || kind === 'erg_1k') && capacity.ergManual ? 'manual' : 'logged',
        at,
      })
    }
  }
  return out
}

/** A strength benchmark session just saved a capacity: record what it
 *  measured so the log stays the source of truth. Only fields that differ
 *  from the log's current view become entries. */
export function entriesFromCapacity(
  capacity: StrengthCapacity,
  log: readonly Benchmark[],
  at: number,
): Benchmark[] {
  const latest = latestByKind(log)
  const out: Benchmark[] = []
  for (const [kind, field] of Object.entries(CAPACITY_FIELD) as [BenchmarkKind, keyof StrengthCapacity][]) {
    const v = capacity[field]
    if (typeof v !== 'number') continue
    const cur = latest[kind]
    if (cur && cur.value === v && cur.dateIso === capacity.measuredAt.slice(0, 10)) continue
    out.push({
      id: `bm_${at}_${kind}`, kind, value: v, unit: BENCHMARK_KINDS[kind].unit,
      dateIso: capacity.measuredAt.slice(0, 10),
      source: (kind === 'erg_500' || kind === 'erg_1k') && capacity.ergManual ? 'manual' : 'logged',
      at,
    })
  }
  return out
}
