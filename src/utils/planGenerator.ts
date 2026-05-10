import type { TrainingPlan, TrainingWeek, PlannedDay, HRZone } from '../types'
import type { OnboardingConfig, ExperienceLevel } from '../hooks/useOnboarding'

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

export function generateHyroxPlan(config: OnboardingConfig): TrainingPlan {
  const maxHR = config.maxHR || (220 - config.age)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z3 = `Z3 (${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)})`
  const z4 = `Z4 (${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)})`

  const raceDate = config.raceDate || addDays(new Date().toISOString().slice(0, 10), 84)
  const P = getLevelParams(config.experienceLevel)
  const totalWeeks = P.totalWeeks
  const daysPerWeek = config.trainingDaysPerWeek
  const weakStation = config.weakStation || 'Wall Balls'

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
      const workout = getHyroxWorkoutByRole(role, phase, isRecovery, P, weakStation, z1, z2, z3, z4)
      days.push({ day: dayLabel, ...workout })
    }

    const baseMiles = isRecovery ? Math.round(P.baseRunMi * 4) : phase === 'base' ? Math.round(P.baseRunMi * daysPerWeek) : phase === 'build' ? Math.round(P.buildRunMi * daysPerWeek) : Math.round(P.peakRunMi * daysPerWeek)

    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: isRecovery ? `~${Math.round(baseMiles * 0.6)}` : `~${baseMiles}`,
      focus: isRecovery ? 'RECOVERY WEEK. Volume drops 40%. Absorb adaptations.'
        : phase === 'base' ? `Build aerobic base + station familiarity. ${config.experienceLevel === 'beginner' ? 'Focus on form over speed.' : ''}`
        : phase === 'build' ? `Race-specific station work + running intervals. ${P.sledNote}`
        : phase === 'peak' ? `Full simulations + intensity. ${P.simStations.peak} stations at race effort.`
        : 'Taper. Reduce volume, maintain sharpness. Trust your fitness.',
      days,
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
      return { type: 'run', workout: 'Easy run', detail: 'Conversational pace. Build aerobic base.', zone: `${runMi} mi · ${z2}`, route: 'Flat route', time: `${Math.round(runMi * 12)} min` }
    }
    const reps = phase === 'build' ? P.repeats.build : P.repeats.peak
    if (reps > 0) {
      return { type: 'quality', workout: '1km repeats', detail: `${reps}×1km @ race pace, ${phase === 'peak' ? '60' : '90'} sec rest. Simulate Hyrox run legs.`, zone: `${runMi + 1} mi · ${z3}`, route: 'Track or flat', time: `${Math.round((runMi + 1) * 11)} min` }
    }
    return { type: 'run', workout: 'Easy run', detail: 'Build base before intervals.', zone: `${runMi} mi · ${z2}`, route: 'Flat route', time: `${Math.round(runMi * 12)} min` }
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
      return { type: 'run', workout: 'Easy run + strides', detail: 'Z2 pace + 4×20 sec strides at the end.', zone: `${runMi + 0.5} mi · ${z2}`, route: 'Flat route', time: `${Math.round((runMi + 0.5) * 12)} min` }
    }
    return { type: 'run', workout: 'Tempo run', detail: `20 min @ ${z3}. Build lactate threshold.`, zone: `${runMi + 0.5} mi · ${z3}`, route: 'Flat route', time: `${Math.round((runMi + 0.5) * 11)} min` }
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
      return { type: 'long', workout: 'Long run', detail: 'Build endurance. Conversational pace throughout.', zone: `${P.longRunMi} mi · ${z2}`, route: 'Any route', time: `${Math.round(P.longRunMi * 12)} min` }
    }
    if (phase === 'build') {
      return { type: 'long', workout: 'Long run + station finisher', detail: `${P.longRunMi} mi run then ${P.simStations.build > 4 ? '4' : '3'} station circuits at moderate effort. Running on tired legs into stations.`, zone: `${P.longRunMi} mi · ${z2}`, route: 'Run + Gym', time: `${Math.round(P.longRunMi * 12) + 25} min` }
    }
    if (phase === 'peak') {
      return { type: 'long', workout: 'FULL HYROX SIMULATION', detail: `8×1km runs + all 8 stations at race effort. ${P.wallBallWeight} wall balls. ${P.sledNote}. Full dress rehearsal.`, zone: `8km + stations · ${z3}`, route: 'Gym', time: '1 hr 30 min' }
    }
    return { type: 'run', workout: 'Easy shakeout', detail: 'Taper. Short and easy. Stay sharp.', zone: `2.0 mi · ${z1}`, route: 'Flat route', time: '25 min' }
  }

  return { type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' }
}

