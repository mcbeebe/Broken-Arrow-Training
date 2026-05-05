import type { SportType, TRIMPRecord, DailyTRIMP, StravaActivity, GarminActivity, StrengthExerciseLog, IFSource } from '../types'
import { localDateStr } from './format'
import { cyclingMIM } from '../engines/cycling/mim'
import { hikingMIM } from '../engines/terrain/locomotion/hiking'
import { runningMIM } from '../engines/terrain/locomotion/running'
import { computeIntensityFactor } from './intensity-factor'

// ─── Training Load Calculation (ATE-aligned) ────────────────────
//
// Primary: Garmin's on-device EPOC (activityTrainingLoad) — computed
// by Firstbeat algorithm from beat-by-beat R-R intervals on the watch.
// This is the most accurate per-activity load available.
//
// Fallback: Banister TRIMP (1991) when Garmin EPOC is unavailable
// (e.g., Strava-only activities or activities without HR sensor).
//
// EPOC and TRIMP are NOT additive — engine uses one per activity.

// ─── Banister TRIMP (Fallback) ──────────────────────────────────
// TRIMP = duration(min) × fHR × y
// where fHR = (avgHR - restHR) / (maxHR - restHR)
// Male: y = 0.64 × e^(1.92 × fHR)

export function calculateBanisterTRIMP(
  durationMinutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
): number {
  if (durationMinutes <= 0 || avgHR <= restingHR || maxHR <= restingHR) return 0
  const fHR = Math.min(Math.max((avgHR - restingHR) / (maxHR - restingHR), 0), 1)
  return durationMinutes * fHR * 0.64 * Math.exp(1.92 * fHR)
}

// ─── MIM (Musculoskeletal Impact Modifier) Matrix ───────────────
// Validated against Firstbeat EPOC ranges (WP-G6)
// From ATE engine: 23-activity mapping

const MIM_MATRIX: Record<SportType, number> = {
  // Running variants
  running: 1.0,
  trail_running: 1.1,
  // Sustained climbing/descent on a run — eccentric load on quads from
  // descents pushes DOMS into hiking-territory. Auto-promoted by
  // classifyRun() when avg grade clears ~3.8% (200 ft/mi).
  running_steep: 1.3,
  // Cycling
  cycling: 0.65,
  // E-bike: pedal-assist reduces both cardiovascular and muscular
  // demand significantly. Treat as ~half of regular cycling load.
  // In practice, Garmin EPOC will already reflect the lower HR; this
  // MIM further discounts the musculoskeletal impact.
  ebike: 0.30,
  mountain_biking: 0.8,
  // Hiking
  hiking: 0.8,
  hiking_steep: 1.2,
  walking: 0.4,
  // Water sports
  swimming: 0.35,
  lap_swimming: 0.35,
  aqua_jogging: 0.6,
  // Strength (sub-classified by focus)
  // strength_lower raised from 1.5 → 2.0: EPOC massively underestimates
  // eccentric damage from heavy squats/lunges/deadlifts. DOMS peaks 24-48h
  // later but EPOC only captures acute cardiovascular cost.
  strength_upper: 0.2,
  strength_lower: 2.0,
  strength_full: 1.2,
  // High-intensity
  hiit: 1.3,
  cardio: 1.3,
  // Cardio machines
  elliptical: 0.7,
  rowing: 0.5,
  indoor_rowing: 0.5,
  // Recovery / mobility
  yoga: 0.3,
  pilates: 0.3,
  // Breathwork — no mechanical load
  breathwork: 0.0,
  // Myrtl hip routine — light activation of glute medius, hip flexors,
  // and rotators. Real but minimal muscular work; small credit so it
  // shows up on the books without inflating load.
  myrtl: 0.1,
  // Running drills (A-skips, B-skips, strides, bounding) — plyometric
  // impact + HR stays in Z2-3 during work reps. Half of running to
  // credit both the cardio and impact/eccentric landing cost without
  // over-counting the short duration.
  running_drills: 0.5,
  // Catch-all
  other: 0.6,
}

// ─── Minimum Load Floors ───────────────────────────────────────
// Garmin EPOC can report absurdly low values for strength (e.g., 20-30)
// because HR doesn't stay elevated. These floors ensure that a real
// strength session gets credited with meaningful load.
const MIN_LOAD_FLOOR: Partial<Record<SportType, number>> = {
  strength_lower: 70,  // heavy compound lower = minimum 70 adjusted load
  strength_full: 50,   // full body = minimum 50
  strength_upper: 20,  // upper body = minimum 20
  hiking_steep: 40,    // steep hike = minimum 40
}

// ─── DOMS Carry-Forward Coefficients ───────────────────────────
// Delayed-Onset Muscle Soreness (DOMS) peaks 24-48h after eccentric
// loading. The current system only counts load on day 0, but the
// physiological recovery cost persists for 2-3 days.
// Values: fraction of original adjusted load added to day+1, day+2
export const DOMS_CARRY: Partial<Record<SportType, number[]>> = {
  strength_lower: [0.40, 0.20],  // +40% day+1, +20% day+2 (heavy eccentric)
  strength_full:  [0.25, 0.10],  // +25% day+1, +10% day+2
  hiking_steep:   [0.15, 0.05],  // eccentric from steep descents
  trail_running:  [0.10],        // mild DOMS from terrain variation
  running_steep:  [0.15, 0.05],  // sustained eccentric on descents
  running_drills: [0.10],        // mild calf/Achilles tightness from bounding + strides
}

const DEFAULT_MIM = 0.6

// MTB rough-terrain bump on top of the cycling MIM formula. Cycling MIM
// captures smooth-road tibiofemoral compression only; mountain biking adds
// impact and brief eccentric load that the formula doesn't model directly.
const MTB_TERRAIN_BUMP = 1.2

let _mimOverrideCache: Record<string, { calibrated: number; manual: number | null }> | null = null
let _mimOverrideCacheKey = ''

function loadCache(athleteId?: string) {
  if (!athleteId) return
  const key = `ba_mim_calibration_${athleteId}`
  if (_mimOverrideCacheKey !== key) {
    try {
      const raw = localStorage.getItem(key)
      _mimOverrideCache = raw ? JSON.parse(raw).overrides ?? null : null
      _mimOverrideCacheKey = key
    } catch { _mimOverrideCache = null }
  }
}

