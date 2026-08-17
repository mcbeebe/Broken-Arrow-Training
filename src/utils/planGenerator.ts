import type { TrainingPlan, TrainingWeek, PlannedDay, HRZone, PlanAdvisory } from '../types'
import type { OnboardingConfig, ExperienceLevel, CrossTrainingMode } from '../hooks/useOnboarding'
import type { PlannedWorkout, PlannedSegment } from '../engines/planGenerator/types'
import type { WorkoutCategory, CanonicalPaceZone } from '../types/training-method'
import { buildCrossDetail } from '../engines/planGenerator/extraDays'
import { menopauseStrengthCue } from './menopause'
import { effectivePlanStart } from './planDates'
import { INJURY_LEADIN_WEEKS } from './injuryRamp'
import { computeMaxHR } from './heartRate'
import { athleteCurrentVdot } from '../engines/planGenerator/paceTargets'
import { paceBoundsForZone, type VdotPaceBounds } from '../engines/planGenerator/vdot'
import { stationSpecs, stationCircuit, stationRx, FULL_SPEC_PHRASE, HYROX_RUN_LEGS, HYROX_RUN_LEG_KM, type StationSpec } from '../engines/hyrox/spec'
import { validatePlan, qaFindingsToAdvisories } from '../engines/planQA/validatePlan'
import { prehabBlockFor } from '../engines/planGenerator/prehab'
import { STATION_RAMP, FULL_SIM_DAYS_OUT, HALF_SIM_DAYS_OUT, SPEC_DAY_DAYS_OUT, COMPROMISED_DOSE, INTERVAL_REST, TEMPO_MINUTES } from '../engines/hyrox/heuristics'

const HYROX_RUN_LABEL = `${HYROX_RUN_LEGS}×${HYROX_RUN_LEG_KM}km runs`

/** Format a VDOT-derived pace range as " · M:SS–M:SS/mi" (empty when no anchor).
 *  Mirrors the General-Fitness engine so paced Hyrox runs read identically. */
function formatPaceRange(b: VdotPaceBounds | null): string {
  if (!b) return ''
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  return ` · ${fmt(b.paceSecPerMileHigh)}–${fmt(b.paceSecPerMileLow)}/mi`
}

// Home substitutions surfaced when the athlete didn't list gym access. Hyrox is
// equipment-dependent, so rather than prescribe kit they don't have, we keep the
// structure and tell them what to do instead.
const NO_GYM_STRENGTH_SUB =
  'No gym? Sub barbell/DB work with backpack-loaded squats, lunges, rows & single-leg variations.'
const NO_GYM_STATION_SUB =
  'No gym? Approximate stations: wall balls → med-ball/backpack squat-to-press; sled → hill sprints or resisted-band runs; ski/row → hard jump rope or burpees; farmer carry → heavy jugs/backpack.'

// P3 — every station prescription renders from the official race spec
// (engines/hyrox/spec.ts) at a week-progressive fraction of race volume.
// The v1 defect: a hardcoded half-distance list meant no station was ever
// trained at race distance, not even in "full race distance" copy.

/** The first `n` stations (race order) at `pct` of race volume. */
function buildStationList(specs: StationSpec[], n: number, pct: number): string {
  return specs.slice(0, Math.max(1, Math.min(n, specs.length))).map(s => stationRx(s, pct)).join(' · ')
}

/** Station-volume fraction for a week: ramps across the pre-taper build
 *  per the tiered STATION_RAMP heuristic (deloads drop to a fraction of
 *  the ramp). The final pre-race full-spec touch comes from the
 *  key-session overlay, not the ramp — so a clamped runway still reaches
 *  spec. */
function stationPctForWeek(progress: number, isRecovery: boolean): number {
  const r = STATION_RAMP.value
  const pct = r.startPct + (r.endPct - r.startPct) * Math.min(1, Math.max(0, progress))
  return isRecovery ? Math.max(r.recoveryFloorPct, pct * r.recoveryMult) : pct
}

/** Compromised-running station rotation: three stations per session,
 *  rotating through race order week by week so every station appears
 *  under run fatigue at least once across a build. */
function compromisedTriple(specs: StationSpec[], weekIndex: number): StationSpec[] {
  return [0, 1, 2].map(i => specs[(weekIndex * 3 + i) % specs.length])
}

/** The home-substitution note for a given workout role (empty for pure runs). */
function equipmentSubFor(role: string): string {
  if (role === 'strength') return NO_GYM_STRENGTH_SUB
  if (role === 'strength_stations') return `${NO_GYM_STRENGTH_SUB} ${NO_GYM_STATION_SUB}`
  if (role === 'stations') return NO_GYM_STATION_SUB
  return ''
}