// ─── Trail / Road Race Plan Generator ──────────────────────────────────

interface RaceDistance {
  miles: number
  label: string
  category: '5k' | '10k' | 'half' | 'marathon' | 'ultra'
  isTrail: boolean
}

export function parseRaceDistance(name: string): RaceDistance {
  const n = name.toLowerCase()
  const trail = /trail|sky|skyrace|mountain|ultra|broken arrow/.test(n)

  // Explicit ultra distances
  if (/100\s?(mi|mile)/.test(n)) return { miles: 100, label: '100 mi', category: 'ultra', isTrail: true }
  if (/50\s?(mi|mile)/.test(n)) return { miles: 50, label: '50 mi', category: 'ultra', isTrail: true }
  if (/100\s?k/.test(n)) return { miles: 62, label: '100K', category: 'ultra', isTrail: true }
  if (/50\s?k/.test(n)) return { miles: 31, label: '50K', category: 'ultra', isTrail: true }

  // Marathon / half
  if (/half\s*marathon|half-marathon|halfmarathon|13\.1|21\.1\s?k|21\s?k/.test(n))
    return { miles: 13.1, label: 'Half Marathon', category: 'half', isTrail: trail }
  if (/marathon|26\.2|42\s?k|42\.2\s?k/.test(n))
    return { miles: 26.2, label: 'Marathon', category: 'marathon', isTrail: trail }

  // 5k / 10k explicit
  if (/\b5\s?k\b|\b5km\b/.test(n)) return { miles: 3.1, label: '5K', category: '5k', isTrail: trail }
  if (/\b10\s?k\b|\b10km\b/.test(n)) return { miles: 6.2, label: '10K', category: '10k', isTrail: trail }
  if (/\b15\s?k\b/.test(n)) return { miles: 9.3, label: '15K', category: '10k', isTrail: trail }
  if (/\b20\s?k\b/.test(n)) return { miles: 12.4, label: '20K', category: 'half', isTrail: trail }
  if (/\b25\s?k\b/.test(n)) return { miles: 15.5, label: '25K', category: 'half', isTrail: trail }
  if (/\b30\s?k\b/.test(n)) return { miles: 18.6, label: '30K', category: 'marathon', isTrail: trail }

  // Generic "##K" or "##km"
  const km = n.match(/(\d{1,3})\s?k(?:m)?\b/)
  if (km) {
    const k = parseInt(km[1], 10)
    const mi = +(k * 0.6214).toFixed(1)
    const cat: RaceDistance['category'] = mi < 4 ? '5k' : mi < 8 ? '10k' : mi < 16 ? 'half' : mi < 27 ? 'marathon' : 'ultra'
    return { miles: mi, label: `${k}K`, category: cat, isTrail: trail }
  }
  const mi = n.match(/(\d{1,3}(?:\.\d+)?)\s?(mi|mile|miler)/)
  if (mi) {
    const m = parseFloat(mi[1])
    const cat: RaceDistance['category'] = m < 4 ? '5k' : m < 8 ? '10k' : m < 16 ? 'half' : m < 27 ? 'marathon' : 'ultra'
    return { miles: m, label: `${m} mi`, category: cat, isTrail: trail }
  }

  // Default fallback — assume half marathon training stimulus
  return { miles: 13.1, label: 'Half Marathon', category: 'half', isTrail: trail }
}

interface RunLevelParams {
  totalWeeks: number
  // Multipliers applied to race distance for typical weekly volume
  baseWeeklyMult: number
  buildWeeklyMult: number
  peakWeeklyMult: number
  // Long run as fraction of race distance per phase
  baseLongMult: number
  buildLongMult: number
  peakLongMult: number
  recoveryWeeks: number[]
  qualityIntensity: 'gentle' | 'moderate' | 'hard'
  strengthDetail: string
  hillsAllowed: boolean
}

