/**
 * Plan QA gate (P1 of the generator product plan).
 *
 * A pure, fast linter over a generated (or edited) plan. Every rule here
 * encodes a defect that actually shipped in a generated plan — the
 * 2026-08-16 review (dual-race Oakland Hills + HYROX season) — or a
 * structural invariant the v2 rebuild's "QA Checks" workbook tab
 * enforced. Generation appends findings to the plan's advisories
 * (never silently ships an error); CI runs the validator across the
 * golden personas so a regression fails the build, not the athlete.
 *
 * Deliberately dependency-light: everything is derived from the plan
 * object itself so the validator can also run over spliced season weeks
 * and stored/edited plans.
 */
import type { HRZone, PlannedDay, RaceInfo, TrainingWeek } from '../../types'
import { FULL_SIM_DAYS_OUT } from '../hyrox/heuristics'

export interface PlanQAFinding {
  /** Stable rule id (e.g. 'qa_d1_load') — one advisory per id after aggregation. */
  id: string
  severity: 'error' | 'warn'
  title: string
  detail: string
  weekNum?: number
  day?: string
}

export interface PlanQAResult {
  findings: PlanQAFinding[]
  errors: PlanQAFinding[]
  warnings: PlanQAFinding[]
  pass: boolean
}

export interface PlanQAInput {
  weeks: TrainingWeek[]
  zones?: HRZone[]
  race?: RaceInfo
  /** Predicted race finish (minutes, vert-adjusted) when the generator
   *  computed one — enables the long-run duration-adequacy rule. */
  predictedFinishMin?: number
  /** P4.1 — zones came from self-reports, not a test, AND the athlete is
   *  healthy enough to test: a calibration benchmark must appear early. */
  zonesEstimated?: boolean
  /** P4.3 — the athlete declared an injury area: prehab must appear. */
  injuryArea?: string
}

/** Vert density (ft/mi) above which a race demands vert-specific training
 *  — same threshold the generator's isClimby gate uses. */
const CLIMBY_FT_PER_MI = 100

/** Ratio guards for a session's displayed duration range. The v1 bug was a
 *  3× method-wide placeholder ("30-90 min"). */
const RANGE_WARN_RATIO = 1.5
const RANGE_ERROR_RATIO = 2.5

/** D-1 run cap in minutes (v2 QA check #10). */
const D1_MAX_MIN = 25

function parseTimeRange(t: string | undefined): [number, number] | null {
  if (!t) return null
  const range = t.match(/(\d+)\s*[–-]\s*(\d+)\s*min/)
  if (range) return [parseInt(range[1], 10), parseInt(range[2], 10)]
  const single = t.match(/(\d+)\s*min/)
  return single ? [parseInt(single[1], 10), parseInt(single[1], 10)] : null
}

const MI_PER_UNIT: Record<string, number> = { mi: 1, km: 0.621371, m: 0.000621371 }
const DEFAULT_PACE_SEC_PER_MI = 575 // 9:35 — midpoint of a typical easy band

function segPaceSecPerMi(s: { paceTarget?: { paceSecPerMileLow?: number; paceSecPerMileHigh?: number } }): number | null {
  const t = s.paceTarget
  if (t?.paceSecPerMileLow != null && t?.paceSecPerMileHigh != null) {
    return (t.paceSecPerMileLow + t.paceSecPerMileHigh) / 2
  }
  return null
}

/** Minutes a workout's steps add up to — reps and timed recoveries
 *  included; distance segments converted via their pace target. Returns
 *  null when any work segment can't be timed (distance with no pace), so
 *  the consistency check never fires on an unknowable total. */
function stepTotalMinutes(day: PlannedDay): number | null {
  const pw = day.plannedWorkout
  if (!pw) return null
  let total = 0
  let hasWork = false
  for (const s of pw.segments) {
    const reps = s.reps ?? 1
    if (s.duration) {
      hasWork = true
      const per = s.duration.unit === 'sec' ? s.duration.value / 60 : s.duration.value
      total += per * reps
    } else if (s.distance) {
      const pace = segPaceSecPerMi(s)
      if (pace == null) return null
      hasWork = true
      const mi = s.distance.value * (MI_PER_UNIT[s.distance.unit] ?? 1) * reps
      total += (mi * pace) / 60
    }
    if (s.reps && s.recovery?.duration) {
      const rec = s.recovery.duration
      total += (rec.unit === 'sec' ? rec.value / 60 : rec.value) * s.reps
    } else if (s.reps && s.recovery?.distance) {
      const mi = s.recovery.distance.value * (MI_PER_UNIT[s.recovery.distance.unit] ?? 1) * s.reps
      total += (mi * DEFAULT_PACE_SEC_PER_MI) / 60
    }
  }
  return hasWork ? total : null
}