/**
 * Returns ONLY the user-entered manual override (or null when none).
 * Used by resolveMIM to short-circuit the dynamic formula — the rule is
 * "manual always wins, but auto-calibrated tuning shouldn't override the
 * per-workout formula since that formula doesn't have a static default
 * for calibration to tune in the first place."
 */
function getManualOnlyOverride(sportType: SportType, athleteId?: string): number | null {
  if (!athleteId) return null
  loadCache(athleteId)
  const o = _mimOverrideCache?.[sportType]
  if (!o) return null
  if (o.manual !== null && o.manual !== undefined) return o.manual
  return null
}

/**
 * Returns manual override OR auto-calibrated value (or null when neither).
 * Used by static-MIM consumers (`getSportMultiplier`) where calibrated
 * values legitimately tune the static lookup for sports without a
 * dynamic formula (running, strength, etc.).
 */
function getManualOrCalibratedOverride(sportType: SportType, athleteId?: string): number | null {
  if (!athleteId) return null
  loadCache(athleteId)
  const o = _mimOverrideCache?.[sportType]
  if (!o) return null
  if (o.manual !== null && o.manual !== undefined) return o.manual
  if (o.calibrated !== undefined) return o.calibrated
  return null
}

export function getSportMultiplier(sportType: SportType, athleteId?: string): number {
  return getManualOrCalibratedOverride(sportType, athleteId) ?? MIM_MATRIX[sportType] ?? DEFAULT_MIM
}

export function invalidateMIMCache() {
  _mimOverrideCacheKey = ''
  _mimOverrideCache = null
}

// ─── Per-Athlete DOMS Carry Calibration ─────────────────────────
// Athletes recover at different rates. The DOMS_CARRY table has fixed
// defaults derived from group studies, but we let `useDOMSCalibration`
// learn a per-athlete multiplier (default 1.0×) by comparing measured
// soreness vs predicted DOMS over a rolling window. Storage shape mirrors
// the MIM calibration so the engine just reads localStorage.

export const DEFAULT_DOMS_MULT = 1.0
export const DOMS_MULT_MIN = 0.5
export const DOMS_MULT_MAX = 2.0

let _domsOverrideCache: Record<string, { calibrated: number; manual: number | null }> | null = null
let _domsOverrideCacheKey = ''

export function getDOMSCarryMultiplier(sportType: SportType, athleteId?: string): number {
  if (!athleteId) return DEFAULT_DOMS_MULT
  const key = `ba_doms_calibration_${athleteId}`
  if (_domsOverrideCacheKey !== key) {
    try {
      const raw = localStorage.getItem(key)
      _domsOverrideCache = raw ? JSON.parse(raw).overrides ?? null : null
      _domsOverrideCacheKey = key
    } catch { _domsOverrideCache = null }
  }
  const o = _domsOverrideCache?.[sportType]
  if (!o) return DEFAULT_DOMS_MULT
  if (o.manual !== null && o.manual !== undefined) return o.manual
  if (o.calibrated !== undefined) return o.calibrated
  return DEFAULT_DOMS_MULT
}

export function invalidateDOMSCalibrationCache() {
  _domsOverrideCacheKey = ''
  _domsOverrideCache = null
}

// ─── Dynamic MIM Resolution (Hill Running v1.1) ─────────────────
// For hiking and cycling, the v1.1 research replaces a single static
// multiplier with a continuous function of the activity's terrain and
// intensity. Manual calibration overrides still win — they encode the
// athlete's own perception of load and we shouldn't second-guess them.

export interface ResolveMIMInputs {
  elevationGainFt?: number | null
  distanceMi?: number | null
  avgHR?: number | null
  restingHR?: number | null
  maxHR?: number | null
  ftpWatts?: number | null
  avgPowerW?: number | null
  normalizedPowerW?: number | null
  /** Time-weighted MIM derived from a per-second altitude+distance stream
   *  via `computeWholeActivityGAP`. When supplied for a running activity,
   *  preferred over avg-grade because it captures short steep peaks (hill
   *  repeats, technical descents) that average grade smooths out. */
  gapMIM?: number | null
}

export interface MIMResolution {
  mim: number
  intensityFactor?: number
  ifSource: IFSource
  /** Diagnostic: when ifSource='static' for a sport that CAN compute
   *  dynamically (cycling/MTB/hiking), explains which inputs were missing.
   *  Surfaced in WorkoutModal so the athlete can tell whether the formula
   *  actually got the data it needed. */
  staticReason?: string
}

const FT_PER_MI = 5280

function resolveHikingMIM(sportType: SportType, inputs: ResolveMIMInputs): MIMResolution {
  const elevFt = inputs.elevationGainFt ?? 0
  const distMi = inputs.distanceMi ?? 0
  if (distMi > 0) {
    const grade = elevFt / (distMi * FT_PER_MI)
    return { mim: hikingMIM(grade), ifSource: 'grade' }
  }
  return {
    mim: MIM_MATRIX[sportType] ?? DEFAULT_MIM,
    ifSource: 'static',
    staticReason: 'no distance recorded',
  }
}

function resolveRunningMIM(sportType: SportType, inputs: ResolveMIMInputs): MIMResolution {
  // Prefer the time-weighted GAP MIM when a GPS stream has been processed
  // — this captures short steep peaks the activity-average grade smooths
  // out. Falls back to avg grade, then static.
  if (inputs.gapMIM != null && inputs.gapMIM > 0) {
    return { mim: inputs.gapMIM, ifSource: 'grade_gps' }
  }
  const elevFt = inputs.elevationGainFt ?? 0
  const distMi = inputs.distanceMi ?? 0
  if (distMi > 0) {
    const grade = elevFt / (distMi * FT_PER_MI)
    return { mim: runningMIM(grade), ifSource: 'grade' }
  }
  return {
    mim: MIM_MATRIX[sportType] ?? DEFAULT_MIM,
    ifSource: 'static',
    staticReason: 'no distance recorded',
  }
}

