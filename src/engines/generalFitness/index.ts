// General Fitness plan generator — the method-less analog to
// generatePlanFromMethod / generateHyroxPlan. Builds a rolling, open-ended
// block (progressive overload + auto-deload) for a chosen goal preset over the
// shared 4-pillar engine (Zone 2 · VO2max · strength · mobility).
//
// Pure + deterministic given (config, today) so it can be derived state in the
// app and pinned in tests. See docs/GENERAL_FITNESS_ENGINE_DESIGN.md.

import type {
  TrainingPlan,
  TrainingWeek,
  PlannedDay,
  HRZone,
  WorkoutType,
  RaceInfo,
} from '../../types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { GOAL_PRESETS, weeklyRoles, experienceScale, type PillarRole } from './presets'
import { buildStrengthDay, parseGoalEmphasis, emphasisLabel, type MuscleEmphasis } from './strength'
import { hasMenopauseContext } from '../../utils/menopause'
import { INJURY_LEADIN_WEEKS } from '../../utils/injuryRamp'
import { computeMaxHR } from '../../utils/heartRate'
import { effectivePlanStart } from '../../utils/planDates'
import { athleteCurrentVdot } from '../planGenerator/paceTargets'
import { paceBoundsForZone, type VdotPaceBounds } from '../planGenerator/vdot'
import { isBenchmarkWeek, benchmarkDetail, benchmarkWorkoutName } from '../strength/benchmark'

/** Format a VDOT pace band as " · 8:30–9:45/mi" (fast–slow), or '' when absent.
 *  P2-10: lets the General Fitness engine anchor cardio intensity to a recent
 *  race effort instead of HR zones only. */
function formatPaceRange(b: VdotPaceBounds | null): string {
  if (!b) return ''
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  return ` · ${fmt(b.paceSecPerMileHigh)}–${fmt(b.paceSecPerMileLow)}/mi`
}

// ── Defaults ──────────────────────────────────────────────────────────────
/** Rolling block length when no target date is set. The plan re-bases from
 *  here; the user just keeps training. */
const DEFAULT_BLOCK_WEEKS = 12
const MIN_BLOCK_WEEKS = 4
const MAX_BLOCK_WEEKS = 16
/** Deload cadence — a lighter week every Nth week (trigger-based deloads aren't
 *  modeled offline; this is the sensible default from the research). */
const DELOAD_EVERY = 4