function getRunLevelParams(level: ExperienceLevel, dist: RaceDistance): RunLevelParams {
  // Total weeks scales with both experience and distance
  const baseWeeksByLevel: Record<ExperienceLevel, number> = {
    first_timer: 16, beginner: 14, intermediate: 12, advanced: 10, elite: 8,
  }
  const distanceWeekBoost: Record<RaceDistance['category'], number> = {
    '5k': 0, '10k': 2, half: 4, marathon: 6, ultra: 8,
  }
  const totalWeeks = Math.min(24, baseWeeksByLevel[level] + distanceWeekBoost[dist.category])

  // Long run caps so first-timers don't get crushed by a marathon plan
  const longCapByLevel: Record<ExperienceLevel, number> = {
    first_timer: 0.6, beginner: 0.7, intermediate: 0.85, advanced: 1.0, elite: 1.0,
  }
  const cap = longCapByLevel[level]

  const intensity: RunLevelParams['qualityIntensity'] = level === 'first_timer' || level === 'beginner' ? 'gentle' : level === 'intermediate' ? 'moderate' : 'hard'

  const strengthDetail = level === 'first_timer'
    ? 'BW squats 2×10 · Glute bridges 2×12 · Plank 2×20s · Bird dogs 2×8/side · Calf raises 2×15'
    : level === 'beginner'
      ? 'Goblet squats 3×12 · Step-ups 3×8/leg · Single-leg RDL 3×8/leg · Plank 3×30s · Calf raises 3×15'
      : level === 'intermediate'
        ? 'Goblet squats 3×12 · DB lunges 3×10/leg · Single-leg RDL 3×10/leg · Plank 3×45s · Eccentric step-downs 3×8/leg'
        : level === 'advanced'
          ? 'BB back squat 4×8 · DB lunges 3×10/leg · RDL 3×8 · Eccentric step-downs 3×10/leg · Plank 3×60s · Pull-ups 3×6'
          : 'BB back squat 4×6 heavy · BB deadlift 3×6 · Bulgarian split squats 3×8/leg · Weighted pull-ups 3×6 · Plank 3×60s'

  return {
    totalWeeks,
    baseWeeklyMult: dist.category === 'ultra' ? 1.6 : dist.category === 'marathon' ? 2.0 : dist.category === 'half' ? 2.5 : 3.0,
    buildWeeklyMult: dist.category === 'ultra' ? 2.0 : dist.category === 'marathon' ? 2.4 : dist.category === 'half' ? 3.2 : 4.0,
    peakWeeklyMult: dist.category === 'ultra' ? 2.4 : dist.category === 'marathon' ? 2.8 : dist.category === 'half' ? 3.8 : 4.5,
    baseLongMult: 0.4 * cap,
    buildLongMult: 0.7 * cap,
    peakLongMult: dist.category === 'ultra' ? 0.55 * cap : dist.category === 'marathon' ? 0.8 * cap : 1.0 * cap,
    recoveryWeeks: totalWeeks >= 16 ? [4, 8, 12, 16] : totalWeeks >= 12 ? [4, 8, 12] : totalWeeks >= 9 ? [4, 8] : [4],
    qualityIntensity: intensity,
    strengthDetail,
    hillsAllowed: dist.isTrail || dist.category === 'ultra',
  }
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

function getRunTrainingDayNumbers(daysPerWeek: number, longRunDayNum: number): number[] {
  // Pick training days, ensuring `longRunDayNum` is included.
  const candidates: Record<number, number[]> = {
    3: [1, 3, longRunDayNum],
    4: [1, 2, 4, longRunDayNum],
    5: [1, 2, 3, 4, longRunDayNum],
    6: [0, 1, 2, 3, 4, longRunDayNum],
  }
  const set = new Set<number>(candidates[daysPerWeek] || candidates[4])
  set.add(longRunDayNum)
  return [...set].sort((a, b) => a - b)
}

export function generateTrailPlan(config: OnboardingConfig): TrainingPlan {
  const maxHR = config.maxHR || (220 - config.age)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z3 = `Z3 (${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)})`
  const z4 = `Z4 (${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)})`

  const dist = parseRaceDistance(config.raceName)
  const P = getRunLevelParams(config.experienceLevel, dist)
  const totalWeeks = P.totalWeeks
  const raceDate = config.raceDate || addDays(new Date().toISOString().slice(0, 10), totalWeeks * 7)

  const longRunDayNum = config.longRunDay && DAY_NAME_TO_NUM[config.longRunDay.toLowerCase()] !== undefined
    ? DAY_NAME_TO_NUM[config.longRunDay.toLowerCase()]
    : 6 // Saturday default
  const daysPerWeek = config.trainingDaysPerWeek
  const trainingDayNumbers = getRunTrainingDayNumbers(daysPerWeek, longRunDayNum)

  const baseEnd = Math.max(2, Math.round(totalWeeks * 0.35))
  const buildEnd = Math.max(baseEnd + 2, Math.round(totalWeeks * 0.75))
  const peakEnd = Math.max(buildEnd + 1, totalWeeks - 1)

  const weeks: TrainingWeek[] = []
  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = getWeekStart(raceDate, totalWeeks - w)
    const phase: 'base' | 'build' | 'peak' | 'taper' =
      weekNum <= baseEnd ? 'base'
        : weekNum <= buildEnd ? 'build'
          : weekNum <= peakEnd ? 'peak'
            : 'taper'
    const isRecovery = P.recoveryWeeks.includes(weekNum) && phase !== 'taper'

    // Long run distance for the week
    const longMult = phase === 'base' ? P.baseLongMult : phase === 'build' ? P.buildLongMult : phase === 'peak' ? P.peakLongMult : P.baseLongMult * 0.5
    const phaseProgress = phase === 'base' ? weekNum / baseEnd : phase === 'build' ? (weekNum - baseEnd) / Math.max(1, buildEnd - baseEnd) : 1
    const longMi = Math.max(2, +(dist.miles * longMult * (0.6 + 0.4 * Math.min(1, phaseProgress))).toFixed(1))
    const longRunMi = isRecovery ? +(longMi * 0.6).toFixed(1) : longMi

    const weeklyMult = phase === 'base' ? P.baseWeeklyMult : phase === 'build' ? P.buildWeeklyMult : phase === 'peak' ? P.peakWeeklyMult : P.baseWeeklyMult * 0.6
    const weeklyMiles = Math.max(longRunMi + 3, Math.round(dist.miles * weeklyMult * (isRecovery ? 0.6 : 1)))

    const easyRunMi = Math.max(2, +((weeklyMiles - longRunMi) / Math.max(1, daysPerWeek - 1) * 0.85).toFixed(1))
    const days: PlannedDay[] = []
    let nonLongIdx = 0

    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      const dayLabel = formatDay(dateStr)
      const dow = new Date(dateStr + 'T12:00:00').getDay()

      if (!trainingDayNumbers.includes(dow)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }

      if (dow === longRunDayNum) {
        if (weekNum === totalWeeks) {
          days.push({
            day: dayLabel,
            type: 'race',
            workout: `🏁 RACE DAY — ${dist.label}`,
            detail: `${config.raceName}. Trust your training. Pace conservative early, finish strong. Hydrate + fuel on schedule.`,
            zone: `${dist.miles} mi · race effort`,
            route: dist.isTrail ? 'Race course' : 'Race course',
            time: 'Race day',
          })
        } else {
          days.push({ day: dayLabel, ...buildLongRun(longRunMi, phase, isRecovery, dist, P, z1, z2, z3) })
        }
        continue
      }

      const role = pickRunRole(nonLongIdx, daysPerWeek, phase, P)
      nonLongIdx++
      days.push({ day: dayLabel, ...buildRunDay(role, phase, isRecovery, easyRunMi, dist, P, z1, z2, z3, z4) })
    }

    const focus = isRecovery ? `RECOVERY WEEK. Volume drops ~40%. Absorb adaptations.`
      : phase === 'base' ? `Build aerobic base. Mostly easy mileage. Long run grows toward ${Math.round(dist.miles * P.buildLongMult * 10) / 10} mi.`
        : phase === 'build' ? `Race-specific work introduced. ${P.qualityIntensity === 'hard' ? 'Threshold + interval days.' : P.qualityIntensity === 'moderate' ? 'Tempo + strides.' : 'Easy + strides only.'}`
          : phase === 'peak' ? `Peak weeks. Longest runs and hardest workouts. Trust the progression.`
            : `Taper. Short and sharp. ${dist.label} race day approaches.`

    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: `~${weeklyMiles}`,
      focus,
      days,
    })
  }

  return {
    athlete: {
      name: config.athleteName,
      maxHR,
      ftpWatts: config.ftpWatts,
      currentBase: `${config.experienceLevel} · ${daysPerWeek} days/wk · ${dist.label}`,
      weeklyStructure: `${daysPerWeek} sessions · long run ${config.longRunDay || 'Sat'} · ${dist.isTrail ? 'trail/hill emphasis' : 'road-focused'}`,
    },
    zones,
    race: buildRaceInfo(config, dist, raceDate),
    weeks,
  }
}

