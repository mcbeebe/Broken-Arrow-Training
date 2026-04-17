import type { RaceInfo, TrainingWeek, PerformanceMetrics } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'

interface NarrativeInput {
  race: RaceInfo
  weekNum: number
  totalWeeks: number
  weeks: TrainingWeek[]
  compliance?: WeekCompliance[]
  perf?: PerformanceMetrics | null
}

export function generateRaceNarrative(input: NarrativeInput): { title: string; paragraphs: string[] } {
  const { race, weekNum, totalWeeks, weeks, compliance, perf } = input
  const weeksToRace = totalWeeks - weekNum
  const raceDistMi = race.distanceMiles || 0
  const paragraphs: string[] = []

  // ── Phase-specific narrative ──────────────────────────────
  const phase = getPhase(weekNum, totalWeeks)
  paragraphs.push(getPhaseNarrative(phase, race, weekNum, weeksToRace))

  // ── What the training is building ────────────────────────
  paragraphs.push(getTrainingPurpose(phase, race, weeks, weekNum))

  // ── Progress assessment ──────────────────────────────────
  const progressParagraph = getProgressNarrative(compliance, perf, weekNum, raceDistMi, race)
  if (progressParagraph) paragraphs.push(progressParagraph)

  // ── What to focus on this week ───────────────────────────
  const thisWeek = weeks[weekNum - 1]
  if (thisWeek) {
    paragraphs.push(getWeekFocus(phase, thisWeek, race, weeksToRace))
  }

  const title = weeksToRace === 0 ? 'Race Week' :
                weeksToRace === 1 ? 'Final Prep' :
                `${weeksToRace} Weeks to Race Day`

  return { title, paragraphs }
}

type Phase = 'base' | 'build' | 'peak' | 'taper' | 'race'

function getPhase(weekNum: number, totalWeeks: number): Phase {
  const remaining = totalWeeks - weekNum
  if (remaining === 0) return 'race'
  if (remaining === 1) return 'taper'
  if (remaining === 2) return 'peak'
  if (weekNum <= Math.floor(totalWeeks * 0.3)) return 'base'
  return 'build'
}

function getPhaseNarrative(phase: Phase, race: RaceInfo, _weekNum: number, weeksToRace: number): string {
  const raceName = race.name || 'race day'
  const elevation = race.elevation || ''
  const dist = race.distance || ''

  switch (phase) {
    case 'base':
      return `You're in the base-building phase of your ${raceName} preparation. These early weeks are about establishing aerobic fitness and getting your body used to consistent training. The ${dist} course with ${elevation} of climbing demands a strong aerobic engine — that's what we're building right now. Don't worry about speed yet. Every easy mile is building the foundation that race day depends on.`

    case 'build':
      return `You're in the build phase with ${weeksToRace} weeks until ${raceName}. This is where the training gets race-specific — more vertical gain, longer efforts, and quality sessions that teach your body to handle sustained climbing. The course gains ${elevation} across ${dist}, so the hill work you're doing now is directly preparing your legs and lungs for race day. The work is getting harder because the race demands it.`

    case 'peak':
      return `This is your peak week — the biggest training load of the plan. After this, volume drops as your body absorbs the fitness you've built. It might feel hard, and that's by design. The fatigue you feel now will convert to strength over the next two weeks. Trust the process: the hay is almost in the barn.`

    case 'taper':
      return `You're in the taper — the final week of reduced volume before ${raceName}. This is NOT the time to squeeze in extra training. Your body is absorbing 9 weeks of work and converting fatigue into race fitness. You might feel restless or doubt your preparation — that's normal and actually a sign the taper is working. Every easy session this week is strategic recovery.`

    case 'race':
      return `This is race week. ${raceName} is here. The training is done — nothing you do this week makes you fitter, but you can absolutely hurt your race by overdoing it. Keep everything easy and short. Focus on sleep, hydration, and logistics. Your only job is to arrive at the start line rested, fueled, and ready.`
  }
}

function getTrainingPurpose(phase: Phase, race: RaceInfo, weeks: TrainingWeek[], weekNum: number): string {
  const elevRange = race.elevationRange || ''
  const course = race.course || ''
  void race.landmarks

  if (phase === 'race' || phase === 'taper') {
    const gearList = race.gear?.filter(g => g.required).map(g => g.item).join(', ') || ''
    const nutrition = race.nutrition || ''
    return `Course reminder: ${course}${elevRange ? ` Elevation range: ${elevRange}.` : ''} ${nutrition ? `Nutrition plan: ${nutrition}.` : ''} ${gearList ? `Required gear: ${gearList}.` : ''}`
  }

  const totalPlannedMiles = weeks.slice(0, weekNum).reduce((sum, w) => {
    const mi = typeof w.miles === 'number' ? w.miles : parseFloat(String(w.miles)) || 0
    return sum + mi
  }, 0)

  const totalPlannedElevation = weeks.slice(0, weekNum).reduce((sum, w) => {
    let weekElev = 0
    for (const d of w.days) {
      const match = d.detail?.match(/~?([\d,]+)\s*ft\s*gain/i)
      if (match) weekElev += parseInt(match[1].replace(',', ''))
    }
    return sum + weekElev
  }, 0)

  if (phase === 'base') {
    return `Your plan builds progressively: easy runs establish aerobic capacity, cross-training builds durability, and strength work protects against the pounding of ${race.elevation || 'significant'} descending. By race day you'll have accumulated roughly ${Math.round(totalPlannedMiles + sumRemainingMiles(weeks, weekNum))} miles of training across ${weeks.length} weeks, with increasing vertical each week to prepare for the course's ${race.elevation || 'elevation'}.`
  }

  return `Through Week ${weekNum}, your plan has built ${Math.round(totalPlannedMiles)} miles and approximately ${totalPlannedElevation.toLocaleString()} feet of elevation gain. The long runs and hill repeats are teaching your legs to climb efficiently at altitude${elevRange ? ` (${elevRange})` : ''}. The quality sessions build the muscular endurance needed to keep moving when the course tilts up.`
}

