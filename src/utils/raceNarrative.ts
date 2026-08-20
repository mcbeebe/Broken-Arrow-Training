import type { RaceInfo, TrainingWeek, PerformanceMetrics, Season } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { raceDateToIso } from '../engines/season'
import { isHyroxRaceInfo } from '../engines/season/planSeason'
import { todayDateString } from './planDates'
import { hasRealVert } from './todayNarrative'

interface NarrativeInput {
  race: RaceInfo
  weekNum: number
  totalWeeks: number
  weeks: TrainingWeek[]
  compliance?: WeekCompliance[]
  perf?: PerformanceMetrics | null
  /** Full season — when the athlete has more races than the anchor, the
   *  narrative names the main goal and frames this race's place in the
   *  chain instead of pretending the season is one race. */
  season?: Season | null
  /** Injectable "today" (ISO) for deterministic tests; defaults to now. */
  todayIso?: string
}

export function generateRaceNarrative(input: NarrativeInput): { title: string; paragraphs: string[] } {
  const { race, weekNum, totalWeeks, weeks, compliance, perf, season, todayIso } = input
  const weeksToRace = totalWeeks - weekNum
  const paragraphs: string[] = []

  const phase = getPhase(weekNum, totalWeeks)
  paragraphs.push(getPhaseNarrative(phase, race, weeksToRace))

  const seasonParagraph = getSeasonNarrative(season, race, todayIso ?? todayDateString())
  if (seasonParagraph) paragraphs.push(seasonParagraph)

  paragraphs.push(getTrainingPurpose(phase, race, weeks, weekNum))

  const progressParagraph = getProgressNarrative(compliance, perf, weekNum, race)
  if (progressParagraph) paragraphs.push(progressParagraph)

  const thisWeek = weeks[weekNum - 1]
  if (thisWeek) {
    paragraphs.push(getWeekFocus(phase, thisWeek))
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

function getPhaseNarrative(phase: Phase, race: RaceInfo, weeksToRace: number): string {
  const raceName = race.name || 'race day'
  const elevation = race.elevation || ''
  const dist = race.distance || ''

  switch (phase) {
    case 'base':
      return `You're in the base-building phase of your ${raceName} preparation. These early weeks are about establishing aerobic fitness and getting your body used to consistent training. The ${dist || 'race'} course${elevation && hasRealVert(race) ? ` with ${elevation} of climbing` : ''} demands a strong aerobic engine — that's what we're building right now. Don't worry about speed yet. Every easy mile is building the foundation that race day depends on.`
    case 'build':
      return `You're in the build phase with ${weeksToRace} weeks until ${raceName}. This is where the training gets race-specific — longer efforts and quality sessions that teach your body to hold race effort. ${elevation ? `The course gains ${elevation} across ${dist || 'the distance'}, so the hill work you're doing now is directly preparing your legs and lungs for race day.` : 'The long efforts and quality sessions you\'re doing now are directly preparing your legs and lungs for race day.'}`
    case 'peak':
      return `This is your peak week — the biggest training load of the plan. After this, volume drops as your body absorbs the fitness you've built. It might feel hard, and that's by design. The fatigue you feel now will convert to strength over the next two weeks. Trust the process: the hay is almost in the barn.`
    case 'taper':
      return `You're in the taper — the final week of reduced volume before ${raceName}. This is NOT the time to squeeze in extra training. Your body is absorbing 9 weeks of work and converting fatigue into race fitness. You might feel restless or doubt your preparation — that's normal and actually a sign the taper is working. Every easy session this week is strategic recovery.`
    case 'race':
      return `This is race week. ${raceName} is here. The training is done — nothing you do this week makes you fitter, but you can absolutely hurt your race by overdoing it. Keep everything easy and short. Focus on sleep, hydration, and logistics. Your only job is to arrive at the start line rested, fueled, and ready.`
  }
}

/** Multi-race seasons: name the ★ main goal with a countdown and frame the
 *  displayed race's role in the chain. Null for single-race athletes (or
 *  unparseable dates) — their narrative is complete without it. */
function getSeasonNarrative(season: Season | null | undefined, race: RaceInfo, todayIso: string): string | null {
  if (!season) return null
  const dated = season.races
    .map(r => ({ r, iso: raceDateToIso(r.raceInfo.date) }))
    .filter((x): x is { r: (typeof season.races)[number]; iso: string } => x.iso !== null)
    .sort((a, b) => a.iso.localeCompare(b.iso))
  if (dated.length < 2) return null

  const primary = dated.find(x => x.r.isPrimary) ?? dated[dated.length - 1]
  const primaryName = primary.r.raceInfo.name
  const displayedIsPrimary = primaryName === race.name
  const daysOut = Math.max(0, Math.round(
    (Date.parse(`${primary.iso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86_400_000,
  ))
  const primaryDate = new Date(`${primary.iso}T12:00:00`)
    .toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  if (displayedIsPrimary) {
    const others = dated.filter(x => x.r.raceInfo.name !== primaryName)
    const trainedThrough = others.filter(x => x.r.priority === 'C').length
    return `${primaryName} is your main goal this season — ${daysOut} days out on ${primaryDate}. The other ${others.length === 1 ? 'race is a stepping stone' : `${others.length} races are stepping stones`} on the way${trainedThrough > 0 ? ', some raced on training legs by design' : ''}: each one banks fitness and race practice that this block converts into your best performance.`
  }

  const primaryIsHyrox = isHyroxRaceInfo(primary.r.raceInfo)
  return `This block builds toward ${race.name || 'this race'}, but it's one stop in a ${dated.length}-race season. Your main goal is ${primaryName} on ${primaryDate} — ${daysOut} days out. ${race.name || 'This race'} does double duty: the aerobic engine you're building carries straight into the ${primaryName} block${primaryIsHyrox ? ' — Hyrox is 8×1km of compromised running, and that race is won on the base you\'re laying now' : ''}. After race day you'll recover briefly, then the plan pivots to ${primaryName}-specific work.`
}

function getTrainingPurpose(phase: Phase, race: RaceInfo, weeks: TrainingWeek[], weekNum: number): string {
  const elevRange = race.elevationRange || ''
  const course = race.course || ''

  if (phase === 'race' || phase === 'taper') {
    const gearList = race.gear?.filter(g => g.required).map(g => g.item).join(', ') || ''
    const nutrition = race.nutrition || ''
    return `Course reminder: ${course}${elevRange ? ` Elevation range: ${elevRange}.` : ''} ${nutrition ? `Nutrition plan: ${nutrition}.` : ''} ${gearList ? `Required gear: ${gearList}.` : ''}`
  }

  const totalPlanMiles = weeks.reduce((sum, w) => {
    const mi = typeof w.miles === 'number' ? w.miles : parseFloat(String(w.miles)) || 0
    return sum + mi
  }, 0)

  if (phase === 'base') {
    // Flat and indoor courses get flat-course copy. Telling a Hyrox
    // athlete their strength work "protects against the pounding of Flat
    // (indoor) descending" is a template talking over the athlete's
    // actual race.
    if (!hasRealVert(race)) {
      return `Your plan builds progressively: easy runs establish aerobic capacity, cross-training builds durability, and strength work keeps you resilient under repeated load. By race day you'll have accumulated roughly ${Math.round(totalPlanMiles)} miles of training across ${weeks.length} weeks, with the race-specific work growing as race day gets closer.`
    }
    return `Your plan builds progressively: easy runs establish aerobic capacity, cross-training builds durability, and strength work protects against the pounding of ${race.elevation || 'significant'} descending. By race day you'll have accumulated roughly ${Math.round(totalPlanMiles)} miles of training across ${weeks.length} weeks, with increasing vertical each week to prepare for the course's ${race.elevation || 'elevation'}.`
  }

  const milesThrough = weeks.slice(0, weekNum).reduce((sum, w) => {
    const mi = typeof w.miles === 'number' ? w.miles : parseFloat(String(w.miles)) || 0
    return sum + mi
  }, 0)

  if (!hasRealVert(race)) {
    return `Through Week ${weekNum}, your plan has programmed ${Math.round(milesThrough)} miles. The long runs are teaching your legs to hold pace deep into the distance, and the quality sessions build the muscular endurance to keep moving when the effort stops feeling comfortable.`
  }
  return `Through Week ${weekNum}, your plan has programmed ${Math.round(milesThrough)} miles with increasing vertical each week. The long runs and hill repeats are teaching your legs to climb efficiently at altitude${elevRange ? ` (${elevRange})` : ''}. The quality sessions build the muscular endurance needed to keep moving when the course tilts up.`
}

function getProgressNarrative(
  compliance: WeekCompliance[] | undefined,
  perf: PerformanceMetrics | null | undefined,
  weekNum: number,
  race: RaceInfo,
): string | null {
  if (!compliance || compliance.length === 0) return null

  // Separate completed weeks from the current (in-progress) week
  const completedWeeks = compliance.filter(w => w.weekNum < weekNum)
  const currentWeek = compliance.find(w => w.weekNum === weekNum)
  const allWeeks = compliance.filter(w => w.weekNum <= weekNum)

  if (allWeeks.length === 0) return null

  // Use all weeks for elevation totals
  const totalActualElev = allWeeks.reduce((s, w) => s + w.actualElevation, 0)

  // For completion rate, use completed weeks only (current week is in progress)
  const parts: string[] = []

  if (completedWeeks.length > 0) {
    const pastCompleted = completedWeeks.reduce((s, w) => s + w.completed, 0)
    const pastTotal = completedWeeks.reduce((s, w) => s + w.totalWorkouts, 0)
    const pastRate = pastTotal > 0 ? Math.round((pastCompleted / pastTotal) * 100) : 0
    const pastPlannedMiles = completedWeeks.reduce((s, w) => s + w.plannedMiles, 0)
    const pastActualMiles = completedWeeks.reduce((s, w) => s + w.actualMiles, 0)

    if (pastRate >= 90) {
      parts.push(`Strong consistency — ${pastRate}% completion through ${completedWeeks.length === 1 ? 'Week ' + completedWeeks[0].weekNum : 'Weeks 1–' + completedWeeks[completedWeeks.length - 1].weekNum} with ${pastActualMiles.toFixed(1)} of ${pastPlannedMiles.toFixed(1)} planned miles logged.`)
    } else if (pastRate >= 75) {
      parts.push(`Solid progress — ${pastRate}% completion through ${completedWeeks.length === 1 ? 'Week ' + completedWeeks[0].weekNum : completedWeeks.length + ' weeks'}, ${pastActualMiles.toFixed(1)} of ${pastPlannedMiles.toFixed(1)} miles. Consistency matters more than perfection.`)
    } else {
      parts.push(`You've completed ${pastRate}% of workouts through ${completedWeeks.length === 1 ? 'Week ' + completedWeeks[0].weekNum : completedWeeks.length + ' weeks'} (${pastActualMiles.toFixed(1)} of ${pastPlannedMiles.toFixed(1)} miles). Prioritize the long runs and quality sessions — those build race-specific fitness.`)
    }
  }

  // Current week status
  if (currentWeek) {
    const cwCompleted = currentWeek.completed
    const cwTotal = currentWeek.totalWorkouts
    const cwMiles = currentWeek.actualMiles
    const cwPlanned = currentWeek.plannedMiles
    if (cwCompleted > 0 || cwMiles > 0) {
      parts.push(`This week so far: ${cwCompleted} of ${cwTotal} workouts done, ${cwMiles.toFixed(1)} of ${cwPlanned.toFixed(1)} miles.`)
    }
  }

  // Total elevation
  if (totalActualElev > 0) {
    parts.push(`Total elevation: ${Math.round(totalActualElev).toLocaleString()} feet of climbing${race.elevation ? ` (race has ${race.elevation})` : ''}.`)
  }

  // HR zone discipline (across all weeks with data)
  const hrWeeks = allWeeks.filter(w => w.hrCheckedWorkouts > 0)
  if (hrWeeks.length > 0) {
    const avgHr = Math.round(hrWeeks.reduce((s, w) => s + w.hrCompliance, 0) / hrWeeks.length)
    if (avgHr >= 75) {
      parts.push(`HR zone discipline is strong at ${avgHr}% — your easy days are actually easy, which maximizes recovery between hard efforts.`)
    } else if (avgHr >= 50) {
      parts.push(`HR zone compliance at ${avgHr}%. Watch your effort on easy days — running too hard on recovery runs limits the benefit of your quality sessions.`)
    } else {
      parts.push(`HR zone compliance needs attention (${avgHr}%). Easy days should feel genuinely easy — if you can't hold a conversation, slow down.`)
    }
  }

  // Fitness trend
  if (perf && perf.ctl > 0) {
    const ctl = Math.round(perf.ctl)
    parts.push(`Fitness (CTL): ${ctl} — ${ctl > 50 ? 'well-built for the demands ahead' : ctl > 30 ? 'building steadily' : 'developing, which is normal at this stage'}.`)
  }

  return parts.length > 0 ? parts.join(' ') : null
}

function getWeekFocus(phase: Phase, week: TrainingWeek): string {
  const focus = week.focus || ''

  if (phase === 'race') {
    return `This week: ${focus}. Keep every session short and easy. Lay out your gear, review the course landmarks, and practice your nutrition plan one more time. Visualize the course — you know every climb and descent. You're ready.`
  }

  if (phase === 'taper') {
    return `This week: ${focus}. Volume is intentionally low. Short, easy runs with a few strides to keep your legs sharp. Don't add extra — the fitness is banked. Sleep 8+ hours, hydrate well, and eat clean.`
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