function pickRunRole(idx: number, daysPerWeek: number, phase: string, P: RunLevelParams): 'easy' | 'quality' | 'tempo' | 'strength' | 'cross' {
  // Default roster, then adapt to phase + intensity
  if (daysPerWeek <= 3) return idx === 0 ? 'easy' : 'strength'
  if (daysPerWeek === 4) {
    if (idx === 0) return 'easy'
    if (idx === 1) return phase === 'base' ? 'strength' : 'quality'
    return 'strength'
  }
  if (daysPerWeek === 5) {
    if (idx === 0) return 'easy'
    if (idx === 1) return phase === 'base' || P.qualityIntensity === 'gentle' ? 'tempo' : 'quality'
    if (idx === 2) return 'easy'
    return 'strength'
  }
  // 6 days
  if (idx === 0) return 'easy'
  if (idx === 1) return phase === 'base' || P.qualityIntensity === 'gentle' ? 'tempo' : 'quality'
  if (idx === 2) return 'easy'
  if (idx === 3) return P.hillsAllowed ? 'cross' : 'easy'
  return 'strength'
}

function buildRunDay(
  role: 'easy' | 'quality' | 'tempo' | 'strength' | 'cross',
  phase: string,
  isRecovery: boolean,
  easyMi: number,
  dist: RaceDistance,
  P: RunLevelParams,
  z1: string, z2: string, z3: string, z4: string,
): Omit<PlannedDay, 'day'> {
  if (isRecovery && (role === 'quality' || role === 'tempo')) {
    role = 'easy'
  }

  if (role === 'strength') {
    return {
      type: 'strength',
      workout: 'STRENGTH for runners',
      detail: P.strengthDetail,
      zone: z1,
      route: 'Gym or home',
      time: '40 min',
    }
  }

  if (role === 'cross') {
    return {
      type: 'cross',
      workout: P.hillsAllowed ? 'Hike — strength on the hills' : 'Cross-train (bike or row)',
      detail: P.hillsAllowed ? 'Steady hike, ~600–1,200 ft gain. Builds hill-specific strength + descent eccentric load.' : 'Easy effort. Low impact. Cross-training preserves volume.',
      zone: z2,
      route: P.hillsAllowed ? 'Local trail with climbs' : 'Bike / rower / elliptical',
      time: '60–75 min',
    }
  }

  if (role === 'easy') {
    return {
      type: 'run',
      workout: phase === 'base' ? 'Easy run' : 'Easy run + strides',
      detail: phase === 'base' ? 'Conversational pace. Build the aerobic engine.' : 'Easy throughout, finish with 4×20 sec strides on flat.',
      zone: `${easyMi} mi · ${z2}`,
      route: dist.isTrail ? 'Rolling trail or road' : 'Flat road',
      time: `${Math.round(easyMi * 11)} min`,
    }
  }

  if (role === 'tempo') {
    const tempoMin = phase === 'peak' ? 25 : phase === 'build' ? 20 : 15
    return {
      type: 'quality',
      workout: `Tempo ${tempoMin} min`,
      detail: `Warm up 10 min easy. Then ${tempoMin} min steady at ${z3} ("comfortably hard"). Cool down 5 min.`,
      zone: `${easyMi + 0.5} mi · ${z3}`,
      route: 'Flat road or path',
      time: `${15 + tempoMin + 5} min`,
    }
  }

  // role === 'quality' — interval session
  const proto = qualityIntervalForDistance(dist, phase, P)
  return {
    type: 'quality',
    workout: proto.label,
    detail: proto.detail,
    zone: `${easyMi + 1} mi · ${z4}`,
    route: 'Track or flat road',
    time: `${proto.minutes} min`,
  }
}