function computeZones(maxHR: number): HRZone[] {
  return [
    { zone: 'Z1 – Recovery', hr: `${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)}`, pct: '55–65%', desc: 'Very easy, full conversation' },
    { zone: 'Z2 – Aerobic', hr: `${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)}`, pct: '65–75%', desc: 'Comfortable, sustainable' },
    { zone: 'Z3 – Tempo', hr: `${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)}`, pct: '75–85%', desc: 'Comfortably hard' },
    { zone: 'Z4 – Threshold', hr: `${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)}`, pct: '85–90%', desc: 'Hard. A few words at most' },
  ]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

/** Whole days from `aIso` to `bIso` (negative if b is before a). */
function daysBetween(aIso: string, bIso: string): number {
  return Math.round(
    (Date.parse(`${bIso}T12:00:00`) - Date.parse(`${aIso}T12:00:00`)) / 86_400_000,
  )
}

/** The Monday on or before a date. Weeks are Monday-anchored (matching the
 *  running engine) — anchoring to race day itself made every Hyrox week run
 *  on the race's weekday (the field bug's Fri→Thu weeks). */
function mondayOnOrBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const sinceMonday = (d.getDay() + 6) % 7 // 0=Mon … 6=Sun
  return addDays(dateStr, -sinceMonday)
}

/** Recovery-week placement for a runway-clamped plan. The level templates'
 *  fixed indices (e.g. [4, 8]) assume the FULL build; in a clamped plan they
 *  landed a "volume drops 40%" week right before the taper (the field
 *  periodization inversion). Derived rule: no recovery weeks at all in a
 *  short (≤6-week) plan, otherwise every 4th week but never within the
 *  final 2 pre-race weeks. */
function deriveRecoveryWeeks(totalWeeks: number): number[] {
  if (totalWeeks <= 6) return []
  const out: number[] = []
  for (let w = 4; w <= totalWeeks - 2; w += 4) out.push(w)
  return out
}

interface LevelParams {
  totalWeeks: number
  baseRunMi: number
  buildRunMi: number
  peakRunMi: number
  longRunMi: number
  peakLongMi: number
  repeats: { base: number; build: number; peak: number }
  wallBallReps: { base: number; build: number; peak: number }
  wallBallWeight: string
  sledNote: string
  simStations: { build: number; peak: number }
  strengthDetail: { base: string; build: string }
  recoveryWeeks: number[]
}

function getLevelParams(level: ExperienceLevel): LevelParams {
  switch (level) {
    case 'first_timer': return {
      totalWeeks: 20,
      baseRunMi: 1.5, buildRunMi: 2.0, peakRunMi: 2.5,
      longRunMi: 2.5, peakLongMi: 4.0,
      repeats: { base: 0, build: 0, peak: 3 },
      wallBallReps: { base: 15, build: 30, peak: 50 },
      wallBallWeight: '4 kg',
      sledNote: 'Empty or very light sled — learn the movement first',
      simStations: { build: 2, peak: 4 },
      strengthDetail: {
        base: 'BW squats 2×10 · Wall sit 2×20s · Push-ups (knees) 2×8 · Plank 2×20s · Glute bridges 2×12 · Dead bugs 2×8/side',
        build: 'BW squats 3×12 · BW lunges 2×8/leg · Wall balls 2×10 (4 kg) · Push-ups 2×10 · Farmer carry 2×20m light · Plank 3×30s',
      },
      recoveryWeeks: [4, 8, 12, 16],
    }
    case 'beginner': return {
      totalWeeks: 16,
      baseRunMi: 2.0, buildRunMi: 2.5, peakRunMi: 3.0,
      longRunMi: 3.5, peakLongMi: 5.0,
      repeats: { base: 0, build: 3, peak: 4 },
      wallBallReps: { base: 30, build: 50, peak: 75 },
      wallBallWeight: '6 kg',
      sledNote: 'Light sled — focus on form',
      simStations: { build: 3, peak: 4 },
      strengthDetail: {
        base: 'BW squats 3×15 · BW lunges 3×10/leg · Push-ups (knees ok) 3×10 · Plank 3×30s · Glute bridges 3×15',
        build: 'Goblet squats 3×12 · DB lunges 3×10/leg · Wall balls 3×15 (6 kg) · Push-ups 3×12 · Farmer carry 2×30m light · Plank 3×45s',
      },
      recoveryWeeks: [4, 8, 12],
    }
    case 'intermediate': return {
      totalWeeks: 12,
      baseRunMi: 3.0, buildRunMi: 3.5, peakRunMi: 4.0,
      longRunMi: 5.0, peakLongMi: 6.0,
      repeats: { base: 0, build: 4, peak: 6 },
      wallBallReps: { base: 50, build: 75, peak: 100 },
      wallBallWeight: '6 kg',
      sledNote: 'Competition sled weight',
      simStations: { build: 4, peak: 8 },
      strengthDetail: {
        base: 'Goblet squats 3×15 · DB lunges 3×12/leg · Push-ups 3×15 · Bent-over rows 3×12 · Plank 3×45s · Dead bugs 3×10/side',
        build: 'Wall balls 3×20 (6 kg) · Sled push 3×25m · Farmer carry 3×50m · Sandbag lunges 3×10/leg · Burpee broad jump 3×8 · Plank 3×60s',
      },
      recoveryWeeks: [4, 8],
    }
    case 'advanced': return {
      totalWeeks: 10,
      baseRunMi: 4.0, buildRunMi: 4.5, peakRunMi: 5.0,
      longRunMi: 6.0, peakLongMi: 7.0,
      repeats: { base: 3, build: 6, peak: 8 },
      wallBallReps: { base: 75, build: 100, peak: 100 },
      wallBallWeight: '9 kg',
      sledNote: 'Competition weight — practice fast transitions',
      simStations: { build: 6, peak: 8 },
      strengthDetail: {
        base: 'BB back squat 3×10 · DB lunges 3×12/leg · Pull-ups 3×8 · DB rows 3×10 · Wall balls 3×15 (9 kg) · Plank 3×60s',
        build: 'Wall balls 4×25 (9 kg) · Sled push 4×50m race pace · Sled pull 3×50m · Farmer carry 3×100m heavy · Sandbag lunges 3×12/leg · Burpee broad jump 4×10',
      },
      recoveryWeeks: [4, 7],
    }
    case 'elite': return {
      totalWeeks: 8,
      baseRunMi: 5.0, buildRunMi: 5.5, peakRunMi: 6.0,
      longRunMi: 7.0, peakLongMi: 8.0,
      repeats: { base: 4, build: 8, peak: 8 },
      wallBallReps: { base: 100, build: 100, peak: 100 },
      wallBallWeight: '9 kg',
      sledNote: 'Competition + heavy. Above-race effort on station days.',
      simStations: { build: 8, peak: 8 },
      strengthDetail: {
        base: 'BB squat 4×8 · BB deadlift 3×8 · Weighted pull-ups 3×6 · Wall balls 4×25 (9 kg) · Sled push 3×50m heavy · Plank 3×60s',
        build: 'Full Hyrox station circuit: all 8 at competition weight/reps · Rest 90s between · Time each station · Farmer carry 4×100m heavy',
      },
      recoveryWeeks: [3, 6],
    }
  }
}

