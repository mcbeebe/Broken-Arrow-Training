/**
 * Turn a stored imported plan into the `TrainingPlan` the rest of the app
 * reads (initiative 004).
 *
 * Every date is worked out here, never by the model: week 1 starts on the
 * config's pinned Monday and each week follows the one before. The day
 * strings use exactly the formats the app already parses (`utils/targets.ts`,
 * `utils/rezone.ts`, the day cards), so an uploaded day grades, rezones and
 * renders like a generated one:
 *
 *   zone   "6.0 mi · Z1–2 (128–148)"   distance, then the effort's HR band
 *   time   "45 min" | "1 hr 10 min"
 *   day    "Mon 10/12"
 *
 * The day's detail is the plan's own text and is marked `verbatimDetail`, so
 * rezoning never rewrites the heart rates the plan itself wrote.
 */
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { HRZone, PlannedDay, RaceInfo, TrainingPlan, TrainingWeek } from '../../types'
import { addDays, mondayOnOrBefore, todayDateString } from '../planDates'
import { dayLabel, weekDates } from '../../engines/season/blockWeeks'
import { computeMaxHR } from '../heartRate'
import { computeZones } from '../../engines/generalFitness'
import { buildRaceInfo, makeZonesContiguous } from '../../engines/planGenerator/generatePlan'
import { toNumericZones } from '../rezone'
import type { ImportedIntensity, ImportedPlanV1, ImportedSession, ImportedSessionType } from './types'

/** Tie-break between sessions carrying the same load: the harder type. */
const DAY_PRIORITY: Record<ImportedSessionType, number> = {
  race: 0, quality: 1, long: 2, run: 3, cross: 4, strength: 5, rest: 6,
}

/** Session types whose distance counts toward the week's running miles. */
const RUN_TYPES = new Set<ImportedSessionType>(['run', 'long', 'quality', 'race'])

/** The app zone band each stated effort reads as: [low zone, high zone]. A
 *  race-effort session gets no band; race day runs on feel. */
const INTENSITY_ZONES: Record<ImportedIntensity, [number, number] | null> = {
  recovery: [1, 1],
  easy: [1, 2],
  steady: [2, 3],
  tempo: [3, 3],
  interval: [4, 4],
  race: null,
}