function qualityIntervalForDistance(dist: RaceDistance, phase: string, P: RunLevelParams): { label: string; detail: string; minutes: number } {
  // Effort selection scales with race distance + phase
  const harder = phase !== 'base' && P.qualityIntensity !== 'gentle'
  if (dist.category === '5k' || dist.category === '10k') {
    const reps = phase === 'peak' ? 6 : 4
    return {
      label: `${reps} × 800 m repeats`,
      detail: `${reps} × 800 m at ${dist.category === '5k' ? '5K' : '10K'} effort, 2 min jog recovery. Sharpens VO2max.`,
      minutes: 15 + reps * 5 + 5,
    }
  }
  if (dist.category === 'half' || dist.category === 'marathon') {
    const reps = phase === 'peak' ? 5 : 3
    return {
      label: `${reps} × 1 km cruise intervals`,
      detail: `${reps} × 1 km at ${dist.category === 'half' ? 'half-marathon' : 'marathon'} effort, 90 sec jog recovery. Builds threshold endurance.`,
      minutes: 15 + reps * 7 + 5,
    }
  }
  // ultra
  return {
    label: harder ? 'Hill repeats' : 'Tempo on rolling terrain',
    detail: harder ? '6 × 90 sec uphill at hard effort, jog down recovery. Hill power for ultra terrain.' : '20–30 min steady on rolling terrain. Practice climbing rhythm.',
    minutes: 50,
  }
}