export function generateHyroxPlan(
  config: OnboardingConfig,
  today: string = new Date().toISOString().slice(0, 10),
): TrainingPlan {
  // Athlete-chosen plan start (one-way clamp: never back-dates).
  today = effectivePlanStart(config.planStartDate, today)
  const maxHR = computeMaxHR(config)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z3 = `Z3 (${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)})`
  const z4 = `Z4 (${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)})`

  const raceDate = config.raceDate || addDays(new Date().toISOString().slice(0, 10), 84)
  const P = getLevelParams(config.experienceLevel)
  // Weeks are Monday-anchored; the final week is the Monday-anchored week
  // that CONTAINS race day and ends on it (a race-day card is emitted, and
  // nothing is scheduled after the race).
  const raceMonday = mondayOnOrBefore(raceDate)
  // Runway clamp (P0): the level template is a MAXIMUM, never a mandate.
  // Back-counting a fixed 8–20-week template from race day used to start
  // plans in the past — and, in a multi-race season, ON TOP of the
  // previous race's build (the week-numbering corruption bug). The plan
  // can never begin before `today` (a race-week edge where today falls
  // mid-race-week is clamped per-day in the loop below).
  const weeksAvailable = raceMonday >= today
    ? Math.floor(daysBetween(today, raceMonday) / 7) + 1
    : 1
  const coreWeeks = Math.min(P.totalWeeks, Math.max(1, weeksAvailable))
  // Long runway: the template is a maximum for the CORE build, but the plan
  // must still START at the athlete's chosen start (`today` is already
  // effectivePlanStart-clamped). Extra runway becomes extended base weeks
  // in front — the field bug was an Aug 3 start producing a plan that
  // began 9/14 because the 12-week template back-counted from race day.
  const baseExtension = Math.min(Math.max(0, weeksAvailable - P.totalWeeks), 8)
  const totalWeeks = coreWeeks + baseExtension
  const runwayClamped = coreWeeks < P.totalWeeks
  const daysPerWeek = config.trainingDaysPerWeek
  const weakStation = config.weakStation || 'Wall Balls'
  // P3 — the division/sex spec every station prescription renders from.
  const division = config.hyroxDivision ?? 'open'
  const specs = stationSpecs(division, config.sex === 'female' ? 'female' : 'male')

  // P1-6 — bring the running engine's tailoring to Hyrox: a midlife bone-loading
  // finisher on strength days (menopause-aware), and an injury lead-in that eases
  // the hard days for the first N weeks.
  const hasGym = !!config.equipmentAccess?.includes('gym')
  const boneCue = menopauseStrengthCue(config)
  const boneFinisher = boneCue ? (hasGym ? boneCue.gymFinisher : boneCue.bodyweightFinisher) : []
  const injuryLeadIn = INJURY_LEADIN_WEEKS[config.injuryStatus ?? 'none'] ?? 0
  // P4.3 — injury-area prehab (previously collected, never acted on).
  const prehabBlock = prehabBlockFor(
    config.injuryStatus && config.injuryStatus !== 'none' ? config.injuryArea : undefined,
  )

  // Anchor run paces to a tested effort when one exists (mirrors General Fitness):
  // a Hyrox athlete with a recent race time gets concrete paces on run days, not
  // just heart-rate zones. Falls back to HR-only when there's no anchor.
  const anchorVdot = athleteCurrentVdot(config)
  const easyPace = anchorVdot ? formatPaceRange(paceBoundsForZone(anchorVdot, 'easy')) : ''
  const tempoPace = anchorVdot ? formatPaceRange(paceBoundsForZone(anchorVdot, 'lactate_threshold')) : ''
  const cvPace = anchorVdot ? formatPaceRange(paceBoundsForZone(anchorVdot, 'critical_velocity')) : ''

  // Phase boundaries scale with the CORE template so build/peak/taper stay
  // byte-stable relative to race day; extension weeks all land in base.
  const baseEnd = baseExtension + Math.round(coreWeeks * 0.3)
  const buildEnd = baseExtension + Math.round(coreWeeks * 0.7)
  const peakEnd = totalWeeks - 1

  // Workout roles assigned to training days (not day-of-week).
  // 3 days: run, strength/stations, long
  // 4 days: run, strength, stations, long
  // 5 days: run, strength, run+conditioning, stations, long
  // 6 days: run, strength, run+conditioning, stations, easy, long
  // 7 days: as 6 plus a second easy/cross day
  const rolesByDays: Record<number, string[]> = {
    3: ['run', 'strength_stations', 'long'],
    4: ['run', 'strength', 'stations', 'long'],
    5: ['run', 'strength', 'run_conditioning', 'stations', 'long'],
    6: ['run', 'strength', 'run_conditioning', 'stations', 'easy', 'long'],
    7: ['run', 'strength', 'run_conditioning', 'easy', 'stations', 'easy', 'long'],
  }
  const roles = rolesByDays[daysPerWeek] || rolesByDays[4]
  const trainingDayNumbers = getTrainingDayNumbers(daysPerWeek)

  // Recovery placement must follow the ACTUAL length, not the template —
  // fixed indices put a recovery week right before the race when clamped,
  // and absurdly early when the base is extended.
  const recoveryWeeks = runwayClamped || baseExtension > 0
    ? deriveRecoveryWeeks(totalWeeks)
    : P.recoveryWeeks

  const weeks: TrainingWeek[] = []
  // P3.3 — one of each key session per plan, placed by race proximity.
  let placedFullSim = false
  let placedHalfSim = false
  let placedSpecDay = false

  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = addDays(raceMonday, -(totalWeeks - 1 - w) * 7)
    const isFinalWeek = w === totalWeeks - 1
    // Offset of race day within its Monday-anchored week (0=Mon … 6=Sun).
    const raceOffset = daysBetween(raceMonday, raceDate)
    const phase = weekNum <= baseEnd ? 'base' : weekNum <= buildEnd ? 'build' : weekNum <= peakEnd ? 'peak' : 'taper'
    const isRecovery = recoveryWeeks.includes(weekNum)
    // P3 — continuous progression: 0 at week 1 → 1 at the final pre-race
    // week. Volumes, reps and station fractions key on THIS, not the
    // coarse phase — so no two non-recovery weeks are identical and a
    // clamped runway compresses the ramp instead of cloning weeks.
    const progress = totalWeeks > 1 ? w / (totalWeeks - 1) : 1

    const days: PlannedDay[] = []
    let roleIdx = 0

    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      // P0 invariant: the plan never schedules a day before `today` (only
      // reachable when today falls inside race week itself).
      if (w === 0 && dateStr < today) continue
      const dayLabel = formatDay(dateStr)
      const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()

      if (isFinalWeek) {
        // Race week: light shakeout days through race eve, the race itself
        // on race day, and NOTHING after — post-race belongs to recovery.
        if (d > raceOffset) break
        if (d === raceOffset) {
          days.push({
            day: dayLabel,
            type: 'race',
            workout: `RACE DAY — ${config.raceName || 'Hyrox'}`,
            detail: 'Start controlled through runs 1–4, then empty the tank. Nothing new today — race-week rehearsed gear, fueling, and pacing only.',
            zone: `${z3}–${z4}`,
            route: 'Race venue',
            time: '~90 min',
          })
          continue
        }
        if (!trainingDayNumbers.includes(dayOfWeek)) {
          days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: 'Race week — feet up.', zone: '—', route: '—', time: '—' })
          continue
        }
        // Reuse the recovery-role bodies: easy runs / light station form
        // work — exactly the right race-week dose.
        const role = roles[roleIdx] || 'run'
        roleIdx++
        const shakeout = getHyroxWorkoutByRole(role, 'taper', true, P, weakStation, z1, z2, z3, z4, easyPace, tempoPace, cvPace, w, config.crossTrainingModes)
        days.push({ day: dayLabel, ...shakeout })
        continue
      }

      if (!trainingDayNumbers.includes(dayOfWeek)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }

      const role = roles[roleIdx] || 'run'
      roleIdx++
      // P3.3 — key sessions are placed by DATE ARITHMETIC counting back
      // from race day, never by phase membership (v1's peak phase was
      // unreachable on clamped runways, so the simulation never fired):
      //   full race simulation  → the long day 10–17 days out
      //   half simulation       → the long day 18–27 days out
      //   all stations at spec  → the stations day 24–42 days out
      const daysToRace = daysBetween(dateStr, raceDate)
      let base = getHyroxWorkoutByRole(role, phase, isRecovery, P, weakStation, z1, z2, z3, z4, easyPace, tempoPace, cvPace, w, config.crossTrainingModes, specs, progress)
      if (role === 'long' && daysToRace >= FULL_SIM_DAYS_OUT.value.min && daysToRace <= FULL_SIM_DAYS_OUT.value.max && !placedFullSim) {
        placedFullSim = true
        base = {
          type: 'long',
          workout: '★ FULL RACE SIMULATION',
          detail: `The complete race ${FULL_SPEC_PHRASE}: ${HYROX_RUN_LABEL}, alternating with all 8 stations in race order — ${stationCircuit(specs, 1)}. No rest between run and station. Record every split and every transition; decide your wall-ball sets here, not on race day. Treat it as a race and recover from it like one.`,
          zone: `${z3}–${z4}`,
          route: 'Gym',
          time: '~110 min',
        }
      } else if (role === 'long' && daysToRace >= HALF_SIM_DAYS_OUT.value.min && daysToRace <= HALF_SIM_DAYS_OUT.value.max && !placedHalfSim) {
        placedHalfSim = true
        base = {
          type: 'long',
          workout: 'HALF SIMULATION: 4 runs + 4 stations',
          detail: `Race order, race weights, no rest between run and station: 4×(1km run + station) — ${buildStationList(specs, 4, 1)}. Time it: this is your first taste of the real thing, and your erg/sled pacing baseline.`,
          zone: `${z3}–${z4}`,
          route: 'Gym',
          time: '~60 min',
        }
      } else if (role === 'stations' && daysToRace >= SPEC_DAY_DAYS_OUT.value.min && daysToRace <= SPEC_DAY_DAYS_OUT.value.max && !placedSpecDay) {
        placedSpecDay = true
        base = {
          type: 'cross',
          workout: `Full-distance stations (${division === 'pro' ? 'Pro' : 'Open'})`,
          detail: `Every station ${FULL_SPEC_PHRASE}, generous rest, technique first: ${stationCircuit(specs, 1)}. Rest 3 min between stations and log every split — these are the numbers your race plan is built from.`,
          zone: z3,
          route: 'Gym',
          time: '~75 min',
        }
      }
      let day: PlannedDay = { day: dayLabel, ...base }
      // Menopause: append a bone-loading finisher to real strength days (skip
      // recovery/taper — maintenance only).
      if (boneFinisher.length > 0 && !isRecovery && phase !== 'taper' && base.type === 'strength') {
        day = { ...day, workout: `${base.workout} + bone`, detail: `${base.detail} · ${boneFinisher.join(' · ')}` }
      }
      // Injury lead-in: ease the hard days (quality/strength) for the first N weeks.
      if (injuryLeadIn > 0 && weekNum <= injuryLeadIn && !isRecovery && (base.type === 'quality' || base.type === 'strength')) {
        day = { ...day, workout: `${day.workout} — easing back`, detail: `Returning from injury: keep effort easy and form-focused. ${day.detail}`, zone: z1, leadInEased: true }
      }
      // Equipment: no gym → strength/station prescriptions assume kit they don't
      // have. Keep the structure, append the home substitutions.
      if (!hasGym) {
        const sub = equipmentSubFor(role)
        if (sub) day = { ...day, detail: `${day.detail} · ${sub}` }
      }
      // P4.3 — injury-area prehab lands on strength/cross days here too.
      if (prehabBlock && (day.type === 'strength' || day.type === 'cross')) {
        day = { ...day, detail: `${day.detail} · ${prehabBlock}` }
      }
      days.push(day)
    }

    const baseMiles = isRecovery ? Math.round(P.baseRunMi * 4) : phase === 'base' ? Math.round(P.baseRunMi * daysPerWeek) : phase === 'build' ? Math.round(P.buildRunMi * daysPerWeek) : Math.round(P.peakRunMi * daysPerWeek)
    const weekEnd = isFinalWeek ? raceDate : addDays(weekStart, 6)

    weeks.push({
      num: weekNum,
      startIso: weekStart,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(weekEnd).slice(4)}`,
      // Numeric like every other generator — the UI owns the "~" prefix
      // (a baked-in "~" string double-rendered as "~~7 mi" in the field).
      miles: isRecovery ? Math.round(baseMiles * 0.6) : baseMiles,
      focus: (isFinalWeek ? `Race week. Stay sharp, stay rested — ${config.raceName || 'Hyrox'} on ${formatDay(raceDate)}.`
        : isRecovery ? 'RECOVERY WEEK. Volume drops 40%. Absorb adaptations.'
        : phase === 'base' ? `Build aerobic base + station familiarity. ${config.experienceLevel === 'beginner' ? 'Focus on form over speed.' : ''}`
        : phase === 'build' ? `Race-specific station work + running intervals. ${P.sledNote}`
        : phase === 'peak' ? `Full simulations + intensity. ${P.simStations.peak} stations at race effort.`
        : 'Taper. Reduce volume, maintain sharpness. Trust your fitness.')
        + (injuryLeadIn > 0 && weekNum <= injuryLeadIn ? ' Easing back from injury — intensity is dialed down this week.' : ''),
      days,
    })
  }

  // Honest advisories — keep the Hyrox plan as candid about its limits as the
  // running plan. Today that's the equipment gap: Hyrox can't really be trained
  // without facility access, so flag it rather than prescribe kit they lack.
  const advisories: PlanAdvisory[] = []
  if (runwayClamped) {
    advisories.push({
      id: 'runway_short',
      severity: totalWeeks < Math.round(P.totalWeeks / 2) ? 'critical' : 'caution',
      title: 'Tight runway',
      detail: `Your level's full Hyrox build is ${P.totalWeeks} weeks; race day is ${totalWeeks} week${totalWeeks === 1 ? '' : 's'} away, so the plan is compressed into the time available.`,
      suggestion: 'The essentials survive the squeeze — station familiarity and race-pace running come first.',
    })
  }
  if (!placedFullSim && daysBetween(today, raceDate) >= 21) {
    // Long enough runway, yet the overlay found no long day in the 10-17
    // day window (e.g. an unusual training-day layout) — say so rather
    // than silently skipping the single most predictive session.
    advisories.push({
      id: 'hyrox_no_simulation',
      severity: 'caution',
      title: 'No full simulation scheduled',
      detail: 'The plan could not place a full 8-run + 8-station race simulation in the 10-17 days pre-race window. Slot one yourself about two weeks out — it is the best predictor of race day.',
    })
  }
  if (!hasGym) {
    advisories.push({
      id: 'hyrox_no_gym',
      severity: 'caution',
      title: 'Hyrox needs equipment',
      detail: 'Several Hyrox stations — SkiErg, sled, rower, wall balls, farmer carry — need a gym or competition setup, and you didn’t list gym access. Your plan keeps the structure and gives home substitutions where possible.',
      suggestion: 'Book gym or Hyrox-facility time before race day to rehearse the real stations and weights.',
    })
  }

  const plan: TrainingPlan = {
    athlete: {
      name: config.athleteName,
      maxHR,
      ftpWatts: config.ftpWatts,
      currentBase: `${config.experienceLevel} · ${config.trainingDaysPerWeek} days/wk`,
      weeklyStructure: `${daysPerWeek} sessions: running + functional + station-specific`,
    },
    zones,
    race: {
      name: config.raceName,
      date: raceDate,
      startTime: 'TBD',
      format: 'hyrox',
      distance: `8km running + 8 stations (${division === 'pro' ? 'Pro' : 'Open'})`,
      distanceMiles: 5,
      elevation: 'Flat (indoor)',
      elevationRange: 'N/A',
      course: '1km run → station → repeat x8',
      cutoff: '90 min (competitive), no cutoff (open)',
      landmarks: [
        { segment: 'Run 1-2', description: 'SkiErg + Sled Push. Start controlled — don\'t burn matches.' },
        { segment: 'Run 3-4', description: 'Sled Pull + Burpee Broad Jump. Grip + power endurance.' },
        { segment: 'Run 5-6', description: 'Rowing + Farmer Carry. Legs fatiguing. Stay smooth.' },
        { segment: 'Run 7-8', description: 'Sandbag Lunges + Wall Balls. Gut check. Empty the tank.' },
      ],
      gear: [
        { item: 'Indoor running shoes (lightweight, flat)', required: true },
        { item: 'Gloves (for sled + farmer carry grip)', required: false },
        { item: 'Water bottle', required: true },
        { item: 'Nutrition (gel/chews for race day)', required: true },
      ],
      nutrition: 'Light meal 2-3 hours before. Gel at station 4 transition. Water between stations.',
    },
    weeks,
    ...(advisories.length > 0 ? { advisories } : {}),
  }

  // P1/P3 — the same QA gate the method generator runs: a defective Hyrox
  // plan surfaces its findings as advisories instead of shipping silently.
  const qa = validatePlan({ weeks: plan.weeks, zones: plan.zones, race: plan.race })
  const qaAdvisories = qaFindingsToAdvisories(qa)
  if (qaAdvisories.length > 0) {
    plan.advisories = [...(plan.advisories ?? []), ...qaAdvisories]
  }
  return plan
}