/** "45 min", "1 hr", "1 hr 10 min". */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h} hr ${rem} min` : `${h} hr`
}

function zoneBand(intensity: ImportedIntensity | undefined, zones: HRZone[]): string | undefined {
  if (!intensity) return undefined
  const span = INTENSITY_ZONES[intensity]
  if (!span) return undefined
  const nz = toNumericZones(zones)
  const lo = nz.find(z => z.num === span[0])
  const hi = nz.find(z => z.num === span[1])
  if (!lo || !hi) return undefined
  const label = span[0] === span[1] ? `Z${span[0]}` : `Z${span[0]}–${span[1]}`
  return `${label} (${lo.low}–${hi.high})`
}

/** Sort order for a day's sessions: the one carrying the day's main load
 *  first. Running before anything else, then the longest, then the longest
 *  in time, then the harder type. */
function byLoad(a: ImportedSession, b: ImportedSession): number {
  const runA = RUN_TYPES.has(a.type) ? 0 : 1
  const runB = RUN_TYPES.has(b.type) ? 0 : 1
  if (runA !== runB) return runA - runB
  const distance = (b.distanceMi ?? 0) - (a.distanceMi ?? 0)
  if (distance !== 0) return distance
  const minutes = (b.durationMin ?? 0) - (a.durationMin ?? 0)
  if (minutes !== 0) return minutes
  return DAY_PRIORITY[a.type] - DAY_PRIORITY[b.type]
}

/** "3.0 mi, 30 min" — the amounts a session states, for the detail line. */
function amounts(s: ImportedSession): string {
  const parts: string[] = []
  if (s.distanceMi) parts.push(`${s.distanceMi.toFixed(1)} mi`)
  if (s.durationMin) parts.push(formatDuration(s.durationMin))
  return parts.join(', ')
}

/** One day's sessions as a single PlannedDay. The session carrying the day's
 *  main load leads, and the day's distance, time and heart-rate band are that
 *  session's alone: mixing in another session's numbers would put a 14-mile
 *  easy run on a strides session's heart rate. Any other session is listed in
 *  the detail with its own amounts. */
function plannedDayFor(label: string, sessions: ImportedSession[], zones: HRZone[]): PlannedDay {
  if (sessions.length === 0) {
    // Marked like every uploaded day, so a week of rest still reads as the
    // athlete's own plan wherever a single week is all there is to go on.
    return { day: label, type: 'rest', workout: 'Rest', detail: '—', zone: '—', route: '', time: '—', verbatimDetail: true }
  }
  const [lead, ...extras] = [...sessions].sort(byLoad)

  const zoneParts: string[] = []
  if (lead.distanceMi) zoneParts.push(`${lead.distanceMi.toFixed(1)} mi`)
  const band = zoneBand(lead.intensity, zones)
  if (band) zoneParts.push(band)

  const detailParts: string[] = []
  if (lead.detail) detailParts.push(lead.detail)
  for (const extra of extras) {
    const amount = amounts(extra)
    let line = `Also: ${extra.title}`
    if (amount) line += ` (${amount})`
    if (extra.detail) line += ` — ${extra.detail}`
    detailParts.push(line)
  }

  return {
    day: label,
    type: lead.type,
    workout: lead.title,
    detail: detailParts.length ? detailParts.join(' · ') : '—',
    zone: zoneParts.length ? zoneParts.join(' · ') : '—',
    route: '',
    time: lead.durationMin ? formatDuration(lead.durationMin) : '—',
    verbatimDetail: true,
  }
}

/**
 * The week's running miles, or a label when the plan doesn't give them.
 *
 * The app reads ANY digits in this field as planned miles (`getMilesNumber`,
 * the week header), and judges the athlete against them. So a number is
 * written only when every running session states its distance. Otherwise the
 * label carries no digits, which every consumer reads as "no mileage target".
 */
export function weekMiles(sessions: ImportedSession[]): number | string {
  const runs = sessions.filter(s => RUN_TYPES.has(s.type))
  if (runs.length === 0) {
    return sessions.every(s => s.type === 'rest') ? 'Rest' : 'No running'
  }
  const measured = runs.filter(s => s.distanceMi)
  if (measured.length === runs.length) {
    return Math.round(measured.reduce((sum, s) => sum + (s.distanceMi ?? 0), 0) * 10) / 10
  }
  return measured.length === 0 ? 'By time' : 'Miles + time'
}

/**
 * Build the app's plan from an imported one.
 *
 * @param plan    a plan already checked by `readImportedPlan`
 * @param config  the onboarding config it lives in: the pinned start, the
 *                race the athlete confirmed, and the profile behind the zones
 * @param today   only used when no start is pinned yet (this week's Monday)
 */
export function importedToTrainingPlan(
  plan: ImportedPlanV1,
  config: OnboardingConfig,
  today: string = todayDateString(),
): TrainingPlan {
  const start = mondayOnOrBefore(config.planStartPinnedIso ?? today)
  const maxHR = computeMaxHR(config)
  const zones = makeZonesContiguous(computeZones(maxHR), maxHR)

  const weeks: TrainingWeek[] = plan.weeks.map((week, i) => {
    const startIso = addDays(start, i * 7)
    const days: PlannedDay[] = []
    for (let weekday = 1; weekday <= 7; weekday++) {
      const iso = addDays(startIso, weekday - 1)
      days.push(plannedDayFor(dayLabel(iso), week.sessions.filter(s => s.day === weekday), zones))
    }
    return {
      num: i + 1,
      dates: weekDates(startIso, addDays(startIso, 6)),
      miles: weekMiles(week.sessions),
      focus: week.focus ?? '',
      days,
      startIso,
    }
  })

  // The race as the athlete described it in onboarding (distance, exact
  // miles, vert), named after the plan when they gave the race no name.
  const fromConfig = buildRaceInfo(config)
  const race: RaceInfo = {
    ...fromConfig,
    name: config.raceName || plan.title,
    distance: plan.sport === 'general'
      ? 'General fitness — no race'
      : fromConfig.distance || plan.raceDistance || '',
    athleteGoal: config.athleteGoal,
  }

  return {
    athlete: {
      name: config.athleteName,
      maxHR,
      ftpWatts: config.ftpWatts,
      currentBase: `Your own plan · ${plan.weeks.length} weeks`,
      weeklyStructure: `Your own plan: ${plan.title}`,
      equipmentAccess: config.equipmentAccess,
    },
    weeks,
    zones,
    race,
    importSource: {
      name: plan.source.name,
      kind: plan.source.kind,
      importedAt: plan.source.importedAt,
      title: plan.title,
    },
  }
}