function buildLongRun(
  longMi: number,
  phase: string,
  isRecovery: boolean,
  dist: RaceDistance,
  _P: RunLevelParams,
  z1: string, z2: string, z3: string,
): Omit<PlannedDay, 'day'> {
  if (isRecovery) {
    return {
      type: 'long',
      workout: 'Easy long run',
      detail: 'Recovery week. Shorter and easier than usual. Conversational throughout.',
      zone: `${longMi} mi · ${z1}–${z2}`,
      route: dist.isTrail ? 'Mellow trail' : 'Flat route',
      time: `${Math.round(longMi * 11)} min`,
    }
  }
  if (phase === 'taper') {
    return {
      type: 'long',
      workout: 'Shakeout long run',
      detail: 'Final long run before race. Easy effort. Trust your fitness.',
      zone: `${longMi} mi · ${z2}`,
      route: dist.isTrail ? 'Easy trail' : 'Flat road',
      time: `${Math.round(longMi * 11)} min`,
    }
  }
  if (phase === 'peak') {
    if (dist.category === 'ultra') {
      return {
        type: 'long',
        workout: 'LONG — back-to-back day 1',
        detail: `${longMi} mi on terrain similar to race. Practice nutrition every 30 min, gear, pacing. Tomorrow: easy 4–6 mi.`,
        zone: `${longMi} mi · ${z2}`,
        route: 'Trail w/ climbs', time: `${Math.round(longMi * 12)} min`,
      }
    }
    if (dist.category === 'marathon' || dist.category === 'half') {
      return {
        type: 'long',
        workout: 'Long run w/ race-pace finish',
        detail: `${Math.round(longMi * 0.7)} mi easy + ${Math.round(longMi * 0.3)} mi at ${dist.category === 'half' ? 'half-marathon' : 'marathon'} pace. Practice the late-race close.`,
        zone: `${longMi} mi · ${z2}–${z3}`,
        route: dist.isTrail ? 'Trail or rolling road' : 'Flat road',
        time: `${Math.round(longMi * 10)} min`,
      }
    }
    return {
      type: 'long',
      workout: 'Long run — sustained effort',
      detail: `${longMi} mi steady, fluid throughout. Race-specific endurance.`,
      zone: `${longMi} mi · ${z2}`,
      route: dist.isTrail ? 'Trail w/ rolling terrain' : 'Flat road',
      time: `${Math.round(longMi * 10)} min`,
    }
  }
  if (phase === 'build') {
    return {
      type: 'long',
      workout: dist.isTrail ? 'Long trail run' : 'Long run',
      detail: `${longMi} mi conversational. ${dist.isTrail ? 'Practice climbing + descent technique.' : 'Build the engine.'} Eat something at mile ${Math.max(3, Math.round(longMi / 3))}.`,
      zone: `${longMi} mi · ${z2}`,
      route: dist.isTrail ? 'Trail w/ climbs' : 'Flat or rolling road',
      time: `${Math.round(longMi * 11)} min`,
    }
  }
  // base
  return {
    type: 'long',
    workout: 'Long run',
    detail: 'Long aerobic run. Conversational pace throughout. Build endurance gradually.',
    zone: `${longMi} mi · ${z2}`,
    route: dist.isTrail ? 'Mellow trail' : 'Flat route',
    time: `${Math.round(longMi * 11)} min`,
  }
}