/** Independent re-estimate of a day's run miles from its own segments —
 *  falling back to the zone string's leading "X mi" for text-only days
 *  (the Hyrox generator's session vocabulary carries miles there). */
function estimateDayMiles(day: PlannedDay): number {
  const pw = day.plannedWorkout
  if (!pw) {
    const m = day.zone?.match(/^([\d.]+) mi/)
    return m ? parseFloat(m[1]) : 0
  }
  let miles = 0
  for (const s of pw.segments) {
    const reps = s.reps ?? 1
    const pace =
      s.paceTarget?.paceSecPerMileLow != null && s.paceTarget?.paceSecPerMileHigh != null
        ? (s.paceTarget.paceSecPerMileLow + s.paceTarget.paceSecPerMileHigh) / 2
        : DEFAULT_PACE_SEC_PER_MI
    if (s.distance) {
      miles += s.distance.value * (MI_PER_UNIT[s.distance.unit] ?? 1) * reps
    } else if (s.duration) {
      const minutes = (s.duration.unit === 'sec' ? s.duration.value / 60 : s.duration.value) * reps
      miles += minutes / (pace / 60)
    }
    if (s.reps && s.recovery?.duration) {
      const rec = s.recovery.duration
      const recMin = (rec.unit === 'sec' ? rec.value / 60 : rec.value) * s.reps
      miles += recMin / (DEFAULT_PACE_SEC_PER_MI / 60)
    }
  }
  return miles
}

/** Content hash of a week's prescriptions — dates excluded, so two weeks
 *  telling the athlete to do literally the same thing collide. */
function weekContentKey(w: TrainingWeek): string {
  return w.days
    .map(d => `${d.type}|${d.workout}|${d.detail}|${d.time ?? ''}|${d.zone ?? ''}`)
    .join('¶')
}

function zoneBand(hr: string): { low: number; high: number } | null {
  const m = hr.match(/(\d+)\s*[–-]\s*(\d+)/)
  return m ? { low: parseInt(m[1], 10), high: parseInt(m[2], 10) } : null
}

// Matches the vert-prescription stamps ("~1700 ft gain", downhill-repeat
// notes) and any authored climbing/descent/power-hiking content.
const VERT_CONTENT = /vert|downhill|descen[dt]|power.?hik|ft gain/i
const RESTLIKE = new Set(['rest', 'cross', 'strength'])