function getTrainingDayNumbers(daysPerWeek: number): number[] {
  switch (daysPerWeek) {
    case 3: return [1, 3, 6]
    case 4: return [1, 2, 4, 6]
    case 5: return [1, 2, 3, 5, 6]
    case 6: return [1, 2, 3, 4, 5, 6]
    case 7: return [1, 2, 3, 4, 5, 6, 0] // getDay(): 0 = Sunday
    default: return [1, 3, 6]
  }
}

/** Structured warm-up/main/cool-down for the Hyrox interval days so the
 *  modal renders a rep-by-rep breakdown and the watch push gets a real
 *  repeat group (text-only details parse to nothing). purpose/cues stay
 *  empty on purpose — the Hyrox coaching narratives own those surfaces. */
function hyroxIntervalWorkout(args: {
  workoutId: string
  name: string
  category: WorkoutCategory
  primaryZone: CanonicalPaceZone
  main: PlannedSegment
  approxMinutes: { min: number; max: number }
}): PlannedWorkout {
  return {
    workoutId: args.workoutId,
    methodId: 'hyrox',
    name: args.name,
    category: args.category,
    primaryZone: args.primaryZone,
    segments: [
      { role: 'warmup', description: 'Easy jog building to workout effort, plus a few 20-sec pickups', duration: { value: 10, unit: 'min' }, paceZone: 'easy' },
      args.main,
      { role: 'cooldown', description: 'Very easy jog to walk', duration: { value: 10, unit: 'min' }, paceZone: 'recovery' },
    ],
    approxDurationMinutes: args.approxMinutes,
    purpose: '',
    cues: [],
  }
}