function buildRaceInfo(config: OnboardingConfig, dist: RaceDistance, raceDate: string) {
  const trail = dist.isTrail
  return {
    name: config.raceName,
    date: raceDate,
    startTime: 'TBD',
    distance: dist.label,
    distanceMiles: dist.miles,
    elevation: trail ? 'Hilly / variable' : 'Flat to rolling',
    elevationRange: 'N/A',
    course: trail ? 'Trail course — verify the official course profile' : 'Road course — verify the official course profile',
    cutoff: 'See race website',
    landmarks: [
      { segment: 'First third', description: 'Start controlled. Easier than feels right. Get into rhythm.' },
      { segment: 'Middle third', description: 'Settle into goal effort. Manage nutrition + hydration on schedule.' },
      { segment: 'Final third', description: 'This is what training prepared you for. Hold form, push the close.' },
    ],
    gear: trail
      ? [
        { item: 'Trail shoes (aggressive tread)', required: true },
        { item: 'Hydration vest or belt', required: true },
        { item: 'Tested nutrition (gels/chews)', required: true },
        { item: 'Trekking poles (for steep climbs)', required: false },
        { item: 'Sun protection', required: true },
      ]
      : [
        { item: 'Road race shoes', required: true },
        { item: 'Tested nutrition (gels/chews)', required: dist.miles >= 13 },
        { item: 'Hydration plan', required: true },
        { item: 'Race-day kit (tested in training)', required: true },
      ],
    nutrition: dist.miles >= 13
      ? '~100 cal every 30 min once you start running. Sip water consistently. Only fuels tested in training.'
      : 'Light meal 2-3 hours before. Sip water. Most races under 10K need only race-day energy, not in-race fueling.',
  }
}

// ─── General Fitness Plan Generator ────────────────────────────────────

interface GeneralLevelParams {
  totalWeeks: number
  runMi: number
  longMi: number
  recoveryWeeks: number[]
  strengthDetail: string
}

function getGeneralLevelParams(level: ExperienceLevel): GeneralLevelParams {
  switch (level) {
    case 'first_timer': return {
      totalWeeks: 12, runMi: 1.5, longMi: 2.5, recoveryWeeks: [4, 8, 12],
      strengthDetail: 'BW squats 2×10 · Glute bridges 2×12 · Push-ups (knees ok) 2×8 · Plank 2×20s · Bird dogs 2×8/side',
    }
    case 'beginner': return {
      totalWeeks: 12, runMi: 2.0, longMi: 3.5, recoveryWeeks: [4, 8, 12],
      strengthDetail: 'Goblet squats 3×12 · BW lunges 3×8/leg · Push-ups 3×10 · Plank 3×30s · Glute bridges 3×12',
    }
    case 'intermediate': return {
      totalWeeks: 12, runMi: 3.0, longMi: 5.0, recoveryWeeks: [4, 8, 12],
      strengthDetail: 'Goblet squats 3×12 · DB lunges 3×10/leg · DB rows 3×10 · Push-ups 3×12 · Plank 3×45s',
    }
    case 'advanced': return {
      totalWeeks: 12, runMi: 4.0, longMi: 6.0, recoveryWeeks: [4, 8, 12],
      strengthDetail: 'BB back squat 3×8 · BB deadlift 3×6 · Pull-ups 3×6 · DB press 3×8 · Plank 3×60s',
    }
    case 'elite': return {
      totalWeeks: 12, runMi: 5.0, longMi: 7.0, recoveryWeeks: [4, 8, 12],
      strengthDetail: 'BB back squat 4×6 · BB deadlift 3×5 · Weighted pull-ups 3×6 · Bench press 3×6 · Plank 3×60s',
    }
  }
}

