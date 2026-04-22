import type { TrainingPlan, TrainingWeek, PlannedDay, HRZone } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'

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
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${days[d.getDay()]} ${month}/${day}`
}

function getWeekStart(raceDate: string, weeksOut: number): string {
  return addDays(raceDate, -weeksOut * 7)
}

export function generateHyroxPlan(config: OnboardingConfig): TrainingPlan {
  const maxHR = config.maxHR || (220 - config.age)
  const zones = computeZones(maxHR)
  const z1 = `Z1 (${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)})`
  const z2 = `Z2 (${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)})`
  const z3 = `Z3 (${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)})`
  const z4 = `Z4 (${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)})`

  const raceDate = config.raceDate || addDays(new Date().toISOString().slice(0, 10), 84)
  const totalWeeks = 12
  const daysPerWeek = config.trainingDaysPerWeek

  const weeks: TrainingWeek[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1
    const weekStart = getWeekStart(raceDate, totalWeeks - w)
    const phase = weekNum <= 4 ? 'base' : weekNum <= 8 ? 'build' : weekNum <= 11 ? 'peak' : 'taper'
    const isRecovery = weekNum === 4 || weekNum === 8

    const days: PlannedDay[] = []

    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(weekStart, d)
      const dayLabel = formatDay(dateStr)
      const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()

      if (daysPerWeek <= 3 && ![1, 3, 6].includes(dayOfWeek)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }
      if (daysPerWeek === 4 && ![1, 3, 5, 6].includes(dayOfWeek)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }
      if (daysPerWeek === 5 && ![0, 4].includes(dayOfWeek)) {
        // train Mon-Wed, Fri, Sat
      } else if (daysPerWeek === 5 && [0, 4].includes(dayOfWeek)) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }
      if (daysPerWeek >= 6 && dayOfWeek === 0) {
        days.push({ day: dayLabel, type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' })
        continue
      }

      const workout = getHyroxWorkout(dayOfWeek, weekNum, phase, isRecovery, config, z1, z2, z3, z4)
      days.push({ day: dayLabel, ...workout })
    }

    const focus = phase === 'base' ? 'Build aerobic base + station familiarity'
      : phase === 'build' ? 'Race-specific station work + running intervals'
      : phase === 'peak' ? 'Full simulations + intensity'
      : 'Taper. Reduce volume, maintain sharpness.'

    weeks.push({
      num: weekNum,
      dates: `${formatDay(weekStart).slice(4)} – ${formatDay(addDays(weekStart, 6)).slice(4)}`,
      miles: isRecovery ? '~8' : phase === 'base' ? '~12' : '~15',
      focus: isRecovery ? 'RECOVERY WEEK. Reduce volume 40%.' : focus,
      days,
    })
  }

  return {
    athlete: {
      name: config.athleteName,
      maxHR,
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

function getHyroxWorkout(
  dayOfWeek: number,
  weekNum: number,
  phase: string,
  isRecovery: boolean,
  config: OnboardingConfig,
  z1: string, z2: string, z3: string, z4: string,
): Omit<PlannedDay, 'day'> {
  if (isRecovery) {
    if (dayOfWeek === 1 || dayOfWeek === 3) {
      return { type: 'run', workout: 'Easy run', detail: 'Recovery week. Very easy effort.', zone: `3.0 mi · ${z1}`, route: 'Flat route', time: '35 min' }
    }
    if (dayOfWeek === 6) {
      return { type: 'cross', workout: 'Light station practice', detail: 'Pick 3 stations · 50% effort · Focus on form not speed', zone: z1, route: 'Gym', time: '30 min' }
    }
    return { type: 'rest', workout: 'Rest', detail: 'Recovery week', zone: '—', route: '—', time: '—' }
  }

  // Monday: Running
  if (dayOfWeek === 1) {
    if (phase === 'base') {
      return { type: 'run', workout: 'Easy run', detail: 'Conversational pace. Build aerobic base.', zone: `3.0 mi · ${z2}`, route: 'Flat route', time: '35 min' }
    }
    if (phase === 'build') {
      return { type: 'quality', workout: '1km repeats', detail: `${weekNum <= 6 ? '4' : '6'}×1km @ race pace, 90 sec rest. Simulate Hyrox run legs.`, zone: `4.0 mi · ${z3}`, route: 'Track or flat', time: '45 min' }
    }
    return { type: 'quality', workout: 'Race-pace intervals', detail: '6×1km @ race pace, 60 sec rest. Practice pacing under fatigue.', zone: `5.0 mi · ${z3}–${z4}`, route: 'Track or flat', time: '50 min' }
  }

  // Tuesday: Strength / Functional
  if (dayOfWeek === 2) {
    if (phase === 'base') {
      return { type: 'strength', workout: 'STRENGTH: Full body', detail: 'Goblet squats 3×15 · DB lunges 3×12/leg · Push-ups 3×15 · Bent-over rows 3×12 · Plank 3×45s · Dead bugs 3×10/side', zone: z1, route: 'Gym', time: '50 min' }
    }
    return { type: 'strength', workout: 'STRENGTH: Hyrox-specific', detail: 'Wall balls 3×20 · Sled push practice 3×25m · Farmer carry 3×50m · Sandbag lunges 3×10/leg · Burpee broad jump 3×8 · Plank 3×60s', zone: z2, route: 'Gym', time: '1 hr' }
  }

  // Wednesday: Running + conditioning
  if (dayOfWeek === 3) {
    if (phase === 'base') {
      return { type: 'run', workout: 'Easy run + strides', detail: 'Z2 pace + 4×20 sec strides at the end.', zone: `3.5 mi · ${z2}`, route: 'Flat route', time: '40 min' }
    }
    return { type: 'run', workout: 'Tempo run', detail: `20 min @ ${z3}. Build lactate threshold for sustained Hyrox effort.`, zone: `4.0 mi · ${z3}`, route: 'Flat route', time: '45 min' }
  }

  // Thursday: Station-specific
  if (dayOfWeek === 4) {
    const weakStation = config.weakStation || 'Wall Balls'
    if (phase === 'base') {
      return { type: 'cross', workout: 'Station circuit (intro)', detail: `SkiErg 500m · Row 500m · Wall balls 50 · ${weakStation} practice · Rest 2 min between`, zone: z2, route: 'Gym', time: '45 min' }
    }
    if (phase === 'build') {
      return { type: 'cross', workout: 'Station circuit (race effort)', detail: `SkiErg 1000m · Sled push 50m · Row 1000m · Wall balls 75 · ${weakStation} extra set · 90 sec rest between`, zone: z3, route: 'Gym', time: '55 min' }
    }
    return { type: 'cross', workout: 'Mini simulation', detail: '4 stations at race effort + 4×1km runs between. Practice transitions.', zone: `${z3}–${z4}`, route: 'Gym', time: '1 hr 10 min' }
  }

  // Friday: easy / mobility
  if (dayOfWeek === 5) {
    return { type: 'run', workout: 'Easy run or cross-train', detail: 'Very easy. Active recovery. Bike, elliptical, or easy jog.', zone: `2.5 mi · ${z1}`, route: 'Any', time: '30 min' }
  }

  // Saturday: Long session
  if (dayOfWeek === 6) {
    if (phase === 'base') {
      return { type: 'long', workout: 'Long run', detail: 'Build endurance. Conversational pace throughout.', zone: `5.0 mi · ${z2}`, route: 'Any route', time: '55 min' }
    }
    if (phase === 'build') {
      return { type: 'long', workout: 'Long run + station finisher', detail: '5 mi run then 3 station circuits at moderate effort. Practice running on tired legs into stations.', zone: `6.0 mi · ${z2}`, route: 'Run + Gym', time: '1 hr 20 min' }
    }
    if (phase === 'peak') {
      return { type: 'long', workout: 'FULL HYROX SIMULATION', detail: '8×1km runs + all 8 stations at race effort. Full dress rehearsal.', zone: `8km + stations · ${z3}`, route: 'Gym', time: '1 hr 30 min' }
    }
    return { type: 'run', workout: 'Easy shakeout', detail: 'Taper. Short and easy. Stay sharp.', zone: `2.0 mi · ${z1}`, route: 'Flat route', time: '25 min' }
  }

  return { type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' }
}