export function validatePlan(input: PlanQAInput): PlanQAResult {
  const { weeks, zones, race } = input
  const findings: PlanQAFinding[] = []
  const add = (f: PlanQAFinding) => findings.push(f)

  // ── per-week structural rules ─────────────────────────────────────
  weeks.forEach((w, wi) => {
    const isFinal = wi === weeks.length - 1

    if (!isFinal && w.days.length !== 7) {
      add({
        id: 'qa_week_length', severity: 'warn', weekNum: w.num,
        title: 'Week is not 7 days',
        detail: `Week ${w.num} has ${w.days.length} scheduled days; every non-final week should cover the full 7.`,
      })
    }

    if (w.days.length >= 5 && !w.days.some(d => d.type === 'rest')) {
      add({
        id: 'qa_rest_day', severity: 'error', weekNum: w.num,
        title: 'No rest day',
        detail: `Week ${w.num} schedules ${w.days.length} days with no full rest day.`,
      })
    }

    for (const d of w.days) {
      const range = parseTimeRange(d.time)
      if (!range) continue
      const [lo, hi] = range
      if (lo > 0 && hi / lo > RANGE_WARN_RATIO) {
        const isError = hi / lo > RANGE_ERROR_RATIO
        add({
          id: 'qa_duration_range', severity: isError ? 'error' : 'warn', weekNum: w.num, day: d.day,
          title: 'Vague session duration',
          detail: `${d.day} "${d.workout}" shows ${d.time} — a ${(hi / lo).toFixed(1)}× range reads as a placeholder, not a prescription.`,
        })
      }
      const total = stepTotalMinutes(d)
      if (total != null && (total < lo * 0.9 - 1 || total > hi * 1.1 + 1)) {
        add({
          id: 'qa_duration_consistency', severity: 'error', weekNum: w.num, day: d.day,
          title: 'Steps disagree with session time',
          detail: `${d.day} "${d.workout}": header says ${d.time} but the steps add up to ~${Math.round(total)} min.`,
        })
      }
    }

    // Weekly total vs what the days actually prescribe (v2 QA: nothing hidden).
    const shown = Number(w.miles)
    if (Number.isFinite(shown) && shown > 0) {
      const est = w.days.reduce((s, d) => s + estimateDayMiles(d), 0)
      if (est > 0 && Math.abs(est - shown) / shown > 0.2) {
        add({
          id: 'qa_totals_reconcile', severity: 'warn', weekNum: w.num,
          title: 'Weekly total does not reconcile',
          detail: `Week ${w.num} header says ${shown} mi but its sessions add up to ~${Math.round(est * 10) / 10} mi.`,
        })
      }
    }
  })

  // ── race-proximity rules ──────────────────────────────────────────
  const flat: { day: PlannedDay; week: TrainingWeek }[] = weeks.flatMap(w => w.days.map(day => ({ day, week: w })))
  flat.forEach(({ day, week }, i) => {
    if (day.type !== 'race') return
    const before = i > 0 ? flat[i - 1] : undefined
    if (!before || RESTLIKE.has(before.day.type)) return
    const range = parseTimeRange(before.day.time)
    if (range && range[1] > D1_MAX_MIN) {
      add({
        id: 'qa_d1_load', severity: 'error', weekNum: week.num, day: before.day.day,
        title: 'Too much running the day before a race',
        detail: `${before.day.day} "${before.day.workout}" (${before.day.time}) sits the day before "${day.workout}" — cap it at ${D1_MAX_MIN} min or rest.`,
      })
    }
    if (before.day.type === 'quality' || before.day.type === 'long') {
      add({
        id: 'qa_d1_load', severity: 'error', weekNum: week.num, day: before.day.day,
        title: 'Quality session the day before a race',
        detail: `${before.day.day} "${before.day.workout}" is a ${before.day.type} session the day before "${day.workout}".`,
      })
    }
  })

  if (race?.date) {
    const hasRaceDay = flat.some(({ day }) => day.type === 'race')
    if (!hasRaceDay && weeks.length > 0) {
      add({
        id: 'qa_race_day', severity: 'warn',
        title: 'No race day on the calendar',
        detail: `The plan never marks race day (${race.date}).`,
      })
    }
  }

  // ── taper monotonicity ────────────────────────────────────────────
  const taperIdx = weeks.findIndex(w => /taper/i.test(w.focus))
  if (taperIdx > 0) {
    let prev = Number(weeks[taperIdx - 1].miles)
    for (let i = taperIdx; i < weeks.length; i++) {
      const w = weeks[i]
      if (!/taper|race/i.test(w.focus)) break
      const mi = Number(w.miles)
      if (!Number.isFinite(mi) || !Number.isFinite(prev)) break
      // Race-week miles include the race itself — exempt weeks with a race day.
      const hasRace = w.days.some(d => d.type === 'race')
      if (!hasRace && mi > prev + 0.11) {
        add({
          id: 'qa_taper_monotonic', severity: 'error', weekNum: w.num,
          title: 'Taper week out-volumes the week before it',
          detail: `Week ${w.num} ("${w.focus}") carries ${mi} mi against ${prev} mi the week before — a taper must step down.`,
        })
      }
      if (!hasRace) prev = mi
    }
  }

  // ── progression: no identical weeks ───────────────────────────────
  // A single repeated pair (a plateau week) is a caution; the same
  // content appearing 3+ times is the v1 pathology (whole blocks of
  // clones — zero progression) and is an error.
  const groups = new Map<string, TrainingWeek[]>()
  for (const w of weeks) {
    if (/cutback|recovery/i.test(w.focus)) continue
    if (w.days.every(d => RESTLIKE.has(d.type))) continue
    const key = weekContentKey(w)
    const list = groups.get(key) ?? []
    list.push(w)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const nums = list.map(w => w.num).join(', ')
    add({
      id: 'qa_duplicate_weeks',
      severity: list.length >= 3 ? 'error' : 'warn',
      weekNum: list[1].num,
      title: 'Identical training weeks',
      detail: `Weeks ${nums} prescribe byte-for-byte identical content — repetition without progression is maintenance, not training.`,
    })
  }

  // ── zone contiguity ───────────────────────────────────────────────
  if (zones && zones.length > 1) {
    for (let i = 0; i < zones.length - 1; i++) {
      const cur = zoneBand(zones[i].hr)
      const next = zoneBand(zones[i + 1].hr)
      if (!cur || !next) continue
      if (cur.high !== next.low - 1 && cur.high !== next.low) {
        add({
          id: 'qa_zone_gaps', severity: 'error',
          title: 'Heart-rate zones have gaps or overlaps',
          detail: `${zones[i].zone} tops out at ${cur.high} bpm but ${zones[i + 1].zone} starts at ${next.low} — ${
            cur.high < next.low ? `${cur.high + 1}–${next.low - 1} bpm belongs to no zone` : 'the bands overlap'
          }.`,
        })
      }
    }
  }

  // ── race specificity: long-run duration adequacy ──────────────────
  if (input.predictedFinishMin && input.predictedFinishMin >= 90) {
    let peakLongMin = 0
    for (const { day } of flat) {
      if (day.type !== 'long') continue
      const range = parseTimeRange(day.time)
      if (range) peakLongMin = Math.max(peakLongMin, range[1])
    }
    if (peakLongMin > 0 && peakLongMin < 0.5 * input.predictedFinishMin) {
      add({
        id: 'qa_long_run_adequacy', severity: 'warn',
        title: 'Longest run is short for this race',
        detail: `Race day is predicted to take ~${Math.round(input.predictedFinishMin)} min but the biggest long run peaks at ${peakLongMin} min (${Math.round((peakLongMin / input.predictedFinishMin) * 100)}%) — time on feet should approach at least half the race duration.`,
      })
    }
  }

  // ── race specificity: vert ────────────────────────────────────────
  const vertFt = race?.elevationGainFt ?? 0
  const raceMiles = race?.distanceMiles ?? 0
  if (vertFt > 0 && raceMiles > 0 && vertFt / raceMiles > CLIMBY_FT_PER_MI) {
    const vertDays = flat.filter(({ day }) =>
      VERT_CONTENT.test(`${day.workout} ${day.detail}`))
    if (vertDays.length < 3) {
      add({
        id: 'qa_vert_specificity', severity: 'error',
        title: 'Mountain race, flat plan',
        detail: `${race!.name || 'The race'} climbs ~${vertFt} ft over ${raceMiles} mi (${Math.round(vertFt / raceMiles)} ft/mi) but the plan contains ${vertDays.length === 0 ? 'no' : `only ${vertDays.length}`} climbing/descent session${vertDays.length === 1 ? '' : 's'}.`,
      })
    }
  }

  // ── safety: calibration + prehab (P4) ─────────────────────────────
  if (input.zonesEstimated && weeks.length > 2) {
    const early = weeks.slice(0, 3).flatMap(w => w.days)
    if (!early.some(d => /benchmark|time.?trial/i.test(d.workout))) {
      add({
        id: 'qa_benchmark_missing', severity: 'warn',
        title: 'Estimated zones, no calibration test',
        detail: 'Every zone in this plan derives from self-reported numbers, but no benchmark/time-trial session is scheduled in the first three weeks to calibrate them.',
      })
    }
  }
  if (input.injuryArea && weeks.length > 1) {
    const prehabDays = flat.filter(({ day }) => /PREHAB/i.test(day.detail)).length
    if (prehabDays < Math.min(6, weeks.length)) {
      add({
        id: 'qa_prehab_missing', severity: 'warn',
        title: 'Injury history without prehab',
        detail: `The athlete declared a ${input.injuryArea.replace(/_/g, '/')} history but the plan carries prehab in only ${prehabDays} session${prehabDays === 1 ? '' : 's'} — the best-evidenced injury-prevention lever is being left unused.`,
      })
    }
  }

  // ── load-spike guard (P4.4, v2's joint rule) ──────────────────────
  // Flag only when BOTH weekly time rises >35% over the prior week AND
  // vertical gain exceeds every previous week by >35% — rebounding out of
  // a cutback week is normal and must not warn.
  {
    const weekMinutes = (w: TrainingWeek) =>
      w.days.reduce((s, d) => {
        const r = parseTimeRange(d.time)
        return s + (r ? (r[0] + r[1]) / 2 : 0)
      }, 0)
    const weekVert = (w: TrainingWeek) =>
      w.days.reduce((s, d) => {
        const m = d.detail.match(/~?(\d+)\s*ft gain/)
        return s + (m ? parseInt(m[1], 10) : 0)
      }, 0)
    let maxPriorVert = 0
    // Time compares against the last NON-cutback week (rebounding out of a
    // cutback is normal periodization, per the v2 rule) with a full-week,
    // non-trivial baseline; vert compares against every previous week.
    let baselineMin = 0
    weeks.forEach((w, i) => {
      const min = weekMinutes(w)
      const vert = weekVert(w)
      if (i > 0 && baselineMin >= 120 && maxPriorVert >= 500) {
        const timeSpike = min > baselineMin * 1.35
        const vertSpike = vert > maxPriorVert * 1.35
        if (timeSpike && vertSpike) {
          add({
            id: 'qa_load_spike', severity: 'warn', weekNum: w.num,
            title: 'Time and vert spike together',
            detail: `Week ${w.num} raises total time >35% over the last full training week AND vertical gain >35% over every previous week — one of the two needs to come down.`,
          })
        }
      }
      if (!/cutback|recovery/i.test(w.focus) && w.days.length >= 6) baselineMin = min
      maxPriorVert = Math.max(maxPriorVert, vert)
    })
  }

  // ── race specificity: Hyrox (P3) ──────────────────────────────────
  const isHyrox = race?.format === 'hyrox' || /hyrox/i.test(`${race?.name ?? ''} ${race?.distance ?? ''}`)
  if (isHyrox && race?.date && weeks.length > 0) {
    const raceIso = race.date
    const planStartIso = weeks[0].startIso
    const runwayDays = planStartIso ? Math.round((Date.parse(`${raceIso}T12:00:00`) - Date.parse(`${planStartIso}T12:00:00`)) / 86_400_000) : 0
    // Only demand the key sessions when the runway can physically hold them.
    if (runwayDays >= 21) {
      let simOk = false
      for (const w of weeks) {
        if (!w.startIso) continue
        w.days.forEach((d, idx) => {
          if (!/full race simulation/i.test(d.workout)) return
          const dayIso = new Date(Date.parse(`${w.startIso}T12:00:00`) + idx * 86_400_000).toISOString().slice(0, 10)
          const daysOut = Math.round((Date.parse(`${raceIso}T12:00:00`) - Date.parse(`${dayIso}T12:00:00`)) / 86_400_000)
          if (daysOut >= FULL_SIM_DAYS_OUT.value.min) simOk = true
        })
      }
      if (!simOk) {
        add({
          id: 'qa_hyrox_simulation', severity: 'error',
          title: 'No full race simulation',
          detail: 'A Hyrox plan with 3+ weeks of runway must schedule one complete 8-run + 8-station simulation at least 10 days before race day.',
        })
      }
      const specOk = flat.some(({ day }) => day.detail.includes('at full race spec'))
      if (!specOk) {
        add({
          id: 'qa_hyrox_race_spec', severity: 'error',
          title: 'Stations never reach race spec',
          detail: 'No session trains the stations at full race distance/reps — the athlete would meet race volumes for the first time on race day (the v1 failure: every station capped at half spec).',
        })
      }
    }
  }

  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warn')
  return { findings, errors, warnings, pass: errors.length === 0 }
}

/**
 * Aggregate findings into plan advisories — one per rule id, error → critical.
 * Generation appends these so a failing plan is never silently shipped.
 */
export function qaFindingsToAdvisories(result: PlanQAResult): {
  id: string
  severity: 'caution' | 'critical'
  title: string
  detail: string
}[] {
  const byId = new Map<string, PlanQAFinding[]>()
  for (const f of result.findings) {
    const list = byId.get(f.id) ?? []
    list.push(f)
    byId.set(f.id, list)
  }
  return [...byId.entries()].map(([id, list]) => ({
    id,
    severity: list.some(f => f.severity === 'error') ? 'critical' as const : 'caution' as const,
    title: list[0].title,
    detail: list.length === 1 ? list[0].detail : `${list[0].detail} (+${list.length - 1} more like this)`,
  }))
}