export function generateGeneralPlan(config: OnboardingConfig): TrainingPlan {
  const maxHR = config.maxHR || (220 - config.age)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z3 = `Z3 (${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)})`

  const P = getGeneralLevelParams(config.experienceLevel)
  const totalWeeks = P.totalWeeks
  const startDate = config.raceDate || addDays(new Date().toISOString().slice(0, 10), totalWeeks * 7)
  const longRunDayNum = config.longRunDay && DAY_NAME_TO_NUM[config.longRunDay.toLowerCase()] !== undefined
    ? DAY_NAME_TO_NUM[config.longRunDay.toLowerCase()]
    : 6
  const daysPerWeek = config.trainingDaysPerWeek
  const trainingDayNumbers = getRunTrainingDayNumbers(daysPerWeek, longRunDayNum)

  const weeks: TrainingWeek[] = []
  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = getWeekStart(startDate, totalWeeks - w)
    const isRecovery = P.recoveryWeeks.includes(weekNum)
    const progress = Math.min(1, weekNum / (totalWeeks - 2))
    const longMi = +(P.longMi * (0.7 + 0.3 * progress) * (isRecovery ? 0.6 : 1)).toFixed(1)
    const easyMi = +(P.runMi * (0.85 + 0.15 * progress)).toFixed(1)

    const days: PlannedDay[] = []
    let nonLongIdx = 0
    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      const dayLabel = formatDay(dateStr)
      const dow = new Date(dateStr + 'T12:00:00').getDay()

      if (!trainingDayNumbers.includes(dow)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }

      if (dow === longRunDayNum) {
        days.push({
          day: dayLabel,
          type: 'long',
          workout: isRecovery ? 'Easy long session' : 'Long session',
          detail: isRecovery ? 'Recovery week — keep it short and easy.' : 'Pick the activity you enjoy: long run, hike, or bike. Build endurance the fun way.',
          zone: `${longMi} mi · ${z2}`,
          route: 'Your favorite long route',
          time: `${Math.round(longMi * 12)} min`,
        })
        continue
      }

      const role = pickGeneralRole(nonLongIdx, daysPerWeek)
      nonLongIdx++
      if (role === 'strength') {
        days.push({ day: dayLabel, type: 'strength', workout: 'Full-body strength', detail: P.strengthDetail, zone: z1, route: 'Gym or home', time: '40 min' })
      } else if (role === 'tempo') {
        days.push({ day: dayLabel, type: 'quality', workout: 'Tempo or intervals', detail: '10 min easy warm-up · 4×3 min steady at "comfortably hard" with 2 min easy between · 5 min cool-down.', zone: `${easyMi + 0.3} mi · ${z3}`, route: 'Flat road or path', time: '35 min' })
      } else if (role === 'cross') {
        days.push({ day: dayLabel, type: 'cross', workout: 'Cross-train', detail: 'Bike, swim, hike, or row. Easy-to-moderate effort. Variety keeps the engine fresh.', zone: z2, route: 'Your choice', time: '45 min' })
      } else {
        days.push({ day: dayLabel, type: 'run', workout: 'Easy run', detail: 'Conversational pace. Build aerobic base.', zone: `${easyMi} mi · ${z2}`, route: 'Flat or rolling', time: `${Math.round(easyMi * 12)} min` })
      }
    }

    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: `~${Math.round(easyMi * (daysPerWeek - 1) + longMi)}`,
      focus: isRecovery ? 'RECOVERY WEEK. Lower volume, absorb the work.' : weekNum <= totalWeeks / 3 ? 'Build the aerobic base. Mostly easy with one quality session.' : weekNum <= (2 * totalWeeks) / 3 ? 'Add intensity. Strength + tempo + long.' : 'Peak general fitness block. Push then recover.',
      days,
    })
  }

  return {
    athlete: {
      name: config.athleteName,
      maxHR,
      ftpWatts: config.ftpWatts,
      currentBase: `${config.experienceLevel} · ${daysPerWeek} days/wk · general fitness`,
      weeklyStructure: `${daysPerWeek} sessions · running + strength + cross-training`,
    },
    zones,
    race: {
      name: config.raceName || 'General Fitness Block',
      date: startDate,
      startTime: '—',
      distance: 'General fitness',
      distanceMiles: 0,
      elevation: '—',
      elevationRange: '—',
      course: '—',
      cutoff: '—',
      landmarks: [
        { segment: 'Weeks 1–4', description: 'Build the base. Mostly easy aerobic. Habit first, intensity second.' },
        { segment: 'Weeks 5–8', description: 'Add intensity. Tempo + strength gain traction.' },
        { segment: 'Weeks 9–12', description: 'Peak general fitness. Push, recover, repeat.' },
      ],
      gear: [
        { item: 'Running shoes', required: true },
        { item: 'Heart rate monitor (chest strap or watch)', required: false },
        { item: 'Strength gear (DBs, KB, or bodyweight)', required: false },
      ],
      nutrition: 'Eat balanced meals around training. Hydrate consistently. Recovery is built in the kitchen.',
    },
    weeks,
  }
}

function pickGeneralRole(idx: number, daysPerWeek: number): 'easy' | 'tempo' | 'strength' | 'cross' {
  if (daysPerWeek <= 3) return idx === 0 ? 'easy' : 'strength'
  if (daysPerWeek === 4) return idx === 0 ? 'easy' : idx === 1 ? 'strength' : 'tempo'
  if (daysPerWeek === 5) return idx === 0 ? 'easy' : idx === 1 ? 'strength' : idx === 2 ? 'tempo' : 'cross'
  // 6 days
  return idx === 0 ? 'easy' : idx === 1 ? 'strength' : idx === 2 ? 'tempo' : idx === 3 ? 'easy' : 'cross'
}
