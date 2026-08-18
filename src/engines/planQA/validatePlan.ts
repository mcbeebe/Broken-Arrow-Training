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
import { invariantRulesFor } from '../planGenerator/methodInvariants'
import { getMethodById } from '../../data/methods'

/** Phase 2 (104-F1) — the authored gates for one workout, looked up from
 *  the method registry so the validator re-checks what generation used. */
function workoutGateFor(methodId: string, workoutId: string): { minimumExperience?: string; requiresBaseMileage?: number } | null {
  const method = getMethodById(methodId)
  const w = method?.workouts.find(x => x.id === workoutId)
  if (!w) return null
  return { minimumExperience: w.minimumExperience, requiresBaseMileage: w.requiresBaseMileage }
}

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
  /** Phase 2 (PRD-104) — the dosing contract's persona inputs. The
   *  effective experience level is the POST-downgrade routing level (the
   *  low-mileage rule may have lowered it); age gates the senior strength
   *  ban; declared mileage anchors the volume band. */
  effectiveExperience?: 'beginner' | 'recreational' | 'intermediate' | 'advanced' | 'elite'
  age?: number
  /** R2 — the generating method's id: activates that method's authored
   *  invariants (long-run share, hard-day spacing, quality share) from
   *  the methodInvariants registry. Absent for Hyrox / spliced-season /
   *  hand-authored inputs. */
  methodId?: string
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
      // A spliced season's post-race "recovery" weeks are NOT part of the
      // taper — "Post-race" used to match the /race/ alternation and flag
      // the (correctly rising) reverse-taper as a broken taper.
      if (/recover|post-race|bridge/i.test(w.focus)) break
      if (!/taper|race/i.test(w.focus)) break
      const mi = Number(w.miles)
      if (!Number.isFinite(mi) || !Number.isFinite(prev)) break
      // Race-week miles include the race itself — exempt weeks with a race day.
      const hasRace = w.days.some(d => d.type === 'race')
      // Phase 1 — 0.5 mi allowance: taper frequency preservation keeps
      // short runs instead of deleting days, and honest 15-min floors can
      // sum a few tenths over the prior week. A real taper violation is
      // miles, not rounding.
      if (!hasRace && mi > prev + 0.5) {
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
    // Identical content is an ERROR when the plan's own targets CLAIM
    // progression across those weeks (>1 mi of spread the content never
    // delivers). A genuine plateau — targets flat at the plan's volume
    // floor or cap — is honest maintenance (published first-timer plans
    // repeat weeks verbatim) and stays a caution.
    const targets = list.map(w => (Number.isFinite(w.targetMi) ? (w.targetMi as number) : Number(w.miles) || 0))
    const targetSpread = Math.max(...targets) - Math.min(...targets)
    add({
      id: 'qa_duplicate_weeks',
      severity: list.length >= 3 && targetSpread > 1 ? 'error' : 'warn',
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
      // Phase 2 (101-F4) — for marathon-plus efforts (predicted ≥ 3 h), a
      // peak long run under 40% of race duration is a readiness ERROR,
      // not a caution: nothing in the plan rehearses the day.
      const severe = input.predictedFinishMin >= 180 && peakLongMin < 0.4 * input.predictedFinishMin
      add({
        id: 'qa_long_run_adequacy', severity: severe ? 'error' : 'warn',
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
      // R0 — the time and vert legs fire independently. The old conjunction
      // (`timeSpike && vertSpike`, gated on ≥500 ft of prior vert) could
      // never fire on a flat road plan, which is how +119% weekly jumps
      // shipped unflagged. A combined spike stays the louder finding.
      if (i > 0 && baselineMin >= 120) {
        const timeSpike = min > baselineMin * 1.35
        const vertSpike = maxPriorVert >= 500 && vert > maxPriorVert * 1.35
        if (timeSpike && vertSpike) {
          add({
            id: 'qa_load_spike', severity: 'warn', weekNum: w.num,
            title: 'Time and vert spike together',
            detail: `Week ${w.num} raises total time >35% over the last full training week AND vertical gain >35% over every previous week — one of the two needs to come down.`,
          })
        } else if (timeSpike) {
          add({
            id: 'qa_load_spike', severity: 'warn', weekNum: w.num,
            title: 'Training time spikes',
            detail: `Week ${w.num} raises total training time >35% over the last full training week — spread the increase out.`,
          })
        }
      }
      if (!/cutback|recovery/i.test(w.focus) && w.days.length >= 6) baselineMin = min
      maxPriorVert = Math.max(maxPriorVert, vert)
    })
  }

  // ── weekly mileage ramp (R0) ──────────────────────────────────────
  // The missing 10%-rule guardrail from the running-plan audit: run
  // mileage must not jump >30% (error) / >20% (warn) over the last full
  // training week. Cutback weeks never move the baseline (rebounding out
  // of one is normal periodization); race weeks and post-race
  // recover/bridge weeks are neither subjects nor baselines.
  // Run-mileage is the wrong load unit for Hyrox (stations carry the load
  // and simulation weeks make run miles lumpy by design) — the time-spike
  // rule above covers those plans.
  if (!(race?.format === 'hyrox' || /hyrox/i.test(`${race?.name ?? ''} ${race?.distance ?? ''}`))) {
    const isRaceWeek = (w: TrainingWeek) => w.days.some(d => d.type === 'race')
    const isRecoverish = (w: TrainingWeek) =>
      /recover|bridge|post-race|reverse taper/i.test(w.focus ?? '')
    const isCutbackWk = (w: TrainingWeek) => /cutback|recovery week/i.test(w.focus ?? '')
    // Taper weeks never become baselines: their volume is deliberately
    // depressed and transient — a season's next build resuming at ~85% of
    // the PRE-taper peak is textbook, but read against the taper's floor
    // it looks like a +50-90% cliff (the sweep's Carmen season). Tapers
    // are still evaluated as subjects (they only ever step down).
    const isTaperWk = (w: TrainingWeek) => /taper/i.test(w.focus ?? '')
    let baselineMi = 0
    weeks.forEach(w => {
      const mi = Number(w.miles)
      if (!Number.isFinite(mi) || mi <= 0) return
      const skip = isRaceWeek(w) || isRecoverish(w)
      if (!skip && baselineMi >= 5) {
        const ratio = mi / baselineMi
        const jumpMi = mi - baselineMi
        // Phase 1 (105-F2) — error at >30% per the audit spec, WITH an
        // absolute guard (>3 mi): percentages are noise at low volume
        // (8.7 → 11.4 is "+31%" but only 2.7 honest miles — fine), while
        // 30 → 40 is the real cliff the rule exists for.
        if (ratio > 1.3 && jumpMi > 3) {
          add({
            id: 'qa_weekly_ramp', severity: 'error', weekNum: w.num,
            title: 'Weekly mileage jump',
            detail: `Week ${w.num} jumps to ${mi} mi from ${baselineMi} mi the previous full training week (+${Math.round((ratio - 1) * 100)}%) — week-over-week growth belongs near 10%, never above ~30%.`,
          })
        } else if (ratio > 1.2 && jumpMi > 2) {
          add({
            id: 'qa_weekly_ramp', severity: 'warn', weekNum: w.num,
            title: 'Weekly mileage climbing fast',
            detail: `Week ${w.num} rises to ${mi} mi from ${baselineMi} mi (+${Math.round((ratio - 1) * 100)}%) — above the ~10% weekly guideline.`,
          })
        }
      }
      if (!skip && !isCutbackWk(w) && !isTaperWk(w)) baselineMi = mi
    })

    // R3 — block seams: the first BUILD week after a recover/bridge run
    // must resume near the previous block's achieved build volume (the
    // continuity contract: carried peak ×0.85 decay, so ~0.8–1.05× the
    // old build). Resuming ABOVE the previous build is the injury seam
    // the audit measured at +143%; resuming far below wastes the block.
    let seamBaseline = 0
    let inRecoverGap = false
    weeks.forEach(w => {
      const mi = Number(w.miles)
      if (!Number.isFinite(mi) || mi <= 0) return
      if (isRaceWeek(w) || isRecoverish(w)) {
        if (isRecoverish(w)) inRecoverGap = true
        return
      }
      if (inRecoverGap && seamBaseline >= 5) {
        const ratio = mi / seamBaseline
        if (ratio > 1.2) {
          add({
            id: 'qa_block_seam', severity: 'error', weekNum: w.num,
            title: 'Season resumes above the previous build',
            detail: `Week ${w.num} opens the next block at ${mi} mi — the previous block's build topped out at ${seamBaseline} mi. After a taper, race, and recovery, the next build resumes at or below the old volume, never above it.`,
          })
        } else if (ratio < 0.45) {
          add({
            id: 'qa_block_seam', severity: 'warn', weekNum: w.num,
            title: 'Season resumes far below the previous build',
            detail: `Week ${w.num} opens the next block at ${mi} mi against a ${seamBaseline} mi previous build — fitness carried through recovery supports starting near ~85% of it.`,
          })
        }
      }
      inRecoverGap = false
      if (!isCutbackWk(w) && !isTaperWk(w)) seamBaseline = mi
    })
  }

  // ── schedule integrity (Phase 1, PRD-103) ─────────────────────────
  // Mandate #1: no plan ever contains three consecutive HARD days — hard
  // = quality, long, race day, or a heavy/plyometric strength session.
  // Evaluated on the flattened timeline so week and season-splice seams
  // count. Hyrox plans are scoped out (their engine models load its own
  // way and is out of this phase's scope).
  if (!(race?.format === 'hyrox' || /hyrox/i.test(`${race?.name ?? ''} ${race?.distance ?? ''}`))) {
    const hardStrength = (d: PlannedDay) =>
      d.type === 'strength' && /heavy strength \(4–6|explosive power/i.test(d.detail ?? '')
    const isHardDay = (d: PlannedDay) =>
      d.type === 'quality' || d.type === 'long' || d.type === 'race' || hardStrength(d)
    const flat: { day: PlannedDay; weekNum: number }[] = []
    for (const w of weeks) for (const d of w.days) flat.push({ day: d, weekNum: w.num })
    for (let i = 2; i < flat.length; i++) {
      if (isHardDay(flat[i].day) && isHardDay(flat[i - 1].day) && isHardDay(flat[i - 2].day)) {
        add({
          id: 'qa_consecutive_hard', severity: 'error', weekNum: flat[i].weekNum, day: flat[i].day.day,
          title: 'Three hard days in a row',
          detail: `"${flat[i - 2].day.workout}", "${flat[i - 1].day.workout}", and "${flat[i].day.workout}" run on three consecutive days — hard days are capped at two in a row, for every athlete, on every method.`,
        })
        i += 2 // report each run of 3+ once, not once per extra day
      }
    }

    // 103-F3 — interference: a heavy/plyometric strength session the day
    // before a hard run day compromises both.
    for (let i = 0; i < flat.length - 1; i++) {
      const d = flat[i].day
      const nxt = flat[i + 1].day
      if (hardStrength(d) && (nxt.type === 'quality' || nxt.type === 'long' || nxt.type === 'race')) {
        add({
          id: 'qa_strength_interference', severity: 'warn', weekNum: flat[i].weekNum, day: d.day,
          title: 'Heavy strength the day before a hard run',
          detail: `"${d.workout}" lands the day before "${nxt.workout}" — heavy or plyometric work belongs after easy days, not before quality or long runs.`,
        })
      }
    }
  }

  // ── week shape (Phase 1, 103-F6) ──────────────────────────────────
  // Duplicate calendar dates are always a defect (the field bug where a
  // date appeared in two weeks); derived from startIso, the only year-
  // safe signal. Weeks without startIso (legacy) are skipped.
  {
    const seen = new Map<string, number>()
    for (const w of weeks) {
      if (!w.startIso) continue
      for (let i = 0; i < w.days.length; i++) {
        const d = new Date(`${w.startIso}T12:00:00`)
        d.setDate(d.getDate() + i)
        const iso = d.toISOString().slice(0, 10)
        const firstWeek = seen.get(iso)
        if (firstWeek != null && firstWeek !== w.num) {
          add({
            id: 'qa_week_shape', severity: 'error', weekNum: w.num,
            title: 'Calendar date appears in two weeks',
            detail: `${iso} is scheduled in week ${firstWeek} and again in week ${w.num} — no date may ever appear twice.`,
          })
        } else {
          seen.set(iso, w.num)
        }
      }
    }
  }

  // ── combined long-category share (Phase 2, 102-F3) ────────────────
  // A multi-long week (B2B, medium-long) may not stack the whole week on
  // its long days: warn >60%, error >70% of the week's miles. Applies at
  // ≥20 mi; race and recovery weeks exempt.
  weeks.forEach(w => {
    const total = Number(w.miles)
    if (!Number.isFinite(total) || total < 20) return
    if (w.days.some(d => d.type === 'race')) return
    if (/recover|bridge|post-race/i.test(w.focus ?? '')) return
    const longMi = w.days.filter(d => d.type === 'long').reduce((t, d) => t + estimateDayMiles(d), 0)
    if (longMi <= 0) return
    const share = longMi / total
    if (share > 0.7) {
      add({
        id: 'qa_combined_long_share', severity: 'error', weekNum: w.num,
        title: 'Long days swallow the week',
        detail: `Week ${w.num} puts ~${Math.round(longMi * 10) / 10} of its ${total} mi (${Math.round(share * 100)}%) into long-category days — combined long volume belongs under ~65% so easy-day frequency survives.`,
      })
    } else if (share > 0.6) {
      add({
        id: 'qa_combined_long_share', severity: 'warn', weekNum: w.num,
        title: 'Long days dominate the week',
        detail: `Week ${w.num}'s long-category days carry ${Math.round(share * 100)}% of its miles — near the ~65% ceiling.`,
      })
    }
  })

  // ── persona dosing contract (Phase 2, PRD-104 / Mandate #2) ───────
  {
    const RM = /\bRM\b|1RM|\dRM/
    const expRankOf: Record<string, number> = { beginner: 0, recreational: 1, intermediate: 2, advanced: 3, elite: 4 }
    const personaRank = input.effectiveExperience != null ? expRankOf[input.effectiveExperience] : null
    weeks.forEach(w => {
      for (const d of w.days) {
        // 104-F3 — RM language is banned platform-wide.
        if (RM.test(`${d.workout} ${d.detail}`)) {
          add({
            id: 'qa_strength_scheme', severity: 'error', weekNum: w.num, day: d.day,
            title: 'RM language on a card',
            detail: `"${d.workout}" prescribes load in RM terms — effort cues are reps-in-reserve, never max testing.`,
          })
        }
        // 104-F3 — seniors (70+) never receive heavy or plyometric strength.
        if (input.age != null && input.age >= 70 && d.type === 'strength' &&
            /heavy strength \(4–6|explosive power|Box Jump|Jump Squat/i.test(d.detail ?? '')) {
          add({
            id: 'qa_strength_scheme', severity: 'error', weekNum: w.num, day: d.day,
            title: 'Heavy/plyometric strength at 70+',
            detail: `"${d.workout}" carries maximal or jump loading — the masters scheme replaces both (NSCA older-adult guidance).`,
          })
        }
        // 104-F1 — experience gating: a card may never outrank its athlete.
        const methodIdForWeek = w.methodId ?? input.methodId
        if (personaRank != null && methodIdForWeek && d.plannedWorkout?.workoutId) {
          const gate = workoutGateFor(methodIdForWeek, d.plannedWorkout.workoutId)
          if (gate?.minimumExperience != null && (expRankOf[gate.minimumExperience] ?? 0) > personaRank) {
            add({
              id: 'qa_dose_gates', severity: 'error', weekNum: w.num, day: d.day,
              title: 'Session outranks the athlete',
              detail: `"${d.workout}" requires ${gate.minimumExperience} experience but this plan routes as ${input.effectiveExperience}.`,
            })
          }
          if (gate?.requiresBaseMileage != null && w.targetMi != null && w.targetMi > 0 &&
              gate.requiresBaseMileage > w.targetMi * 1.5) {
            add({
              id: 'qa_dose_gates', severity: 'error', weekNum: w.num, day: d.day,
              title: 'Session assumes a base the week lacks',
              detail: `"${d.workout}" is authored for ${gate.requiresBaseMileage}+ mi/week; week ${w.num} targets ${w.targetMi} mi.`,
            })
          }
        }
      }
      // 104-F5 — persona quality caps: first-timers hold 1/week for the
      // first 6 weeks, then 2; beginners hold 2. (Senior cap is separate.)
      if (personaRank === 0) {
        const q = w.days.filter(d => d.type === 'quality' && !/\bBENCHMARK\b/i.test(d.workout)).length
        const cap = 2
        if (q > cap) {
          add({
            id: 'qa_dose_gates', severity: 'error', weekNum: w.num,
            title: 'Too many quality sessions for this athlete',
            detail: `Week ${w.num} schedules ${q} quality sessions — beginner routing holds at most ${cap}.`,
          })
        }
      }
    })
  }

  // ── effort completeness (Phase 2, 104-F4) ─────────────────────────
  // Every run-class card exposes an effort target the athlete can follow
  // (zone/pace/HR/RPE) and a session time. Hyrox scoped out (own engine).
  if (!(race?.format === 'hyrox' || /hyrox/i.test(`${race?.name ?? ''} ${race?.distance ?? ''}`))) {
    weeks.forEach(w => {
      for (const d of w.days) {
        if (!['run', 'quality', 'long'].includes(d.type)) continue
        if (/\bBENCHMARK\b/i.test(d.workout)) continue
        if (!d.zone || d.zone === '—') {
          add({
            id: 'qa_effort_cues', severity: 'error', weekNum: w.num, day: d.day,
            title: 'Run card without an effort target',
            detail: `${d.day} "${d.workout}" gives the athlete no zone, pace, or RPE to run by.`,
          })
        }
        if (!d.time || d.time === '—') {
          add({
            id: 'qa_effort_cues', severity: 'error', weekNum: w.num, day: d.day,
            title: 'Run card without a session time',
            detail: `${d.day} "${d.workout}" has no duration — the athlete can't plan the session.`,
          })
        }
      }
    })
  }

  // ── target adherence (R0) ─────────────────────────────────────────
  // The progression model's weekly target (week.targetMi) and the summed
  // day content must agree — this is the regression guard for the audit's
  // root cause A1 (quality volume landing on top of the budget instead of
  // inside it). Race weeks are hand-authored and exempt.
  weeks.forEach(w => {
    if (w.targetMi == null || w.targetMi <= 3) return
    if (w.days.some(d => d.type === 'race')) return
    // A scheduled field-test week deliberately swaps a day for the fixed
    // 20-min benchmark protocol — a sanctioned, one-week exception.
    if (w.days.some(d => /\bBENCHMARK\b/i.test(d.workout))) return
    const mi = Number(w.miles)
    if (!Number.isFinite(mi) || mi <= 0) return
    const dev = Math.abs(mi - w.targetMi) / w.targetMi
    if (dev > 0.25 && Math.abs(mi - w.targetMi) > 3) {
      add({
        id: 'qa_target_adherence', severity: 'error', weekNum: w.num,
        title: 'Week ignores its volume target',
        detail: `Week ${w.num} prescribes ${mi} mi against a ${w.targetMi} mi progression target (${Math.round(dev * 100)}% off) — the ramp model and the day content disagree.`,
      })
    } else if (dev > 0.12 && Math.abs(mi - w.targetMi) > 2) {
      // Phase 1 (105-F3) — drift is visible before it's egregious.
      add({
        id: 'qa_target_adherence', severity: 'warn', weekNum: w.num,
        title: 'Week drifting from its volume target',
        detail: `Week ${w.num} prescribes ${mi} mi against a ${w.targetMi} mi target (${Math.round(dev * 100)}% off) — inside tolerance, worth watching.`,
      })
    }
  })

  // ── method invariants (R2) ────────────────────────────────────────
  // Each method ships authored invariants its plans must honor; the
  // machine-checkable subset lives in the methodInvariants registry.
  // Generation targets the authored number, so the gate warns just past
  // it and errors only on egregious violation.
  if (input.methodId || weeks.some(w => w.methodId)) {
    const isBenchmark = (d: PlannedDay) => /\bBENCHMARK\b/i.test(d.workout ?? '')

    weeks.forEach(w => {
      // Phase 1 (105-F1) — season-spliced weeks carry the method that
      // generated THEIR block; it wins over the plan-level methodId.
      const weekMethodId = w.methodId ?? input.methodId
      if (!weekMethodId) return
      const rules = invariantRulesFor(weekMethodId)
      if (w.days.some(d => d.type === 'race')) return
      const total = Number(w.miles)
      if (!Number.isFinite(total) || total < 8) return

      // Share-based checks only carry meaning at real volume: published
      // low-mileage plans (Higdon novice's 3-5-9 week: a 47% long run)
      // violate share caps wholesale, because a long run that's LONG
      // ENOUGH TO MATTER is intrinsically a big slice of a small week.
      // Absolute ceilings (Hansons 16 mi) apply at every volume.
      const shareChecksApply = total >= 25

      // Long-run share (+ absolute ceiling where declared, e.g. Hansons 16 mi).
      const longMi = Math.max(0, ...w.days.filter(d => d.type === 'long').map(d => estimateDayMiles(d)))
      if (longMi > 0) {
        const share = longMi / total
        if (rules.longRunMaxMi != null && longMi > rules.longRunMaxMi * 1.05) {
          add({
            id: 'qa_method_long_run', severity: 'error', weekNum: w.num,
            title: 'Long run breaks the method ceiling',
            detail: `Week ${w.num}'s long run is ~${Math.round(longMi * 10) / 10} mi — this method caps it at ${rules.longRunMaxMi} mi outright.`,
          })
        } else if (shareChecksApply && share > rules.longRunMaxPctOfWeek * 1.25) {
          add({
            id: 'qa_method_long_run', severity: 'error', weekNum: w.num,
            title: 'Long run out of proportion',
            detail: `Week ${w.num}'s long run is ${Math.round(share * 100)}% of the week's ${total} mi — the method caps it at ${Math.round(rules.longRunMaxPctOfWeek * 100)}%.`,
          })
        } else if (shareChecksApply && share > rules.longRunMaxPctOfWeek * 1.1) {
          add({
            id: 'qa_method_long_run', severity: 'warn', weekNum: w.num,
            title: 'Long run above the method share',
            detail: `Week ${w.num}'s long run is ${Math.round(share * 100)}% of the week — the method's authored cap is ${Math.round(rules.longRunMaxPctOfWeek * 100)}%.`,
          })
        }
      }

      // Quality share of weekly volume.
      const qualityMi = w.days
        .filter(d => d.type === 'quality' && !isBenchmark(d))
        .reduce((sum, d) => sum + estimateDayMiles(d), 0)
      if (qualityMi > 0 && shareChecksApply) {
        const share = qualityMi / total
        if (share > rules.qualityMaxPctOfWeek + 0.15) {
          add({
            id: 'qa_method_quality_share', severity: 'error', weekNum: w.num,
            title: 'Quality volume out of proportion',
            detail: `Week ${w.num} carries ~${Math.round(qualityMi * 10) / 10} mi of quality in a ${total} mi week (${Math.round(share * 100)}%) — the method holds quality near ${Math.round(rules.qualityMaxPctOfWeek * 100)}%.`,
          })
        } else if (share > rules.qualityMaxPctOfWeek + 0.05) {
          add({
            id: 'qa_method_quality_share', severity: 'warn', weekNum: w.num,
            title: 'Quality share above the method target',
            detail: `Week ${w.num}'s quality volume is ${Math.round(share * 100)}% of the week — the method targets ≤${Math.round(rules.qualityMaxPctOfWeek * 100)}%.`,
          })
        }
      }
    })

    // Hard-day spacing: quality sessions need the method's authored gap.
    // Plan-level (single-method) only — a spliced season's blocks each
    // pass through here when generated, and qa_consecutive_hard covers
    // the seams for every method.
    const planRules = input.methodId ? invariantRulesFor(input.methodId) : null
    if (planRules && planRules.minDaysBetweenQuality >= 1) {
      const flatDays: { day: PlannedDay; weekNum: number; idx: number }[] = []
      let idx = 0
      for (const w of weeks) {
        for (const d of w.days) flatDays.push({ day: d, weekNum: w.num, idx: idx++ })
      }
      const qualityIdx = flatDays.filter(f => f.day.type === 'quality' && !isBenchmark(f.day))
      for (let i = 1; i < qualityIdx.length; i++) {
        const gapDays = qualityIdx[i].idx - qualityIdx[i - 1].idx - 1
        if (gapDays === 0) {
          add({
            id: 'qa_hard_day_spacing', severity: 'error', weekNum: qualityIdx[i].weekNum, day: qualityIdx[i].day.day,
            title: 'Back-to-back quality sessions',
            detail: `"${qualityIdx[i - 1].day.workout}" and "${qualityIdx[i].day.workout}" run on consecutive days — this method wants ${planRules.minDaysBetweenQuality}+ easy day(s) between hard sessions.`,
          })
        } else if (gapDays < planRules.minDaysBetweenQuality) {
          add({
            id: 'qa_hard_day_spacing', severity: 'warn', weekNum: qualityIdx[i].weekNum, day: qualityIdx[i].day.day,
            title: 'Hard sessions closer than the method wants',
            detail: `"${qualityIdx[i].day.workout}" comes ${gapDays + 1} day(s) after the previous quality session — the method's authored gap is ${planRules.minDaysBetweenQuality} days.`,
          })
        }
      }
    }
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
