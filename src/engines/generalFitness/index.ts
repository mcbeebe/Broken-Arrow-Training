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

interface SessionCtx {
  preset: typeof GOAL_PRESETS[keyof typeof GOAL_PRESETS]
  z1: string
  z2: string
  z4: string
  /** Combined experience × goal-bias × week-progression scale on minutes. */
  cardioFactor: number
  isDeload: boolean
  modality: string
}

/** Beginner-safe full-body strength template for the General Fitness path.
 *  Each entry maps one movement pattern to a CONCRETE exercise whose name
 *  contains a form-cue guide key in utils/exercises (so every row is
 *  tap-for-cues, not "No detailed guide available"). Time-based moves (carry,
 *  core) use a seconds hold instead of the rep target. Beginners get easier
 *  swaps via each guide's `alternates`. */
const STRENGTH_TEMPLATE: { name: string; hold?: boolean }[] = [
  { name: 'Goblet squat' },              // squat
  { name: 'RDL' },                       // hinge
  { name: 'DB row' },                    // pull
  { name: 'Push-up' },                   // push
  { name: 'Farmer carry', hold: true },  // carry
  { name: 'Plank', hold: true },         // core
]

/** Build one training day's content for a pillar role. Returns everything but
 *  the `day` label (spread in by the caller), mirroring the Hyrox generator. */
function sessionContent(role: PillarRole, ctx: SessionCtx): Omit<PlannedDay, 'day'> {
  const { z1, z2, z4, isDeload, modality } = ctx
  switch (role) {
    case 'strength': {
      // Concrete, guide-matching exercise list (see STRENGTH_TEMPLATE). The
      // nuanced loading guidance ("reps in reserve", "heavy for economy") lives
      // in the coaching layer, not these cells. Deload trims to 2 lighter sets.
      const sets = isDeload ? 2 : ctx.preset.strengthSetsN
      const reps = ctx.preset.strengthRepTarget
      const holdSec = isDeload ? 30 : 40
      const detail = STRENGTH_TEMPLATE
        .map(m => `${m.name} ${sets}×${m.hold ? `${holdSec}s` : reps}`)
        .join(' · ')
      return {
        type: 'strength' as WorkoutType,
        workout: isDeload ? 'Strength — deload' : 'Strength — full body',
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
      const work = isDeload ? '2 × 4 min hard' : '4 × 4 min hard'
      return {
        type: 'quality' as WorkoutType,
        workout: 'VO₂max intervals',
        detail: `${work} @ ~90–95% max HR, 3 min easy between · or 8–10 × (1 min hard / 1 min easy) · 10 min warm-up + cool-down.`,
        zone: z4,
        route: modality,
        time: isDeload ? '30 min' : '~40 min',
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
  const goal = config.generalGoal ?? 'stay_healthy'
  const preset = GOAL_PRESETS[goal]
  const maxHR = config.maxHR || (220 - config.age)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z4 = `Z4 (${Math.round(maxHR * 0.90)}–${Math.round(maxHR * 0.95)})`

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
  const firstMonday = mondayOf(today)
  const weeks: TrainingWeek[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = addDays(firstMonday, w * 7)
    const isDeload = weekNum % DELOAD_EVERY === 0
    // Progressive overload across the block; deloads dip to ~60%.
    const cardioFactor = isDeload ? 0.6 : 0.9 + 0.2 * (weekNum / totalWeeks)

    const ctx: SessionCtx = { preset, z1, z2, z4, cardioFactor: cardioFactor * scale.durationFactor * bias, isDeload, modality }

    const days: PlannedDay[] = []
    let roleIdx = 0
    let weekCardioMin = 0
    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      const label = formatDay(dateStr)
      if (!slots.includes(weekday(dateStr))) {
        days.push(REST_DAY(label))
        continue
      }
      const role = roles[roleIdx] ?? 'zone2'
      roleIdx++
      const content = sessionContent(role, ctx)
      const m = parseInt(content.time)
      if (!Number.isNaN(m) && (role === 'zone2' || role === 'long' || role === 'cross' || role === 'vo2max')) weekCardioMin += m
      days.push({ day: label, ...content })
    }

    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: `~${weekCardioMin} min cardio`,
      focus: isDeload
        ? 'Deload week — volume down ~40%. Ease off and let adaptations land.'
        : `${preset.emphasis}.${weekNum === 1 ? ' ' + preset.note : ''}`,
      days,
    })
  }

  const athlete = {
    name: config.athleteName,
    maxHR,
    ftpWatts: config.ftpWatts,
    currentBase: `${config.experienceLevel} · ${daysPerWeek} days/week · goal: ${preset.label}`,
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