function getProgressNarrative(
  compliance: WeekCompliance[] | undefined,
  perf: PerformanceMetrics | null | undefined,
  weekNum: number,
  _raceDistMi: number,
  race: RaceInfo,
): string | null {
  if (!compliance || compliance.length === 0) return null

  const completedWeeks = compliance.filter(w => w.weekNum <= weekNum)
  if (completedWeeks.length === 0) return null

  const totalCompleted = completedWeeks.reduce((s, w) => s + w.completed, 0)
  const totalWorkouts = completedWeeks.reduce((s, w) => s + w.totalWorkouts, 0)
  const completionRate = totalWorkouts > 0 ? Math.round((totalCompleted / totalWorkouts) * 100) : 0
  const totalActualMiles = completedWeeks.reduce((s, w) => s + w.actualMiles, 0)
  const totalPlannedMiles = completedWeeks.reduce((s, w) => s + w.plannedMiles, 0)
  const distPct = totalPlannedMiles > 0 ? Math.round((totalActualMiles / totalPlannedMiles) * 100) : 0
  const totalActualElev = completedWeeks.reduce((s, w) => s + w.actualElevation, 0)
  const avgHrCompliance = completedWeeks.filter(w => w.hrCheckedWorkouts > 0).length > 0
    ? Math.round(completedWeeks.reduce((s, w) => s + w.hrCompliance, 0) / completedWeeks.filter(w => w.hrCheckedWorkouts > 0).length)
    : null

  const parts: string[] = []

  // Overall completion
  if (completionRate >= 90) {
    parts.push(`You're tracking well — ${completionRate}% workout completion rate through Week ${weekNum}.`)
  } else if (completionRate >= 75) {
    parts.push(`You've completed ${completionRate}% of planned workouts through Week ${weekNum}. That's solid — consistency matters more than perfection.`)
  } else {
    parts.push(`You've completed ${completionRate}% of planned workouts so far. Life happens, but try to prioritize the long runs and quality sessions — those are the ones that build race-specific fitness.`)
  }

  // Distance
  parts.push(`You've logged ${totalActualMiles.toFixed(1)} of ${totalPlannedMiles.toFixed(1)} planned miles (${distPct}%).`)

  // Elevation
  if (totalActualElev > 0) {
    parts.push(`You've accumulated ${Math.round(totalActualElev).toLocaleString()} feet of climbing — ${race.elevation ? `the race itself has ${race.elevation}, so you're building the vert tolerance you'll need` : 'building the vertical endurance for race day'}.`)
  }

  // HR zone discipline
  if (avgHrCompliance !== null) {
    if (avgHrCompliance >= 75) {
      parts.push(`HR zone discipline is strong at ${avgHrCompliance}% time in target zones — this means your easy days are actually easy and your body is recovering properly between hard efforts.`)
    } else if (avgHrCompliance >= 50) {
      parts.push(`HR zone compliance is at ${avgHrCompliance}%. Watch your effort on easy days — running too hard on recovery runs erodes the training benefit of your quality sessions.`)
    } else {
      parts.push(`HR zone compliance needs attention (${avgHrCompliance}%). Easy days should feel genuinely easy. If you can't hold a conversation, you're going too hard.`)
    }
  }

  // Fitness trend
  if (perf) {
    const ctl = perf.ctl
    if (ctl > 0) {
      parts.push(`Your fitness (CTL) is at ${Math.round(ctl)} — ${ctl > 50 ? 'well-built for the demands ahead' : ctl > 30 ? 'building steadily' : 'still developing, which is normal at this stage'}.`)
    }
  }

  return parts.join(' ')
}

function getWeekFocus(phase: Phase, week: TrainingWeek, _race: RaceInfo, _weeksToRace: number): string {
  const focus = week.focus || ''

  if (phase === 'race') {
    return `This week: ${focus}. Keep every session short and easy. Lay out your gear, review the course landmarks, and practice your nutrition plan one more time. Visualize the course — you know every climb and descent. You're ready.`
  }

  if (phase === 'taper') {
    return `This week: ${focus}. Volume is intentionally low. You'll do short, easy runs with a few strides to keep your legs feeling sharp. Don't add extra — the fitness is banked. Sleep 8+ hours, hydrate well, and eat clean. Next week you race.`
  }

  const longRun = week.days.find(d => d.type === 'long')
  const qualityDay = week.days.find(d => d.type === 'quality')
  const parts = [`This week (${focus}):`]

  if (longRun) {
    parts.push(`The long run is your most important session — ${longRun.workout.toLowerCase().includes('pole') ? 'with poles to practice race-day technique' : 'building the endurance base for race distance'}.`)
  }
  if (qualityDay) {
    parts.push(`The quality session (${qualityDay.workout}) builds race-specific fitness${qualityDay.detail?.includes('hill') || qualityDay.detail?.includes('uphill') ? ' — the hill work directly prepares you for the course' : ''}.`)
  }
  if (!longRun && !qualityDay) {
    parts.push('Focus on consistency and recovery this week.')
  }

  return parts.join(' ')
}

function sumRemainingMiles(weeks: TrainingWeek[], fromWeek: number): number {
  return weeks.slice(fromWeek).reduce((sum, w) => {
    const mi = typeof w.miles === 'number' ? w.miles : parseFloat(String(w.miles)) || 0
    return sum + mi
  }, 0)
}