function resolveCyclingMIM(sportType: SportType, inputs: ResolveMIMInputs): MIMResolution {
  const if_ = computeIntensityFactor({
    normalizedPower: inputs.normalizedPowerW,
    avgPower: inputs.avgPowerW,
    ftp: inputs.ftpWatts,
    avgHR: inputs.avgHR,
    restingHR: inputs.restingHR,
    maxHR: inputs.maxHR,
  })
  if (if_ === null) {
    // Diagnose which inputs were missing so the math line can explain.
    const have: string[] = []
    const missing: string[] = []
    ;(inputs.normalizedPowerW ?? 0) > 0 ? have.push(`NP ${inputs.normalizedPowerW}`) : missing.push('NP')
    ;(inputs.avgPowerW ?? 0) > 0 ? have.push(`AP ${inputs.avgPowerW}`) : missing.push('AP')
    ;(inputs.ftpWatts ?? 0) > 0 ? have.push(`FTP ${inputs.ftpWatts}`) : missing.push('FTP')
    ;(inputs.avgHR ?? 0) > 0 ? have.push(`avgHR ${inputs.avgHR}`) : missing.push('avgHR')
    ;(inputs.restingHR ?? 0) > 0 ? have.push(`rHR ${inputs.restingHR}`) : missing.push('rHR')
    ;(inputs.maxHR ?? 0) > 0 ? have.push(`mHR ${inputs.maxHR}`) : missing.push('mHR')
    return {
      mim: MIM_MATRIX[sportType] ?? DEFAULT_MIM,
      ifSource: 'static',
      staticReason: `engine had: ${have.length ? have.join(', ') : 'nothing'}; missing: ${missing.length ? missing.join(', ') : 'nothing'}`,
    }
  }
  const base = cyclingMIM(if_.value)
  const mim = sportType === 'mountain_biking' ? base * MTB_TERRAIN_BUMP : base
  return { mim, intensityFactor: if_.value, ifSource: if_.source }
}

/**
 * Resolve the MIM for an activity, picking the dynamic formula when the
 * relevant inputs are present and falling back to the static MIM_MATRIX
 * value otherwise. Manual calibration overrides bypass the formula
 * entirely so an athlete's tuned number is always respected.
 */
export function resolveMIM(
  sportType: SportType,
  inputs: ResolveMIMInputs,
  athleteId?: string,
): MIMResolution {
  // Only an explicit *manual* override bypasses the dynamic formula.
  // Auto-calibrated values would be meaningless here (the formula doesn't
  // have a static default for calibration to tune); they only apply via
  // getSportMultiplier when the sport has no dynamic engine.
  const override = getManualOnlyOverride(sportType, athleteId)
  if (override !== null) {
    return { mim: override, ifSource: 'static' }
  }

  if (sportType === 'hiking' || sportType === 'hiking_steep') {
    return resolveHikingMIM(sportType, inputs)
  }

  if (sportType === 'cycling' || sportType === 'mountain_biking') {
    return resolveCyclingMIM(sportType, inputs)
  }

  if (sportType === 'running' || sportType === 'trail_running' || sportType === 'running_steep') {
    return resolveRunningMIM(sportType, inputs)
  }

  // ebike: pedal assist makes IF unreliable as a muscular-load proxy.
  // Strength, swimming, etc. stay on their static MIM until the research
  // backs a dynamic formula for them.
  return { mim: getSportMultiplier(sportType, athleteId), ifSource: 'static' }
}

// ─── MIM Engine Description (for UI) ────────────────────────────
// Tells the Settings page which formula governs each sport so the table
// can show "0.4 + 0.4·IF²" instead of a fixed default that no longer
// matches the engine. Range is the typical span for a real workout.

export type MIMEngine = 'static' | 'cycling-if' | 'mountain-biking-if' | 'hiking-grade' | 'running-grade'

export interface MIMEngineDescription {
  engine: MIMEngine
  /** Static fallback for the sport (used when dynamic inputs missing). */
  staticValue: number
  /** Short human-friendly formula label for the table. */
  formulaLabel: string
  /** Typical realized range for this sport — for the engine column hint. */
  typicalRange?: [number, number]
}

export function describeMIMEngine(sport: SportType): MIMEngineDescription {
  const staticValue = MIM_MATRIX[sport] ?? DEFAULT_MIM
  if (sport === 'cycling') {
    return {
      engine: 'cycling-if',
      staticValue,
      formulaLabel: '0.4 + 0.4·IF²',
      typicalRange: [0.5, 1.0],
    }
  }
  if (sport === 'mountain_biking') {
    return {
      engine: 'mountain-biking-if',
      staticValue,
      formulaLabel: '(0.4 + 0.4·IF²) × 1.2',
      typicalRange: [0.6, 1.2],
    }
  }
  if (sport === 'hiking' || sport === 'hiking_steep') {
    return {
      engine: 'hiking-grade',
      staticValue,
      formulaLabel: 'Minetti walk / flat run',
      typicalRange: [0.3, 4.9],
    }
  }
  if (sport === 'running' || sport === 'trail_running' || sport === 'running_steep') {
    return {
      engine: 'running-grade',
      staticValue,
      formulaLabel: 'Minetti run / flat run',
      typicalRange: [0.5, 5.4],
    }
  }
  return {
    engine: 'static',
    staticValue,
    formulaLabel: staticValue.toFixed(2) + '× (static)',
  }
}

// ─── Activity Type Classification ───────────────────────────────
// Maps raw Garmin/Strava type strings to ATE SportType
// Then applies sub-classification for strength and hiking

const TYPE_MAP: Record<string, SportType> = {
  // Strava types
  run: 'running',
  trail_run: 'trail_running',
  ride: 'cycling',
  virtualride: 'cycling',
  gravelride: 'cycling',           // Strava sport_type "GravelRide"
  velomobile: 'cycling',           // Strava sport_type "Velomobile"
  ebikeride: 'ebike',
  emountainbikeride: 'ebike',
  mountainbikeride: 'mountain_biking',
  swim: 'swimming',
  hike: 'hiking',        // resolved to hiking/hiking_steep by elevation
  walk: 'walking',
  yoga: 'yoga',
  weighttraining: 'strength_full',  // resolved to upper/lower/full by sub-classifier
  workout: 'strength_full',
  elliptical: 'elliptical',
  rowing: 'rowing',
  // Garmin types (from Garmin Connect API)
  running: 'running',
  treadmill_running: 'running',
  trail_running: 'trail_running',
  cycling: 'cycling',
  indoor_cycling: 'cycling',
  road_biking: 'cycling',          // Garmin's term for road rides
  gravel_cycling: 'cycling',
  cyclocross: 'cycling',
  track_cycling: 'cycling',
  bmx: 'cycling',
  commuting: 'cycling',
  bike_commute: 'cycling',
  virtual_ride: 'cycling',
  // Garmin e-bike activity types (varies by device firmware)
  e_bike_fitness: 'ebike',
  e_bike_mountain: 'ebike',
  electric_bike: 'ebike',
  electric_bike_ride: 'ebike',
  ebike: 'ebike',
  mountain_biking: 'mountain_biking',
  downhill_biking: 'mountain_biking',
  hiking: 'hiking',
  walking: 'walking',
  swimming: 'swimming',
  open_water_swimming: 'swimming',
  lap_swimming: 'lap_swimming',
  pool_swimming: 'lap_swimming',
  strength_training: 'strength_full',
  cardio: 'cardio',
  hiit: 'hiit',
  indoor_rowing: 'indoor_rowing',
  pilates: 'pilates',
  breathwork: 'breathwork',
  // Catch-all
  other: 'other',
}