// ── Date helpers (mirror the other generators) ──────────────────────────────
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${names[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

function weekday(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}

/** Monday of the calendar week containing `today`. Weeks run Mon→Sun so the
 *  weekday→training-slot mapping is stable. */
function mondayOf(today: string): string {
  const wd = weekday(today)
  const offset = wd === 0 ? -6 : 1 - wd
  return addDays(today, offset)
}

const DAY_NAME_TO_WEEKDAY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}
function dayNameToWeekday(name?: string): number | null {
  if (!name) return null
  const wd = DAY_NAME_TO_WEEKDAY[name.trim().toLowerCase()]
  return wd === undefined ? null : wd
}

// ── HR zones (mirror the Hyrox generator's % of max model) ──────────────────
function computeZones(maxHR: number): HRZone[] {
  return [
    { zone: 'Z1 – Recovery', hr: `${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)}`, pct: '55–65%', desc: 'Very easy, full conversation' },
    { zone: 'Z2 – Aerobic', hr: `${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)}`, pct: '65–75%', desc: 'Easy. Can speak in sentences (Talk Test)' },
    { zone: 'Z3 – Tempo', hr: `${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)}`, pct: '75–85%', desc: 'Comfortably hard' },
    { zone: 'Z4 – VO₂max', hr: `${Math.round(maxHR * 0.90)}–${Math.round(maxHR * 0.95)}`, pct: '90–95%', desc: 'Hard. A few words at most' },
  ]
}

/** Which weekday indices are training days for a given days/week. Spread for
 *  recovery between sessions; same mapping the Hyrox generator uses. */
function trainingDayNumbers(daysPerWeek: number): number[] {
  switch (daysPerWeek) {
    case 3: return [1, 3, 6]        // Mon, Wed, Sat
    case 4: return [1, 2, 4, 6]     // Mon, Tue, Thu, Sat
    case 5: return [1, 2, 3, 5, 6]  // Mon, Tue, Wed, Fri, Sat
    case 6: return [1, 2, 3, 4, 5, 6]
    default: return [1, 3, 6]
  }
}

const round5 = (n: number) => Math.max(15, Math.round(n / 5) * 5)

/** Midlife (menopause) re-dial of the shared engine. Composes with every goal
 *  preset rather than replacing it: strength keeps the goal's volume and ADDS a
 *  heavy bone-loading finisher, the hard cardio day is expressed as short sprint
 *  intervals, and a symptom-keyed recovery nudge is surfaced. Grounded in
 *  docs/research/Menopause_Training_Evidence_Foundation_v1.md (heavy load =
 *  Strong for bone; SIT = Moderate; recovery individualized to symptoms, never
 *  status-gated). The contested "limit cardio for cortisol" claim is NOT applied. */
interface MenopauseOverlay {
  /** Heavy, low-rep finisher appended to strength days (bone loading). */
  strengthBoneCue: string
  /** SIT prescription that replaces the default VO₂max protocol on full weeks. */
  sitWorkout: string
  sitDetail: string
  /** One-line rationale surfaced in the week focus. */
  focusNote: string
  /** Symptom-responsive recovery nudge — present only when the athlete reported
   *  sleep/energy symptoms (never gated on menopausal status alone). */
  recoveryNudge?: string
}

interface SessionCtx {
  preset: typeof GOAL_PRESETS[keyof typeof GOAL_PRESETS]
  z1: string
  z2: string
  z4: string
  /** Combined experience × goal-bias × week-progression scale on minutes. */
  cardioFactor: number
  isDeload: boolean
  modality: string
  /** 1-based week within the block — drives the VO₂max on-ramp. */
  weekNum: number
  /** Block length — the benchmark needs it to keep testing out of the
   *  final two weeks. */
  totalWeeks: number
  /** Strength sessions this week. The benchmark may only consume one when
   *  a routine session still remains — the ≥2-strength-days health floor
   *  (and Build Endurance's ≥1) outranks measuring. */
  weekStrengthTotal: number
  /** Leading weeks held easy after injury (0 when healthy). Hard intervals
   *  are downgraded to easy aerobic for these weeks. */
  injuryLeadInWeeks: number
  /** Muscle groups the athlete named in their free-text goal — drives the
   *  direct accessory work appended to each strength day (empty = none named). */
  emphases: MuscleEmphasis[]
  /** Active midlife re-dial, or null when no stage was disclosed. */
  overlay: MenopauseOverlay | null
}

/** Build one training day's content for a pillar role. Returns everything but
 *  the `day` label (spread in by the caller), mirroring the Hyrox generator.
 *  `strengthIndex` is the running count of strength days from the start of the
 *  block; it alternates the A/B session and rotates emphasis accessories. */
function sessionContent(role: PillarRole, ctx: SessionCtx, strengthIndex: number, weekStrengthIndex = 0): Omit<PlannedDay, 'day'> {
  const { z1, z2, z4, isDeload, modality } = ctx
  switch (role) {
    case 'strength': {
      // Week 1 and each re-test week measure instead of prescribing. A
      // general-conditioning plan has no race to calibrate against, so
      // the benchmark is the ONLY thing standing between the athlete and
      // a load pulled from a three-option self-report.
      // ONLY the week's first strength day becomes the test. Replacing
      // every strength day in the week would delete a week of lifting and
      // break the ≥2-strength-days health floor — the benchmark costs one
      // session, not a block.
      if (
        ctx.totalWeeks > 0 && !isDeload && weekStrengthIndex === 0 &&
        ctx.weekStrengthTotal >= 2 &&
        isBenchmarkWeek(ctx.weekNum, ctx.totalWeeks)
      ) {
        const retest = ctx.weekNum > 1
        return {
          type: 'strength' as WorkoutType,
          workout: benchmarkWorkoutName(retest),
          detail: benchmarkDetail('general', retest),
          zone: z1,
          route: 'Gym / home',
          time: '40 min',
        }
      }
      // Goal-personalized, varied exercise list (see ./strength). Two full-body
      // sessions rotate so consecutive strength days differ, and the athlete's
      // named muscles get direct accessory work. The nuanced loading guidance
      // ("reps in reserve", "heavy for economy") lives in the coaching layer,
      // not these cells. Deload trims to 2 lighter sets.
      const sets = isDeload ? 2 : ctx.preset.strengthSetsN
      const reps = ctx.preset.strengthRepTarget
      const holdSec = isDeload ? 30 : 40
      let detail = buildStrengthDay(ctx.preset.id, ctx.emphases, strengthIndex)
        .map(m => `${m.name} ${sets}×${m.hold ? `${holdSec}s` : reps}`)
        .join(' · ')
      // Midlife overlay: keep the goal's volume, then add a heavy bone-loading
      // finisher (skipped on deload weeks). Heavy load is the strongest lever
      // for bone, which estrogen loss thins.
      const boned = !!ctx.overlay && !isDeload
      if (boned) detail += ` · ${ctx.overlay!.strengthBoneCue}`
      return {
        type: 'strength' as WorkoutType,
        workout: isDeload ? 'Strength — deload' : boned ? 'Strength — full body + bone' : 'Strength — full body',
        detail,
        zone: z1,
        route: 'Gym / home',
        time: isDeload ? '35 min' : '45–60 min',
      }
    }
    case 'zone2': {
      const min = round5(40 * ctx.cardioFactor)
      return {
        type: 'run' as WorkoutType,
        workout: 'Zone 2 — easy aerobic',
        detail: 'Conversational pace (Talk Test: full sentences, can’t sing). Your choice of cardio.',
        zone: `${min} min · ${z2}`,
        route: modality,
        time: `${min} min`,
      }
    }
    case 'long': {
      const min = round5(65 * ctx.cardioFactor)
      return {
        type: 'long' as WorkoutType,
        workout: 'Long easy session',
        detail: 'The week’s longest aerobic effort — steady and conversational. Builds durability.',
        zone: `${min} min · ${z2}`,
        route: modality,
        time: `${min} min`,
      }
    }
    case 'vo2max': {
      // Returning from injury: hold hard intervals through the lead-in weeks so
      // the actual workout matches the "intensity stays easy" card note instead
      // of contradicting it with a full 4×4. Swap in an easy aerobic session.
      if (ctx.weekNum <= ctx.injuryLeadInWeeks) {
        return {
          ...sessionContent('zone2', ctx, strengthIndex),
          workout: 'Zone 2 — easy aerobic (intervals on hold)',
        }
      }
      // Midlife overlay expresses the hard day as short sprint intervals (SIT)
      // on full weeks — better for body composition and muscle retention in
      // midlife. Deload keeps the gentler on-ramp protocol below.
      if (ctx.overlay && !isDeload) {
        return {
          type: 'quality' as WorkoutType,
          workout: ctx.overlay.sitWorkout,
          detail: ctx.overlay.sitDetail,
          zone: z4,
          route: modality,
          time: '~30 min',
        }
      }
      // Build INTO VO₂max work rather than opening at a punishing 4×4 — that's
      // too much for most general-fitness athletes, and especially for someone
      // fresh off an injury lead-in. Ramp reps first, then duration, over the
      // opening hard weeks; 4×4 is the destination, not the starting line.
      const activeWeek = ctx.weekNum - ctx.injuryLeadInWeeks
      let reps: number
      let mins: number
      if (isDeload) {
        reps = 2; mins = 3
      } else if (activeWeek <= 2) {
        reps = 3; mins = 3
      } else if (activeWeek <= 4) {
        reps = 4; mins = 3
      } else {
        reps = 4; mins = 4
      }
      // work + 3-min recoveries between reps + ~20 min warm-up/cool-down.
      const totalMin = round5(reps * mins + (reps - 1) * 3 + 20)
      const building = !isDeload && (reps < 4 || mins < 4)
      return {
        type: 'quality' as WorkoutType,
        workout: 'VO₂max intervals',
        detail:
          `${reps} × ${mins} min hard @ ~90–95% max HR, 3 min easy jog between` +
          (building ? ' (building toward 4 × 4)' : '') +
          ' · prefer shorter reps? 8–10 × (1 min hard / 1 min easy) · ' +
          '10 min warm-up + cool-down.',
        zone: z4,
        route: modality,
        time: `~${totalMin} min`,
      }
    }
    case 'cross': {
      const min = round5(40 * ctx.cardioFactor)
      return {
        type: 'cross' as WorkoutType,
        workout: 'Cross-training — easy',
        detail: 'Low-impact aerobic: bike, row, swim, or hike. Easy effort.',
        zone: `${min} min · ${z2}`,
        route: modality,
        time: `${min} min`,
      }
    }
  }
}

const REST_DAY = (day: string): PlannedDay => ({
  day, type: 'rest', workout: 'Rest', detail: 'Walk, stretch, mobility. Aim ~8k steps.', zone: '—', route: '—', time: '—',
})

/** Resolve the rolling-block length: weeks until an optional target date
 *  (clamped), else the default open-ended block. */
function resolveBlockWeeks(config: OnboardingConfig, today: string): number {
  if (config.raceDate) {
    const start = mondayOf(today)
    const end = new Date(config.raceDate + 'T12:00:00').getTime()
    const startMs = new Date(start + 'T12:00:00').getTime()
    const weeks = Math.round((end - startMs) / (7 * 86400_000))
    if (weeks >= MIN_BLOCK_WEEKS) return Math.min(MAX_BLOCK_WEEKS, weeks)
  }
  return DEFAULT_BLOCK_WEEKS
}

const CARDIO_BIAS_FACTOR = { low: 0.85, normal: 1.0, high: 1.2 } as const

/** Display label for cardio sessions from the explicit modality pick, falling
 *  back to inference (cross-training/equipment) when unset — keeps plans
 *  generated before the cardioModality field existed valid. */
function resolveModality(config: OnboardingConfig): string {
  switch (config.cardioModality) {
    case 'running': return 'Running'
    case 'cycling': return 'Cycling'
    case 'rowing': return 'Rowing'
    case 'swimming': return 'Swimming'
    case 'mixed': return 'Run / bike / row — your choice'
    default:
      return config.crossTrainingModes && config.crossTrainingModes.length > 0
        ? 'Run / bike / row / your cross-training'
        : 'Run / bike / row'
  }
}

/** Build the midlife (menopause) overlay from onboarding inputs, or null when no
 *  stage was disclosed (premenopause through postmenopause all qualify via
 *  hasMenopauseContext). Composes with any goal preset — it adds bone-loading +
 *  SIT + a symptom-keyed recovery nudge without changing the goal's pillar
 *  weighting or strength volume. Recovery is keyed to SYMPTOMS, not status, per
 *  the evidence, so the deload cadence (DELOAD_EVERY) is left untouched. */
function menopauseOverlay(config: OnboardingConfig): MenopauseOverlay | null {
  if (!hasMenopauseContext(config)) return null
  const symptoms = config.menopauseSymptoms ?? []
  const lowReserve = symptoms.includes('sleep_disruption') || symptoms.includes('low_energy')
  return {
    strengthBoneCue: 'heavy finish: 1–2×5 on a main lift (load bone)',
    sitWorkout: 'Sprint intervals (SIT)',
    sitDetail:
      '8–10 × 20s near-max effort, 90s easy between · 10 min warm-up + cool-down. Short, hard sprints protect muscle and metabolism in midlife — keep them; high intensity is good for you here.',
    focusNote:
      'Midlife tuning: strength adds heavy bone-loading sets, the hard day is short sprints, and recovery flexes to how you feel.',
    recoveryNudge: lowReserve
      ? 'Recovery: midlife sleep and energy can dip — protect your sleep and don’t force a hard day after a bad night.'
      : undefined,
  }
}

/**
 * Generate a personalized General-Fitness TrainingPlan from onboarding inputs.
 *
 * Method-less: the `generalGoal` field selects the preset that re-weights the
 * four pillars. Open-ended rolling block by default; if `config.raceDate` is
 * set it sizes the block to that horizon (clamped 4–16 weeks). `today` is
 * injectable for deterministic tests.
 */
export function generateGeneralFitnessPlan(
  config: OnboardingConfig,
  today: string = new Date().toISOString().slice(0, 10),
): TrainingPlan {
  // Athlete-chosen plan start (one-way clamp: never back-dates).
  today = effectivePlanStart(config.planStartDate, today)
  const goal = config.generalGoal ?? 'stay_healthy'
  const preset = GOAL_PRESETS[goal]
  const maxHR = computeMaxHR(config)
  const zones = computeZones(maxHR)
  // P2-10: if the athlete entered a recent race, anchor cardio intensity to it
  // (concrete paces) rather than HR zones only — the GF engine otherwise ignores
  // fitnessAnchor entirely.
  const vdot = athleteCurrentVdot(config)
  const easyPace = vdot ? formatPaceRange(paceBoundsForZone(vdot, 'easy')) : ''
  const vo2Pace = vdot ? formatPaceRange(paceBoundsForZone(vdot, 'vo2max')) : ''
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})${easyPace}`
  const z4 = `Z4 (${Math.round(maxHR * 0.90)}–${Math.round(maxHR * 0.95)})${vo2Pace}`

  const daysPerWeek = Math.min(6, Math.max(3, config.trainingDaysPerWeek))
  const slots = trainingDayNumbers(daysPerWeek)
  const scale = experienceScale(config.experienceLevel)
  const bias = CARDIO_BIAS_FACTOR[preset.cardioBias]
  const modality = resolveModality(config)

  // Anchor the week's long session to the athlete's preferred long day when
  // that weekday is one of the training slots.
  const baseRoles = weeklyRoles(goal, daysPerWeek)
  const longWd = dayNameToWeekday(config.longRunDay)
  const roles: PillarRole[] = [...baseRoles]
  if (longWd !== null) {
    const slotIdx = slots.indexOf(longWd)
    const longIdx = roles.indexOf('long')
    if (slotIdx >= 0 && longIdx >= 0 && slotIdx !== longIdx) {
      ;[roles[slotIdx], roles[longIdx]] = [roles[longIdx], roles[slotIdx]]
    }
  }

  const totalWeeks = resolveBlockWeeks(config, today)
  // Hold hard intervals easy for the opening weeks when the athlete is coming
  // back from / managing an injury, matching the injury-ramp note the day
  // cards surface (utils/injuryRamp). Healthy athletes get 0.
  const injuryLeadInWeeks = INJURY_LEADIN_WEEKS[config.injuryStatus ?? 'none'] ?? 0
  // Read the athlete's free-text goal ("big biceps", "wider back") for the
  // muscle(s) to emphasize. Drives the direct accessory work on every strength
  // day so the plan visibly serves THEIR goal, not just the preset bucket.
  const emphases = parseGoalEmphasis(config.athleteGoal)
  const emphasisText = emphasisLabel(emphases)
  const overlay = menopauseOverlay(config)
  const firstMonday = mondayOf(today)
  const weeks: TrainingWeek[] = []
  // Running count of strength days across the whole block — alternates the A/B
  // session and rotates emphasis accessories so workouts vary continuously,
  // not just within a single week.
  let strengthIndex = 0

  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = addDays(firstMonday, w * 7)
    const isDeload = weekNum % DELOAD_EVERY === 0
    // Progressive overload across the block; deloads dip to ~60%.
    const cardioFactor = isDeload ? 0.6 : 0.9 + 0.2 * (weekNum / totalWeeks)

    const weekStrengthTotal = roles.filter(r => r === 'strength').length
    const ctx: SessionCtx = { preset, z1, z2, z4, cardioFactor: cardioFactor * scale.durationFactor * bias, isDeload, modality, weekNum, totalWeeks, weekStrengthTotal, injuryLeadInWeeks, emphases, overlay }

    const days: PlannedDay[] = []
    let roleIdx = 0
    let weekCardioMin = 0
    let weekStrengthIndex = 0
    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      const label = formatDay(dateStr)
      if (!slots.includes(weekday(dateStr))) {
        days.push(REST_DAY(label))
        continue
      }
      const role = roles[roleIdx] ?? 'zone2'
      roleIdx++
      const content = sessionContent(role, ctx, strengthIndex, weekStrengthIndex)
      if (role === 'strength') { strengthIndex++; weekStrengthIndex++ }
      const m = parseInt(content.time)
      if (!Number.isNaN(m) && (role === 'zone2' || role === 'long' || role === 'cross' || role === 'vo2max')) weekCardioMin += m
      days.push({ day: label, ...content })
    }

    // Week-1 focus names the goal emphasis so the athlete immediately sees the
    // plan is built around what they asked for (e.g. direct arm volume).
    const emphasisNote = emphasisText
      ? ` Extra direct ${emphasisText} work in every strength session to target your goal.`
      : ''
    let focus = isDeload
      ? 'Deload week — volume down ~40%. Ease off and let adaptations land.'
      : `${preset.emphasis}.${weekNum === 1 ? ' ' + preset.note + emphasisNote : ''}`
    // Surface the midlife tuning rationale once, on week 1, plus the
    // symptom-keyed recovery nudge when the athlete reported it.
    if (overlay && weekNum === 1) {
      focus += ` ${overlay.focusNote}`
      if (overlay.recoveryNudge) focus += ` ${overlay.recoveryNudge}`
    }
    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: `~${weekCardioMin} min cardio`,
      focus,
      days,
    })
  }

  const athlete = {
    name: config.athleteName,
    maxHR,
    ftpWatts: config.ftpWatts,
    currentBase: `${config.experienceLevel} · ${daysPerWeek} days/week · goal: ${preset.label}${emphasisText ? ` (${emphasisText} focus)` : ''}`,
    weeklyStructure: `${daysPerWeek} days/week — ${preset.emphasis.toLowerCase()}`,
    equipmentAccess: config.equipmentAccess,
  }

  const race: RaceInfo = {
    name: config.raceName || preset.label,
    date: config.raceDate || '',
    startTime: '',
    distance: 'General fitness — no race',
    distanceMiles: 0,
    elevation: '—',
    elevationRange: '—',
    course: '—',
    cutoff: '—',
    landmarks: [],
    gear: [],
    nutrition: preset.note,
  }

  return { athlete, zones, race, weeks, generalGoal: goal }
}
