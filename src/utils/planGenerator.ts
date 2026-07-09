import type { TrainingPlan, TrainingWeek, PlannedDay, HRZone, PlanAdvisory } from '../types'
import type { OnboardingConfig, ExperienceLevel } from '../hooks/useOnboarding'
import { menopauseStrengthCue } from './menopause'
import { INJURY_LEADIN_WEEKS } from './injuryRamp'
import { computeMaxHR } from './heartRate'
import { athleteCurrentVdot } from '../engines/planGenerator/paceTargets'
import { paceBoundsForZone, type VdotPaceBounds } from '../engines/planGenerator/vdot'

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

function getWeekStart(raceDate: string, weeksOut: number): string {
  return addDays(raceDate, -weeksOut * 7)
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
  const maxHR = computeMaxHR(config)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z3 = `Z3 (${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)})`
  const z4 = `Z4 (${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)})`

  const raceDate = config.raceDate || addDays(new Date().toISOString().slice(0, 10), 84)
  const P = getLevelParams(config.experienceLevel)
  // Runway clamp (P0): the level template is a MAXIMUM, never a mandate.
  // Back-counting a fixed 8–20-week template from race day used to start
  // plans in the past — and, in a multi-race season, ON TOP of the
  // previous race's build (the week-numbering corruption bug). The plan
  // can never begin before `today`.
  const weeksAvailable = Math.max(
    1,
    Math.floor((Date.parse(`${raceDate}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / (7 * 86_400_000)),
  )
  const totalWeeks = Math.min(P.totalWeeks, Math.max(1, weeksAvailable))
  const runwayClamped = totalWeeks < P.totalWeeks
  const daysPerWeek = config.trainingDaysPerWeek
  const weakStation = config.weakStation || 'Wall Balls'

  // P1-6 — bring the running engine's tailoring to Hyrox: a midlife bone-loading
  // finisher on strength days (menopause-aware), and an injury lead-in that eases
  // the hard days for the first N weeks.
  const hasGym = !!config.equipmentAccess?.includes('gym')
  const boneCue = menopauseStrengthCue(config)
  const boneFinisher = boneCue ? (hasGym ? boneCue.gymFinisher : boneCue.bodyweightFinisher) : []
  const injuryLeadIn = INJURY_LEADIN_WEEKS[config.injuryStatus ?? 'none'] ?? 0

  // Anchor run paces to a tested effort when one exists (mirrors General Fitness):
  // a Hyrox athlete with a recent race time gets concrete paces on run days, not
  // just heart-rate zones. Falls back to HR-only when there's no anchor.
  const anchorVdot = athleteCurrentVdot(config)
  const easyPace = anchorVdot ? formatPaceRange(paceBoundsForZone(anchorVdot, 'easy')) : ''
  const tempoPace = anchorVdot ? formatPaceRange(paceBoundsForZone(anchorVdot, 'lactate_threshold')) : ''
  const cvPace = anchorVdot ? formatPaceRange(paceBoundsForZone(anchorVdot, 'critical_velocity')) : ''

  const baseEnd = Math.round(totalWeeks * 0.3)
  const buildEnd = Math.round(totalWeeks * 0.7)
  const peakEnd = totalWeeks - 1

  // Workout roles assigned to training days (not day-of-week).
  // 3 days: run, strength/stations, long
  // 4 days: run, strength, stations, long
  // 5 days: run, strength, run+conditioning, stations, long
  // 6 days: run, strength, run+conditioning, stations, easy, long
  const rolesByDays: Record<number, string[]> = {
    3: ['run', 'strength_stations', 'long'],
    4: ['run', 'strength', 'stations', 'long'],
    5: ['run', 'strength', 'run_conditioning', 'stations', 'long'],
    6: ['run', 'strength', 'run_conditioning', 'stations', 'easy', 'long'],
  }
  const roles = rolesByDays[daysPerWeek] || rolesByDays[4]
  const trainingDayNumbers = getTrainingDayNumbers(daysPerWeek)

  const weeks: TrainingWeek[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = getWeekStart(raceDate, totalWeeks - w)
    const phase = weekNum <= baseEnd ? 'base' : weekNum <= buildEnd ? 'build' : weekNum <= peakEnd ? 'peak' : 'taper'
    const isRecovery = P.recoveryWeeks.includes(weekNum)

    const days: PlannedDay[] = []
    let roleIdx = 0

    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      const dayLabel = formatDay(dateStr)
      const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()

      if (!trainingDayNumbers.includes(dayOfWeek)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }

      const role = roles[roleIdx] || 'run'
      roleIdx++
      const base = getHyroxWorkoutByRole(role, phase, isRecovery, P, weakStation, z1, z2, z3, z4, easyPace, tempoPace, cvPace)
      let day: PlannedDay = { day: dayLabel, ...base }
      // Menopause: append a bone-loading finisher to real strength days (skip
      // recovery/taper — maintenance only).
      if (boneFinisher.length > 0 && !isRecovery && phase !== 'taper' && base.type === 'strength') {
        day = { ...day, workout: `${base.workout} + bone`, detail: `${base.detail} · ${boneFinisher.join(' · ')}` }
      }
      // Injury lead-in: ease the hard days (quality/strength) for the first N weeks.
      if (injuryLeadIn > 0 && weekNum <= injuryLeadIn && !isRecovery && (base.type === 'quality' || base.type === 'strength')) {
        day = { ...day, workout: `${day.workout} — easing back`, detail: `Returning from injury: keep effort easy and form-focused. ${day.detail}`, zone: z1 }
      }
      // Equipment: no gym → strength/station prescriptions assume kit they don't
      // have. Keep the structure, append the home substitutions.
      if (!hasGym) {
        const sub = equipmentSubFor(role)
        if (sub) day = { ...day, detail: `${day.detail} · ${sub}` }
      }
      days.push(day)
    }

    const baseMiles = isRecovery ? Math.round(P.baseRunMi * 4) : phase === 'base' ? Math.round(P.baseRunMi * daysPerWeek) : phase === 'build' ? Math.round(P.buildRunMi * daysPerWeek) : Math.round(P.peakRunMi * daysPerWeek)

    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: isRecovery ? `~${Math.round(baseMiles * 0.6)}` : `~${baseMiles}`,
      focus: (isRecovery ? 'RECOVERY WEEK. Volume drops 40%. Absorb adaptations.'
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
  if (!hasGym) {
    advisories.push({
      id: 'hyrox_no_gym',
      severity: 'caution',
      title: 'Hyrox needs equipment',
      detail: 'Several Hyrox stations — SkiErg, sled, rower, wall balls, farmer carry — need a gym or competition setup, and you didn’t list gym access. Your plan keeps the structure and gives home substitutions where possible.',
      suggestion: 'Book gym or Hyrox-facility time before race day to rehearse the real stations and weights.',
    })
  }

  return {
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
      distance: '8km running + 8 stations',
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
}

function getTrainingDayNumbers(daysPerWeek: number): number[] {
  switch (daysPerWeek) {
    case 3: return [1, 3, 6]
    case 4: return [1, 2, 4, 6]
    case 5: return [1, 2, 3, 5, 6]
    case 6: return [1, 2, 3, 4, 5, 6]
    default: return [1, 3, 6]
  }
}

function getHyroxWorkoutByRole(
  role: string,
  phase: string,
  isRecovery: boolean,
  P: LevelParams,
  weakStation: string,
  z1: string, z2: string, z3: string, z4: string,
  easyPace: string = '', tempoPace: string = '', cvPace: string = '',
): Omit<PlannedDay, 'day'> {

  if (isRecovery) {
    if (role === 'run' || role === 'run_conditioning' || role === 'easy') {
      return { type: 'run', workout: 'Easy run', detail: 'Recovery week. Very easy effort.', zone: `${P.baseRunMi} mi · ${z1}`, route: 'Flat route', time: `${Math.round(P.baseRunMi * 12)} min` }
    }
    if (role === 'strength' || role === 'strength_stations' || role === 'stations') {
      return { type: 'cross', workout: 'Light station practice', detail: `Pick 3 stations · 50% effort · Focus on form not speed · ${P.wallBallWeight} wall balls`, zone: z1, route: 'Gym', time: '30 min' }
    }
    if (role === 'long') {
      return { type: 'run', workout: 'Easy long run', detail: 'Recovery week. Easy effort, shorter distance.', zone: `${P.baseRunMi + 0.5} mi · ${z1}`, route: 'Any route', time: `${Math.round((P.baseRunMi + 0.5) * 12)} min` }
    }
    return { type: 'rest', workout: 'Rest', detail: 'Recovery week', zone: '—', route: '—', time: '—' }
  }

  const runMi = phase === 'base' ? P.baseRunMi : phase === 'build' ? P.buildRunMi : P.peakRunMi

  // RUN: Primary running day
  if (role === 'run') {
    if (phase === 'base') {
      return { type: 'run', workout: 'Easy run', detail: 'Conversational pace. Build aerobic base.', zone: `${runMi} mi · ${z2}${easyPace}`, route: 'Flat route', time: `${Math.round(runMi * 12)} min` }
    }
    const reps = phase === 'build' ? P.repeats.build : P.repeats.peak
    if (reps > 0) {
      return { type: 'quality', workout: '1km repeats', detail: `${reps}×1km @ race pace, ${phase === 'peak' ? '60' : '90'} sec rest. Simulate Hyrox run legs.`, zone: `${runMi + 1} mi · ${z3}${cvPace}`, route: 'Track or flat', time: `${Math.round((runMi + 1) * 11)} min` }
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
      return { type: 'strength', workout: 'STRENGTH + Station intro', detail: `${P.strengthDetail.base} · Then: SkiErg 500m · Wall balls ${P.wallBallReps.base} (${P.wallBallWeight})`, zone: z2, route: 'Gym', time: '1 hr' }
    }
    const wb = phase === 'build' ? P.wallBallReps.build : P.wallBallReps.peak
    return { type: 'strength', workout: 'STRENGTH + Station circuit', detail: `${P.strengthDetail.build} · Then: ${P.simStations[phase === 'build' ? 'build' : 'peak']} stations at race effort · Wall balls ${wb} (${P.wallBallWeight}) · ${weakStation} focus`, zone: z3, route: 'Gym', time: '1 hr 15 min' }
  }

  // RUN_CONDITIONING: Second run day with conditioning
  if (role === 'run_conditioning') {
    if (phase === 'base') {
      return { type: 'run', workout: 'Easy run + strides', detail: 'Z2 pace + 4×20 sec strides at the end.', zone: `${runMi + 0.5} mi · ${z2}${easyPace}`, route: 'Flat route', time: `${Math.round((runMi + 0.5) * 12)} min` }
    }
    return { type: 'run', workout: 'Tempo run', detail: `20 min @ ${z3}. Build lactate threshold.`, zone: `${runMi + 0.5} mi · ${z3}${tempoPace}`, route: 'Flat route', time: `${Math.round((runMi + 0.5) * 11)} min` }
  }

  // STATIONS: Dedicated station practice day
  if (role === 'stations') {
    const wb = phase === 'base' ? P.wallBallReps.base : phase === 'build' ? P.wallBallReps.build : P.wallBallReps.peak
    if (phase === 'base') {
      return { type: 'cross', workout: 'Station circuit (intro)', detail: `SkiErg 500m · Row 500m · Wall balls ${wb} (${P.wallBallWeight}) · ${weakStation} practice · Rest 2 min between`, zone: z2, route: 'Gym', time: '45 min' }
    }
    const sims = phase === 'build' ? P.simStations.build : P.simStations.peak
    if (phase === 'build') {
      return { type: 'cross', workout: `Station circuit (${sims} stations)`, detail: `${sims} stations at race effort · Wall balls ${wb} (${P.wallBallWeight}) · ${weakStation} extra set · ${P.sledNote} · 90 sec rest between`, zone: z3, route: 'Gym', time: '55 min' }
    }
    return { type: 'cross', workout: `Simulation (${sims} stations)`, detail: `${sims} stations at race effort + ${sims}×1km runs between. Full race weight. Practice transitions.`, zone: `${z3}–${z4}`, route: 'Gym', time: '1 hr 10 min' }
  }

  // EASY: Active recovery day
  if (role === 'easy') {
    return { type: 'run', workout: 'Easy run or cross-train', detail: 'Very easy. Active recovery. Bike, elliptical, or easy jog.', zone: `${Math.max(2, runMi - 1)} mi · ${z1}`, route: 'Any', time: '30 min' }
  }

  // LONG: Long session (always Saturday-ish)
  if (role === 'long') {
    if (phase === 'base') {
      return { type: 'long', workout: 'Long run', detail: 'Build endurance. Conversational pace throughout.', zone: `${P.longRunMi} mi · ${z2}${easyPace}`, route: 'Any route', time: `${Math.round(P.longRunMi * 12)} min` }
    }
    if (phase === 'build') {
      return { type: 'long', workout: 'Long run + station finisher', detail: `${P.longRunMi} mi run then ${P.simStations.build > 4 ? '4' : '3'} station circuits at moderate effort. Running on tired legs into stations.`, zone: `${P.longRunMi} mi · ${z2}${easyPace}`, route: 'Run + Gym', time: `${Math.round(P.longRunMi * 12) + 25} min` }
    }
    if (phase === 'peak') {
      return { type: 'long', workout: 'FULL HYROX SIMULATION', detail: `8×1km runs + all 8 stations at race effort. ${P.wallBallWeight} wall balls. ${P.sledNote}. Full dress rehearsal.`, zone: `8km + stations · ${z3}`, route: 'Gym', time: '1 hr 30 min' }
    }
    return { type: 'run', workout: 'Easy shakeout', detail: 'Taper. Short and easy. Stay sharp.', zone: `2.0 mi · ${z1}`, route: 'Flat route', time: '25 min' }
  }

  return { type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' }
}