// ATE steep hike threshold (from ENGINE_DEFAULTS)
const STEEP_HIKE_ELEV_THRESHOLD_FT = 500

// Run hilliness thresholds — primary signal is ft/mile (proxy for avg
// grade). Total-gain fallbacks are used when distance is unavailable.
//   100 ft/mi ≈ 1.9% avg grade → trail/rolling
//   200 ft/mi ≈ 3.8% avg grade → mountain run (sustained climb + descent)
const TRAIL_RUN_ELEV_PER_MI_FT = 100
const STEEP_RUN_ELEV_PER_MI_FT = 200
const TRAIL_RUN_TOTAL_GAIN_FT = 500
const STEEP_RUN_TOTAL_GAIN_FT = 1500

// ATE strength HR inference threshold (60% HRR → lower body focus)
const STRENGTH_HR_INFERENCE_THRESHOLD = 0.60

/**
 * Sub-classify strength activities into upper/lower/full.
 * ATE priority: (1) name keywords, (2) HR inference, (3) default full.
 */
export function classifyStrength(
  activityName: string,
  avgHR?: number,
  restingHR?: number,
  maxHR?: number,
  exerciseNames?: string[],
): SportType {
  const name = activityName.toLowerCase()

  // Priority 1: Activity name keywords
  const lowerKeywords = ['lower', 'legs', 'leg day', 'squat', 'deadlift', 'lunge', 'glute', 'hamstring', 'quad']
  const upperKeywords = ['upper', 'push', 'pull', 'chest', 'shoulder', 'arm', 'bicep', 'tricep', 'back']

  if (lowerKeywords.some(k => name.includes(k))) return 'strength_lower'
  if (upperKeywords.some(k => name.includes(k))) return 'strength_upper'

  // Priority 2: Exercise set inspection — check actual exercises performed.
  // If exercise names include lower body movements, classify as lower even when
  // the activity is generically named "Strength" by Garmin.
  if (exerciseNames && exerciseNames.length > 0) {
    const lowerExercises = ['squat', 'lunge', 'deadlift', 'step up', 'step_up', 'stepup',
      'leg press', 'leg_press', 'leg curl', 'leg_curl', 'leg extension', 'leg_extension',
      'calf raise', 'calf_raise', 'hip thrust', 'hip_thrust', 'glute', 'hamstring',
      'romanian', 'rdl', 'goblet', 'front squat', 'back squat', 'bulgarian']
    const upperExercises = ['bench', 'press', 'curl', 'row', 'pullup', 'pull_up', 'pull-up',
      'pushup', 'push_up', 'push-up', 'fly', 'flye', 'lateral raise', 'shoulder',
      'tricep', 'bicep', 'dip', 'overhead']

    const allExercises = exerciseNames.join(' ')
    const hasLower = lowerExercises.some(k => allExercises.includes(k))
    const hasUpper = upperExercises.some(k => allExercises.includes(k))

    if (hasLower && !hasUpper) return 'strength_lower'
    if (hasUpper && !hasLower) return 'strength_upper'
    if (hasLower && hasUpper) return 'strength_full'
  }

  // Priority 3: HR inference — high HR during strength = lower body focus
  if (avgHR && restingHR && maxHR && maxHR > restingHR) {
    const hrReservePct = (avgHR - restingHR) / (maxHR - restingHR)
    if (hrReservePct > STRENGTH_HR_INFERENCE_THRESHOLD) return 'strength_lower'
  }

  // Default: full body
  return 'strength_full'
}

/**
 * Sub-classify hiking into flat vs steep based on elevation gain.
 */
export function classifyHiking(elevationGainFt: number): SportType {
  return elevationGainFt > STEEP_HIKE_ELEV_THRESHOLD_FT ? 'hiking_steep' : 'hiking'
}

/**
 * Promote a `running` or `trail_running` activity into a hillier tier
 * when the terrain warrants it. Mirrors classifyHiking, but on a 2-step
 * scale (flat → trail → steep). Uses ft/mile when distance is known
 * (proxy for avg grade), falls back to total gain otherwise.
 *
 * Never demotes — an activity already tagged trail_running won't drop
 * back to running just because the climb was modest.
 */
export function classifyRun(
  baseSport: SportType,
  elevationGainFt: number,
  distanceMi?: number,
): SportType {
  if (baseSport !== 'running' && baseSport !== 'trail_running') return baseSport
  if (elevationGainFt <= 0) return baseSport

  const elevPerMi = distanceMi && distanceMi > 0 ? elevationGainFt / distanceMi : null

  const isSteep = elevPerMi != null
    ? elevPerMi >= STEEP_RUN_ELEV_PER_MI_FT
    : elevationGainFt >= STEEP_RUN_TOTAL_GAIN_FT
  if (isSteep) return 'running_steep'

  if (baseSport === 'trail_running') return baseSport // don't demote

  const isTrail = elevPerMi != null
    ? elevPerMi >= TRAIL_RUN_ELEV_PER_MI_FT
    : elevationGainFt >= TRAIL_RUN_TOTAL_GAIN_FT
  return isTrail ? 'trail_running' : 'running'
}

/**
 * Map raw activity type string to ATE SportType with sub-classification.
 * Pass the full activity for Garmin sub-classification (strength/hiking).
 */