/** Linear interpolation rounded to `dp` decimals. */
function lerp(a: number, b: number, t: number, dp = 1): number {
  const v = a + (b - a) * Math.min(1, Math.max(0, t))
  const f = 10 ** dp
  return Math.round(v * f) / f
}

function getHyroxWorkoutByRole(
  role: string,
  phase: string,
  isRecovery: boolean,
  P: LevelParams,
  weakStation: string,
  z1: string, z2: string, z3: string, z4: string,
  easyPace: string = '', tempoPace: string = '', cvPace: string = '',
  weekIndex: number = 0,
  crossModes?: CrossTrainingMode[],
  specs: StationSpec[] = stationSpecs(),
  progress: number = 0,
): Omit<PlannedDay, 'day'> {

  if (isRecovery) {
    if (role === 'run' || role === 'run_conditioning' || role === 'easy') {
      return { type: 'run', workout: 'Easy run', detail: 'Recovery week. Very easy effort.', zone: `${P.baseRunMi} mi · ${z1}`, route: 'Flat route', time: `${Math.round(P.baseRunMi * 12)} min` }
    }
    if (role === 'strength' || role === 'strength_stations' || role === 'stations') {
      return { type: 'cross', workout: 'Light station practice', detail: `Pick 3 stations · 50% effort · Focus on form not speed · Wall balls ${P.wallBallWeight}`, zone: z1, route: 'Gym', time: '30 min' }
    }
    if (role === 'long') {
      return { type: 'run', workout: 'Easy long run', detail: 'Recovery week. Easy effort, shorter distance.', zone: `${P.baseRunMi + 0.5} mi · ${z1}`, route: 'Any route', time: `${Math.round((P.baseRunMi + 0.5) * 12)} min` }
    }
    return { type: 'rest', workout: 'Rest', detail: 'Recovery week', zone: '—', route: '—', time: '—' }
  }

  // P3 — continuous progression: run mileage, interval reps, and station
  // volumes interpolate across the plan on the week index, not the phase
  // bucket (v1: every same-phase week was byte-identical).
  const runMi = lerp(P.baseRunMi, P.peakRunMi, progress)
  const stationPct = stationPctForWeek(progress, false)

  // RUN: Primary running day
  if (role === 'run') {
    if (phase === 'base') {
      return { type: 'run', workout: 'Easy run', detail: 'Conversational pace. Build aerobic base.', zone: `${runMi} mi · ${z2}${easyPace}`, route: 'Flat route', time: `${Math.round(runMi * 12)} min` }
    }
    const reps = Math.max(
      phase === 'build' ? P.repeats.build : P.repeats.peak,
      Math.round(lerp(Math.max(2, P.repeats.build || 2), P.repeats.peak || P.repeats.build || 4, progress, 0)),
    )
    if (reps > 0) {
      const rest = INTERVAL_REST.value
      const restSec = progress > rest.lateAt ? rest.lateSec : rest.earlySec
      const approx = Math.round((runMi + 1) * 11)
      return {
        type: 'quality',
        workout: '1km repeats',
        detail: `${reps}×1km @ race pace, ${restSec} sec rest. Simulate Hyrox run legs.`,
        zone: `${runMi + 1} mi · ${z3}${cvPace}`,
        route: 'Track or flat',
        time: `${approx} min`,
        plannedWorkout: hyroxIntervalWorkout({
          workoutId: 'hyrox_1km_repeats',
          name: '1km repeats',
          category: 'race_pace',
          primaryZone: 'critical_velocity',
          main: {
            role: 'main',
            description: '1km at Hyrox race pace — even splits; the last rep should match the first',
            distance: { value: 1, unit: 'km' },
            paceZone: 'critical_velocity',
            reps,
            recovery: { type: 'jog', duration: { value: restSec, unit: 'sec' } },
            cue: 'The short rest is the point — each rep starts on legs that feel like running off a station.',
          },
          approxMinutes: { min: approx - 5, max: approx + 5 },
        }),
      }
    }
    return { type: 'run', workout: 'Easy run', detail: 'Build base before intervals.', zone: `${runMi} mi · ${z2}${easyPace}`, route: 'Flat route', time: `${Math.round(runMi * 12)} min` }
  }

  // STRENGTH: Functional strength day
  if (role === 'strength') {
    const detail = phase === 'base' ? P.strengthDetail.base : P.strengthDetail.build
    return { type: 'strength', workout: phase === 'base' ? 'STRENGTH: Foundation' : 'STRENGTH: Hyrox-specific', detail, zone: phase === 'base' ? z1 : z2, route: 'Gym', time: phase === 'base' ? '50 min' : '1 hr' }
  }

  // STRENGTH_STATIONS: Combined day (for 3 days/week)
  if (role === 'strength_stations') {
    if (phase === 'base') {
      return { type: 'strength', workout: 'STRENGTH + Station intro', detail: `${P.strengthDetail.base} · Then: ${buildStationList(specs, 2, stationPct)} · ${stationRx(specs[7], stationPct)}`, zone: z2, route: 'Gym', time: '1 hr' }
    }
    return { type: 'strength', workout: 'STRENGTH + Station circuit', detail: `${P.strengthDetail.build} · Then at race effort: ${buildStationList(specs, P.simStations[phase === 'build' ? 'build' : 'peak'], stationPct)} · ${stationRx(specs[7], stationPct)} · ${weakStation} focus`, zone: z3, route: 'Gym', time: '1 hr 15 min' }
  }

  // RUN_CONDITIONING: Second run day with conditioning
  if (role === 'run_conditioning') {
    if (phase === 'base') {
      return { type: 'run', workout: 'Easy run + strides', detail: 'Z2 pace + 4×20 sec strides at the end.', zone: `${runMi + 0.5} mi · ${z2}${easyPace}`, route: 'Flat route', time: `${Math.round((runMi + 0.5) * 12)} min` }
    }
    const tempoMin = Math.round(lerp(TEMPO_MINUTES.value.start, TEMPO_MINUTES.value.end, progress, 0))
    return {
      type: 'run',
      workout: 'Tempo run',
      detail: `${tempoMin} min @ ${z3}. Build lactate threshold.`,
      zone: `${runMi + 0.5} mi · ${z3}${tempoPace}`,
      route: 'Flat route',
      time: `${Math.round((runMi + 0.5) * 11)} min`,
      plannedWorkout: hyroxIntervalWorkout({
        workoutId: 'hyrox_tempo',
        name: 'Tempo run',
        category: 'tempo',
        primaryZone: 'lactate_threshold',
        main: {
          role: 'main',
          description: 'Steady tempo — comfortably hard, a few words at most; one even effort, no surges',
          duration: { value: tempoMin, unit: 'min' },
          paceZone: 'lactate_threshold',
        },
        approxMinutes: { min: tempoMin + 18, max: tempoMin + 28 },
      }),
    }
  }

  // STATIONS: Dedicated station practice day. In build/peak this
  // alternates week-by-week between a progressive circuit and COMPROMISED
  // RUNNING — the run→station→run structure that defines the race and was
  // entirely absent from v1 (its closest session was run-then-lift).
  if (role === 'stations') {
    if (phase === 'base') {
      return { type: 'cross', workout: 'Station circuit (intro)', detail: `${buildStationList(specs, 5, stationPct)} · ${stationRx(specs[7], stationPct)} · ${weakStation} practice · Rest 2 min between · Grip note: finish with 2× dead hang to build the carry/pull grip the race demands`, zone: z2, route: 'Gym', time: '45 min' }
    }
    if (weekIndex % COMPROMISED_DOSE.value.cadenceWeeks === 1) {
      const triple = compromisedTriple(specs, weekIndex)
      return {
        type: 'quality',
        workout: 'Compromised running',
        detail: `${COMPROMISED_DOSE.value.rounds}×[1km run @ race pace + station], NO break between run and station: ${triple.map(s => stationRx(s, Math.min(1, stationPct + 0.15))).join(' / ')}. Jog the transitions — the Roxzone is race time too. This alternating structure, not run-then-lift, is the actual race demand.`,
        zone: `${z3}–${z4}`,
        route: 'Run + Gym',
        time: '50 min',
      }
    }
    const sims = phase === 'build' ? P.simStations.build : P.simStations.peak
    return { type: 'cross', workout: `Station circuit (${sims} stations)`, detail: `${buildStationList(specs, sims, stationPct)} · ${stationRx(specs[7], stationPct)} · ${weakStation} extra set · ${P.sledNote} · 90 sec rest between stations`, zone: z3, route: 'Gym', time: '55 min' }
  }

  // EASY: Active recovery day. When the athlete picked cross-training
  // modes, rotate through THEIR selections week to week (the promise made
  // in onboarding) instead of the generic "bike, elliptical, or easy jog".
  if (role === 'easy') {
    if (crossModes && crossModes.length > 0) {
      const mode = crossModes[weekIndex % crossModes.length]
      const c = buildCrossDetail(mode, { phaseId: phase, isTaper: phase === 'taper', weekNumber: weekIndex + 1 })
      return { type: 'cross', workout: c.workout, detail: c.detail, zone: c.zone, route: 'Any', time: c.time }
    }
    return { type: 'run', workout: 'Easy run or cross-train', detail: 'Very easy. Active recovery. Bike, elliptical, or easy jog.', zone: `${Math.max(2, runMi - 1)} mi · ${z1}`, route: 'Any', time: '30 min' }
  }

  // LONG: Long session (always Saturday-ish). The full/half simulations
  // are placed by the race-proximity overlay in the week loop, never here
  // — so a clamped runway still gets them (v1's phase-gated simulation was
  // unreachable on short plans).
  if (role === 'long') {
    const longMi = lerp(P.longRunMi, P.peakLongMi, progress)
    if (phase === 'base') {
      return { type: 'long', workout: 'Long run', detail: 'Build endurance. Conversational pace throughout.', zone: `${longMi} mi · ${z2}${easyPace}`, route: 'Any route', time: `${Math.round(longMi * 12)} min` }
    }
    if (phase === 'build' || phase === 'peak') {
      const finisher = compromisedTriple(specs, weekIndex + 1)
      // Sentence form on purpose (no ' · '): the modal shows the Hyrox
      // long-run narrative as execution, with this line as the summary.
      return { type: 'long', workout: 'Long run + station finisher', detail: `${longMi} mi run, then straight into ${finisher.map(s => stationRx(s, Math.min(1, stationPct))).join(', ')} at moderate effort — no break between run and stations. Running on tired legs into stations is the race demand.`, zone: `${longMi} mi · ${z2}${easyPace}`, route: 'Run + Gym', time: `${Math.round(longMi * 12) + 25} min` }
    }
    return { type: 'run', workout: 'Easy shakeout', detail: 'Taper. Short and easy. Stay sharp.', zone: `2.0 mi · ${z1}`, route: 'Flat route', time: '25 min' }
  }

  return { type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' }
}
