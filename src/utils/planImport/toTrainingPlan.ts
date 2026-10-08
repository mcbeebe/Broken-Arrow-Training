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
 */
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { HRZone, PlannedDay, RaceInfo, TrainingPlan, TrainingWeek } from '../../types'
import { addDays, mondayOnOrBefore, todayDateString } from '../planDates'
import { dayLabel, weekDates } from '../../engines/season/blockWeeks'
import { computeMaxHR } from '../heartRate'
import { computeZones } from '../../engines/generalFitness'
import { makeZonesContiguous } from '../../engines/planGenerator/generatePlan'
import { toNumericZones } from '../rezone'
import type { ImportedIntensity, ImportedPlanV1, ImportedSession, ImportedSessionType } from './types'

/** Which session leads a day that carries more than one: the hardest. */
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

/** One day's sessions as a single PlannedDay. A day with two sessions leads
 *  with the harder one and lists the other in the detail; run distances and
 *  durations add up, so a double day still counts in full. */
function plannedDayFor(label: string, sessions: ImportedSession[], zones: HRZone[]): PlannedDay {
  if (sessions.length === 0) {
    return { day: label, type: 'rest', workout: 'Rest', detail: '—', zone: '—', route: '', time: '—' }
  }
  const ordered = [...sessions].sort((a, b) => DAY_PRIORITY[a.type] - DAY_PRIORITY[b.type])
  const lead = ordered[0]
  const extras = ordered.slice(1)

  const runDistance = ordered
    .filter(s => RUN_TYPES.has(s.type))
    .reduce((sum, s) => sum + (s.distanceMi ?? 0), 0)
  const distance = RUN_TYPES.has(lead.type) ? runDistance : (lead.distanceMi ?? 0)
  const minutes = ordered.reduce((sum, s) => sum + (s.durationMin ?? 0), 0)

  const zoneParts: string[] = []
  if (distance > 0) zoneParts.push(`${distance.toFixed(1)} mi`)
  const band = zoneBand(lead.intensity, zones)
  if (band) zoneParts.push(band)

  const detailParts: string[] = []
  if (lead.detail) detailParts.push(lead.detail)
  for (const extra of extras) {
    detailParts.push(extra.detail ? `Also: ${extra.title} — ${extra.detail}` : `Also: ${extra.title}`)
  }

  return {
    day: label,
    type: lead.type,
    workout: lead.title,
    detail: detailParts.length ? detailParts.join(' · ') : '—',
    zone: zoneParts.length ? zoneParts.join(' · ') : '—',
    route: '',
    time: minutes > 0 ? formatDuration(minutes) : '—',
  }
}

function weekMiles(days: PlannedDay[], sessions: ImportedSession[]): number | string {
  const miles = sessions
    .filter(s => RUN_TYPES.has(s.type))
    .reduce((sum, s) => sum + (s.distanceMi ?? 0), 0)
  if (miles > 0) return Math.round(miles * 10) / 10
  const minutes = sessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0)
  if (minutes > 0) return `~${Math.round(minutes)} min`
  return days.every(d => d.type === 'rest') ? 'Rest' : '—'
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
      miles: weekMiles(days, week.sessions),
      focus: week.focus ?? '',
      days,
      startIso,
    }
  })

  const race: RaceInfo = {
    name: config.raceName || plan.title,
    date: config.raceDate || '',
    startTime: '',
    distance: plan.sport === 'general' ? 'General fitness — no race' : (plan.raceDistance ?? ''),
    distanceMiles: config.raceDistanceMiles ?? 0,
    elevation: '—',
    elevationGainFt: config.elevationGainFt,
    elevationRange: '—',
    course: '—',
    cutoff: '—',
    landmarks: [],
    gear: [],
    nutrition: '',
    description: config.raceDescription,
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