export function mapToSportType(
  rawType: string,
  activity?: { name?: string; avgHR?: number; elevationGainFt?: number; distanceMi?: number; exerciseNames?: string[] },
  restingHR?: number,
  maxHR?: number,
): SportType {
  const normalized = rawType.toLowerCase().replace(/\s+/g, '_')
  const name = (activity?.name || '').toLowerCase()

  // ── Name-based overrides (highest priority) ──
  // These let the athlete record on Garmin with any activity type
  // (walking, cardio, other, etc.) and get classified correctly by
  // the activity title.
  if (/\b(drill|drills|a[- ]?skip|b[- ]?skip|strides|stride)\b/.test(name)) {
    return 'running_drills'
  }
  if (/\b(myrtl|myrtle)\b/.test(name)) {
    return 'myrtl'
  }
  if (/\b(e[- ]?bike|ebike|pedal[- ]?assist|electric[- ]?bike)\b/.test(name)) {
    // Assist-level hints in the name let the athlete signal when they
    // rode hard with minimal motor help — that brings the muscular load
    // closer to a regular bike and should be credited as such.
    //
    // "no assist" / "off" / "unplugged" / "full power" / "hard" →
    //    treat as regular cycling (0.65×) — rider did the work
    // "low assist" / "eco" / "min assist" →
    //    also regular cycling — you're grinding harder than pure e-bike
    // Default (moderate/auto/turbo assist) → ebike (0.30×)
    if (/\b(no[- ]?assist|off[- ]?assist|unplugged|full[- ]?power|hard|low[- ]?assist|min[- ]?assist|eco[- ]?mode|minimal[- ]?assist)\b/.test(name)) {
      return 'cycling'
    }
    return 'ebike'
  }
  if (/\b(breathwork|breath work|wim[- ]?hof)\b/.test(name)) {
    return 'breathwork'
  }

  const baseSport = TYPE_MAP[normalized] ?? TYPE_MAP[normalized.replace(/_/g, '')] ?? 'other'

  // Sub-classify strength
  if (baseSport === 'strength_full' && activity?.name) {
    return classifyStrength(activity.name, activity.avgHR, restingHR, maxHR, activity.exerciseNames)
  }

  // Sub-classify hiking
  if (baseSport === 'hiking' && activity?.elevationGainFt != null) {
    return classifyHiking(activity.elevationGainFt)
  }

  // Sub-classify running by hilliness — auto-promote a road "Run" with
  // significant climbing into trail_running / running_steep so MIM
  // reflects the actual eccentric load. Only applies when we have an
  // elevation reading (Garmin/Strava both supply it).
  if ((baseSport === 'running' || baseSport === 'trail_running') && activity?.elevationGainFt != null) {
    return classifyRun(baseSport, activity.elevationGainFt, activity.distanceMi)
  }

  return baseSport
}

// ─── Elevation Bonus (RETIRED — kept as 0 for backward-compat) ────
//
// Previously +10 per 500 ft of elevation gain — a T4 heuristic intended
// to cover (a) eccentric loading on descents and (b) altitude stress.
//
// Both effects are now modeled with research-grounded engines that
// supersede this heuristic:
//
//   (a) Eccentric loading → `src/engines/descent/eccentric.ts` integrates
//       per-second eccentric score (Vernillo 2017 PMID 27392180; Peake
//       2017 PMID 28035017) and feeds research-backed DOMS carry-forward
//       in `applyDOMSCarryForward`. For activities without GPS streams,
//       static T4 DOMS_CARRY remains the fallback.
//
//   (b) Altitude stress → deferred to the dedicated Altitude Engine
//       (PROJECT_PLAN.md §5.4, Chapman 2014 / West 2013 / Levine &
//       Stray-Gundersen 1997). Elevation gain alone isn't a good proxy
//       for hypoxic stress; cumulative km·hours above ~1500 m is.
//
// The function is kept (returning 0) so existing callers don't break,
// and so old TRIMPRecords loaded from cache still surface a 0 value for
// `elevationBonus`. Cleanup pending — full removal once no consumer
// references the field for math.
//
// @deprecated — returns 0. Replaced by eccentric engine + altitude engine.
export function calculateElevationBonus(_elevationGainFt: number): number {
  return 0
}

// ─── Adjusted Training Load ─────────────────────────────────────
// adjusted_load = base_load × MIM + elevation_bonus
// base_load = Garmin EPOC (primary) or Banister TRIMP (fallback)
// EPOC and TRIMP are NOT additive — engine uses one per activity.

export function calculateAdjustedLoad(
  baseLoad: number,
  sportType: SportType,
  elevationGainFt: number,
  activityName: string,
  date: string,
  resolved?: MIMResolution,
): TRIMPRecord {
  const mimResolution: MIMResolution = resolved ?? {
    mim: getSportMultiplier(sportType),
    ifSource: 'static',
  }
  const sportMultiplier = mimResolution.mim
  const elevationBonus = calculateElevationBonus(elevationGainFt)
  let adjustedLoad = baseLoad * sportMultiplier + elevationBonus

  // Apply minimum load floor — EPOC can grossly underestimate strength sessions
  const floor = MIN_LOAD_FLOOR[sportType]
  if (floor && adjustedLoad < floor) {
    adjustedLoad = floor
  }

  return {
    date,
    activityName,
    sportType,
    baseTRIMP: Math.round(baseLoad * 10) / 10,
    sportMultiplier: Math.round(sportMultiplier * 1000) / 1000,
    elevationBonus: Math.round(elevationBonus * 10) / 10,
    adjustedTRIMP: Math.round(adjustedLoad * 10) / 10,
    intensityFactor: mimResolution.intensityFactor !== undefined
      ? Math.round(mimResolution.intensityFactor * 1000) / 1000
      : undefined,
    ifSource: mimResolution.ifSource,
    staticReason: mimResolution.staticReason,
  }
}

// Legacy wrapper for backward compatibility
export function calculateAdjustedTRIMP(
  durationMinutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
  sportType: SportType,
  elevationGainFt: number,
  activityName: string,
  date: string,
): TRIMPRecord {
  const baseLoad = calculateBanisterTRIMP(durationMinutes, avgHR, restingHR, maxHR)
  return calculateAdjustedLoad(baseLoad, sportType, elevationGainFt, activityName, date)
}

// ─── Convert activities to training load records ────────────────

export function stravaActivityToTRIMP(
  activity: StravaActivity,
  restingHR: number,
  maxHR: number,
  athleteFTP?: number,
  athleteId?: string,
  gapMIM?: number,
): TRIMPRecord | null {
  if (!activity.average_heartrate) return null

  const elevationFt = activity.total_elevation_gain * 3.28084
  const distanceMi = activity.distance / 1609.344
  const sportType = mapToSportType(
    activity.sport_type || activity.type,
    { name: activity.name, avgHR: activity.average_heartrate, elevationGainFt: elevationFt, distanceMi },
    restingHR,
    maxHR,
  )
  const durationMinutes = activity.moving_time / 60

  const resolved = resolveMIM(sportType, {
    elevationGainFt: elevationFt,
    distanceMi,
    avgHR: activity.average_heartrate,
    restingHR,
    maxHR,
    ftpWatts: athleteFTP,
    avgPowerW: activity.average_watts,
    normalizedPowerW: activity.weighted_average_watts,
    gapMIM,
  }, athleteId)

  // Strava: always use Banister TRIMP (no Garmin EPOC available)
  const baseLoad = calculateBanisterTRIMP(durationMinutes, activity.average_heartrate, restingHR, maxHR)
  return calculateAdjustedLoad(baseLoad, sportType, elevationFt, activity.name, activity.start_date_local.slice(0, 10), resolved)
}

export function garminActivityToTRIMP(
  activity: GarminActivity,
  restingHR: number,
  maxHR: number,
  exerciseNames?: string[],
  athleteFTP?: number,
  athleteId?: string,
  gapMIM?: number,
): TRIMPRecord | null {
  // Activities with zero MIM (myrtl, breathwork — pure mobility) are excluded
  const sportType = mapToSportType(
    activity.type,
    { name: activity.name, avgHR: activity.avgHR, elevationGainFt: activity.elevationGainFt, distanceMi: activity.distanceMi, exerciseNames },
    restingHR,
    maxHR,
  )
  if (getSportMultiplier(sportType) === 0) return null

  const resolved = resolveMIM(sportType, {
    elevationGainFt: activity.elevationGainFt,
    distanceMi: activity.distanceMi,
    avgHR: activity.avgHR,
    restingHR,
    maxHR,
    ftpWatts: athleteFTP,
    avgPowerW: activity.avgPowerW,
    normalizedPowerW: activity.normalizedPowerW,
    gapMIM,
  }, athleteId)

  // Primary: Garmin's on-device EPOC (Firstbeat, from beat-by-beat R-R)
  if (activity.activityTrainingLoad != null && activity.activityTrainingLoad > 0) {
    return calculateAdjustedLoad(
      activity.activityTrainingLoad,
      sportType,
      activity.elevationGainFt,
      activity.name,
      activity.date,
      resolved,
    )
  }

  // Fallback: Banister TRIMP (when EPOC unavailable)
  if (!activity.avgHR) return null
  const baseLoad = calculateBanisterTRIMP(activity.durationMinutes, activity.avgHR, restingHR, maxHR)
  return calculateAdjustedLoad(baseLoad, sportType, activity.elevationGainFt, activity.name, activity.date, resolved)
}

// ─── Lookup helper ──────────────────────────────────────────────
// Find the canonical TRIMPRecord for a logged activity so the UI can
// surface the engine's actual sport classification, MIM, elevation
// bonus, and adjusted load. Falls back to a same-date record when only
// one exists (covers manual logs whose name was edited after sync).

export function findTrimpRecord(
  dailyTrimp: DailyTRIMP[] | undefined | null,
  date: string | null | undefined,
  activityName: string | undefined,
): TRIMPRecord | undefined {
  if (!dailyTrimp || !date) return undefined
  const day = dailyTrimp.find(d => d.date === date)
  if (!day || day.records.length === 0) return undefined
  if (activityName) {
    const exact = day.records.find(r => r.activityName === activityName)
    if (exact) return exact
  }
  return day.records.length === 1 ? day.records[0] : undefined
}

// ─── Aggregate daily training load ──────────────────────────────

export interface ActivityEccentric {
  /** Distance-weighted avg eccentric score 1-5 (Vernillo 2017 / Peake 2017). */
  averageScore: number
}

export function aggregateDailyTRIMP(
  records: TRIMPRecord[],
  athleteId?: string,
  /** Per-activity eccentric data keyed by `${date}|${activityName}`. When
   *  supplied for an activity, DOMS carry-forward is computed from the
   *  research-backed eccentric score instead of the static T4 per-sport
   *  coefficient. Activities not in this map fall back to the static
   *  table (still labeled T4 heuristic). */
  eccentricByActivity?: Record<string, ActivityEccentric>,
): DailyTRIMP[] {
  if (records.length === 0) return []

  const byDate = new Map<string, TRIMPRecord[]>()

  for (const r of records) {
    const existing = byDate.get(r.date) || []
    existing.push(r)
    byDate.set(r.date, existing)
  }

  // Fill in zero-load rest days between first activity and TODAY (inclusive).
  // Must extend to today (not just last activity) so that:
  // 1. EWMA doesn't stall — rest days pull the average down
  // 2. DOMS carry-forward from recent activities lands on today/tomorrow
  // 3. Soreness check-ins on rest days have a day to attach to
  const dates = Array.from(byDate.keys()).sort()
  const startDate = new Date(dates[0] + 'T00:00:00')
  const today = new Date(localDateStr() + 'T00:00:00')
  const lastActivity = new Date(dates[dates.length - 1] + 'T00:00:00')
  const endDate = today > lastActivity ? today : lastActivity

  const result: DailyTRIMP[] = []
  const current = new Date(startDate)

  while (current <= endDate) {
    const dateStr = localDateStr(current)
    const recs = byDate.get(dateStr)
    result.push({
      date: dateStr,
      total: recs ? Math.round(recs.reduce((sum, r) => sum + r.adjustedTRIMP, 0) * 10) / 10 : 0,
      records: recs || [],
    })
    current.setDate(current.getDate() + 1)
  }

  // ── DOMS Carry-Forward ──────────────────────────────────────────
  // Strength and steep activities cause delayed muscle damage (DOMS)
  // that peaks 24-48h later. Spread a fraction of the original load
  // into subsequent days so ATL/fatigue reflects the lingering cost.
  applyDOMSCarryForward(result, athleteId, eccentricByActivity)

  return result
}

// ─── DOMS Calibration Math (pure) ───────────────────────────────
// Compares logged soreness vs predicted DOMS over the carry window for
// each high-eccentric workout. Confounded workouts (those with another
// DOMS-generating activity in the window) are skipped to keep
// attribution clean. Returns one ratio per sport averaging measured /
// predicted across all valid samples.

export interface DOMSCalibrationSample {
  sport: SportType
  ratio: number              // measuredSoreness / predictedDOMS (over the carry window)
  samples: number            // # of qualifying workouts contributing
  predictedAvg: number       // avg predicted DOMS (for transparency)
  measuredAvg: number        // avg measured soreness over the window
}

export interface DOMSCalibrationInput {
  /** Daily aggregated TRIMP including each day's records (raw, post-MIM
   *  adjustedTRIMP). Used to find DOMS-generating workouts and detect
   *  confounded windows. */
  dailyTrimp: DailyTRIMP[]
  /** Map of YYYY-MM-DD → soreness adjustment (positive = sore today).
   *  Negative values (recovery credit) are treated as 0 for prediction
   *  fit since they represent over-recovery, not the DOMS signal. */
  sorenessByDate: Map<string, number>
  /** Athlete's currently-applied per-sport DOMS multiplier (so the fit
   *  ratio reflects deviation from current state, not from default). */
  currentMultiplier: (sport: SportType) => number
  /** Skip workouts whose adjustedTRIMP is below this threshold — too
   *  small for the soreness signal to be reliable. Defaults to 30. */
  minLoad?: number
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function calibrateDOMSCarry(input: DOMSCalibrationInput): DOMSCalibrationSample[] {
  const minLoad = input.minLoad ?? 30
  const samplesBySport = new Map<SportType, { ratios: number[]; predicted: number[]; measured: number[] }>()

  // Index records by date for confound detection
  const recordsByDate = new Map<string, TRIMPRecord[]>()
  for (const day of input.dailyTrimp) {
    recordsByDate.set(day.date, day.records)
  }

  for (const day of input.dailyTrimp) {
    for (const rec of day.records) {
      const carryArr = DOMS_CARRY[rec.sportType]
      if (!carryArr || carryArr.length === 0) continue
      if (rec.adjustedTRIMP < minLoad) continue

      // Skip confounded workouts: another DOMS-generating activity in
      // the lookahead window blurs attribution.
      let confounded = false
      for (let d = 1; d <= carryArr.length; d++) {
        const dayD = recordsByDate.get(shiftDate(day.date, d)) ?? []
        if (dayD.some(r => DOMS_CARRY[r.sportType])) {
          confounded = true
          break
        }
      }
      if (confounded) continue

      const mult = input.currentMultiplier(rec.sportType)
      let predicted = 0
      let measured = 0
      for (let d = 0; d < carryArr.length; d++) {
        predicted += rec.adjustedTRIMP * carryArr[d] * mult
        const sor = input.sorenessByDate.get(shiftDate(day.date, d + 1)) ?? 0
        measured += Math.max(0, sor)
      }
      if (predicted < 1) continue

      const ratio = measured / predicted
      const bucket = samplesBySport.get(rec.sportType) ?? { ratios: [], predicted: [], measured: [] }
      bucket.ratios.push(ratio)
      bucket.predicted.push(predicted)
      bucket.measured.push(measured)
      samplesBySport.set(rec.sportType, bucket)
    }
  }

  const out: DOMSCalibrationSample[] = []
  for (const [sport, b] of samplesBySport) {
    if (b.ratios.length < 2) continue   // need ≥ 2 samples for stability
    const avgRatio = b.ratios.reduce((s, x) => s + x, 0) / b.ratios.length
    const avgPredicted = b.predicted.reduce((s, x) => s + x, 0) / b.predicted.length
    const avgMeasured = b.measured.reduce((s, x) => s + x, 0) / b.measured.length
    out.push({
      sport,
      ratio: Math.round(avgRatio * 100) / 100,
      samples: b.ratios.length,
      predictedAvg: Math.round(avgPredicted * 10) / 10,
      measuredAvg: Math.round(avgMeasured * 10) / 10,
    })
  }
  return out
}

// ─── Per-Day Adjustment Composition ─────────────────────────────
// Combines a day's raw record load with manual exercise, RPE, soreness,
// and engine-predicted DOMS carry into a single adjusted total. Used by
// useReadiness; kept pure so it's trivially testable.
//
// Formula:
//   total = (recordSum + exerciseLoad) × rpeMult
//         + max(domsCarry, sorenessAdj)         // when sorenessAdj > 0
//         + (domsCarry + sorenessAdj)           // when sorenessAdj < 0 (recovery credit)
//         + domsCarry                            // when sorenessAdj == 0 / undefined
//
// RPE multiplies today's effort only, never yesterday's residual carry.
// DOMS prediction and soreness check-in model the same physiological
// signal — when both apply positively, take the higher rather than
// summing. Negative soreness (recovery credit per Twist & Highton 2013)
// bypasses the dedup so it lands additively.

export interface DailyAdjustmentInputs {
  exerciseLoad?: number
  rpeValue?: number
  sorenessAdj?: number
  /** HR-based TRIMP from strength records on this day (subset of recordSum).
   *  When provided alongside `exerciseLoad`, the engine de-duplicates: the
   *  strength contribution becomes `max(strengthHRTRIMP, exerciseLoad)`
   *  rather than the sum. Without this, a Garmin-tracked strength session
   *  would be counted twice — once via HR (cardiovascular signal, captured
   *  by the activity record) and once via rep×weight load (muscular signal
   *  derived from the same activity's exerciseSets). For low-HR strength
   *  (BW circuits, light isometric work), exerciseLoad still wins; for
   *  high-HR strength (HIIT, heavy compounds w/ HR rise), HR wins. */
  strengthHRTRIMP?: number
}

export function composeDayLoad(
  recordSum: number,
  domsCarry: number,
  adj: DailyAdjustmentInputs = {},
): number {
  const exerciseLoad = adj.exerciseLoad ?? 0
  const rpeValue = adj.rpeValue
  const rpeMult = rpeValue ? 1 + 0.04 * (rpeValue - 5) : 1
  const sorenessAdj = adj.sorenessAdj ?? 0
  const strengthHR = adj.strengthHRTRIMP ?? 0

  // De-duplicate strength: if both HR-TRIMP and rep×weight load came from
  // the same session, take the larger signal as the strength contribution
  // and add it to the non-strength HR records. Falls back to legacy
  // additive behavior when caller doesn't pass strengthHRTRIMP (e.g.
  // historical days, manually-only-logged strength with no Garmin record).
  const nonStrengthHR = Math.max(0, recordSum - strengthHR)
  const strengthTotal = strengthHR > 0 ? Math.max(strengthHR, exerciseLoad) : exerciseLoad
  const effortLoad = (nonStrengthHR + strengthTotal) * rpeMult

  let lagged: number
  if (sorenessAdj > 0) {
    lagged = Math.max(domsCarry, sorenessAdj)
  } else if (sorenessAdj < 0) {
    lagged = Math.max(0, domsCarry + sorenessAdj)
  } else {
    lagged = domsCarry
  }

  return Math.max(0, effortLoad + lagged)
}

/**
 * Mutates dailyTrimp array in-place, adding DOMS carry-forward load
 * from high-eccentric activities into subsequent days. When athleteId
 * is provided, scales each per-sport carry by that athlete's calibrated
 * multiplier so individual recovery profiles override group defaults.
 */
/**
 * Eccentric-derived DOMS carry coefficient for an activity.
 *
 * Mechanism is research-backed (Peake 2017 PMID 28035017): eccentric
 * volume × intensity → DOMS, peaking 24-48 h post-exercise then declining.
 * Magnitude per unit of eccentric is a calibrated heuristic chosen so
 * baseline values match the existing static T4 coefficients for trail
 * and steep running:
 *
 *   ecc 1.0 (flat run)     → day+1 = 0%, day+2 = 0%
 *   ecc 2.0 (rolling)      → day+1 = 10%, day+2 = 5%   (≈ trail_running [0.10])
 *   ecc 2.5 (steep)        → day+1 = 15%, day+2 = 7.5% (≈ running_steep [0.15, 0.05])
 *   ecc 4.0 (severe descent) → day+1 = 30%, day+2 = 15%
 *   ecc 5.0 (scramble)     → day+1 = 40%, day+2 = 20% (≈ strength_lower [0.40, 0.20])
 *
 * Per-athlete refinement happens via `useDOMSCalibration` which scales
 * the carry by the athlete's observed soreness pattern.
 */
function eccentricCarryCoefficients(avgScore: number): number[] {
  const above = Math.max(0, avgScore - 1)
  const day1 = Math.round(above * 0.10 * 100) / 100
  const day2 = Math.round(above * 0.05 * 100) / 100
  if (day1 < 0.01) return []
  return [day1, day2]
}

function applyDOMSCarryForward(
  days: DailyTRIMP[],
  athleteId?: string,
  eccentricByActivity?: Record<string, ActivityEccentric>,
): void {
  // Collect DOMS sources first (to avoid double-counting carry on carry)
  const domsSources: { dayIndex: number; load: number; carry: number[]; mult: number }[] = []

  for (let i = 0; i < days.length; i++) {
    for (const rec of days[i].records) {
      // Prefer eccentric-derived coefficient when the activity has a
      // cached per-second eccentric score (computed by computeEccentricLoad
      // in WorkoutModal when the GPS stream loads). Falls back to the
      // static T4 DOMS_CARRY table for activities without a stream
      // (cycling, swimming, strength, plus runs the user hasn't opened).
      const eccKey = `${days[i].date}|${rec.activityName}`
      const ecc = eccentricByActivity?.[eccKey]
      let carry: number[] | undefined
      if (ecc && ecc.averageScore >= 1) {
        const eccCarry = eccentricCarryCoefficients(ecc.averageScore)
        if (eccCarry.length > 0) carry = eccCarry
      }
      if (!carry) {
        const staticCarry = DOMS_CARRY[rec.sportType]
        if (staticCarry && staticCarry.length > 0) carry = staticCarry
      }
      if (carry && carry.length > 0) {
        const mult = getDOMSCarryMultiplier(rec.sportType, athleteId)
        domsSources.push({ dayIndex: i, load: rec.adjustedTRIMP, carry, mult })
      }
    }
  }

  // Apply carry-forward to subsequent days
  for (const src of domsSources) {
    for (let offset = 0; offset < src.carry.length; offset++) {
      const targetIdx = src.dayIndex + offset + 1
      if (targetIdx < days.length) {
        const carryLoad = Math.round(src.load * src.carry[offset] * src.mult * 10) / 10
        days[targetIdx].total = Math.round((days[targetIdx].total + carryLoad) * 10) / 10
      }
    }
  }
}

// ─── Manual Exercise Load ──────────────────────────────────────
// Calculates supplemental training load from manually-logged strength
// exercises. Captures musculoskeletal stress that Garmin EPOC misses
// (especially when Garmin fails to track exercises like goblet squats
// or step-ups).
//
// Per-set base load by muscle focus:
//   lower: 4.0 (compound, high metabolic cost, high DOMS potential)
//   full:  2.5 (mixed compound movements)
//   upper: 1.5 (lower metabolic cost)
//   core:  1.0 (minimal systemic impact)
//
// Modifiers: weight (heavier = more load) and reps (more = more load)

const EXERCISE_BASE_LOAD: Record<string, number> = {
  lower: 4.0,
  full: 2.5,
  upper: 1.5,
  core: 1.0,
}

export function calculateExerciseLoad(exercises: StrengthExerciseLog[]): number {
  if (!exercises || exercises.length === 0) return 0

  let totalLoad = 0
  for (const exercise of exercises) {
    const basePerSet = EXERCISE_BASE_LOAD[exercise.focus] ?? 2.5
    for (const set of exercise.sets) {
      const reps = set.reps || 0
      if (reps === 0) continue

      // Weight modifier: heavier loads = more musculoskeletal stress
      const weightLbs = parseFloat(set.weight) || 0
      const weightScale = weightLbs > 0 ? Math.min(2.0, 1 + weightLbs / 200) : 1.0

      // Rep modifier: normalize to 10-rep baseline
      const repScale = Math.min(2.0, reps / 10)

      totalLoad += basePerSet * weightScale * repScale
    }
  }

  return Math.round(totalLoad * 10) / 10
}
