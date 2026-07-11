import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace, StravaActivity, TrainingWeek } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { getMethodById } from '../data/methods'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { planSeason } from '../engines/season/planSeason'
import { spliceSeasonWeeks } from '../engines/season/spliceSeason'
import { matchActivitiesToPlan } from '../utils/matching'
import { dayIsoInWeek } from '../utils/planDates'
import { BLOCK_STYLE } from '../utils/blockStyles'

/**
 * The field season, end to end (screenshots of 7/11): anchor half
 * Oct 24 2026 → Hyrox Dec 5 2026 (layered) → 46k trail June 19 2027.
 * Locks the four assembly defects:
 *   1. anchor race day was a substituted "Easy" run, not a RACE DAY card;
 *   2. June-2026 actuals attached to June-2027 plan days (year bleed);
 *   3. the post-race Sunday became an orphan "Week 13 · Oct 25–25" week;
 *   4. far-future weeks attributed to the ANCHOR race (trailing
 *      "Build → Oakland Hills" chip, wrong week headers).
 */

const TODAY = '2026-07-11'
const ANCHOR_ISO = '2026-10-24' // Saturday
const HYROX_ISO = '2026-12-05'  // Saturday
const TRAIL46K_ISO = '2027-06-19' // Saturday

const config = {
  raceType: 'trail', raceName: 'Oakland Hills Half Marathon', raceDate: ANCHOR_ISO,
  raceDistance: 'half_marathon', goalMode: 'season',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 6, longRunDay: 'Sunday',
  wearable: 'garmin', athleteName: 'Mike', age: 42, maxHR: 178,
  selectedMethodId: 'higdon', completedAt: '2026-07-10T05:30:00.000Z',
} as unknown as OnboardingConfig

function race(name: string, date: string, over: Partial<RaceInfo> = {}): RaceInfo {
  return {
    name, date, startTime: '', distance: 'Half Marathon', distanceMiles: 13.1,
    elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', ...over,
  }
}

const races: SeasonRace[] = [
  { id: 'oakland-hills-half-marathon_2026-10-24', priority: 'A', status: 'upcoming', raceInfo: race('Oakland Hills Half Marathon', ANCHOR_ISO) },
  { id: 'hyrox-anaheim_2026-12-05', priority: 'A', status: 'upcoming', integration: 'layered', raceInfo: race('Hyrox - Anaheim', HYROX_ISO, { distance: 'Hyrox', distanceMiles: 8, format: 'hyrox' }) },
  { id: 'broken-arrow-46k_2027-06-19', priority: 'A', status: 'upcoming', raceInfo: race('Broken Arrow 46 k', TRAIL46K_ISO, { distance: '46 km', distanceMiles: 28.6, format: 'trail' }) },
]

function assemble(): TrainingWeek[] {
  const higdon = getMethodById('higdon')!
  const base = generatePlanFromMethod(higdon, config, TODAY)
  const result = planSeason(races, TODAY)
  return spliceSeasonWeeks(base.weeks, { season: { races, blocks: result.season.blocks }, advisories: result.advisories }, config, TODAY)
}

const weeks = assemble()

/** Same derivation WeeklyPlan's seasonSegments useMemo runs. */
function seasonSegments(ws: TrainingWeek[]): { label: string; count: number }[] {
  const segs: { label: string; count: number }[] = []
  for (const w of ws) {
    const sr = w.seasonRace
    const label = sr ? `${BLOCK_STYLE[sr.blockKind].label} → ${sr.name}` : 'Race plan'
    const prev = segs[segs.length - 1]
    if (prev && prev.label === label) prev.count++
    else segs.push({ label, count: 1 })
  }
  return segs
}

describe('field 4-race season, Oct 2026 → June 2027', () => {
  it('every week carries a startIso consistent with its days', () => {
    for (const w of weeks) {
      expect(w.startIso, `week ${w.num} (${w.dates}) missing startIso`).toBeTruthy()
      for (const d of w.days) {
        const iso = dayIsoInWeek(d.day, w)
        expect(iso, `week ${w.num} day ${d.day} unresolvable`).toBeTruthy()
        expect(iso! >= w.startIso!, `week ${w.num} day ${d.day} predates startIso`).toBe(true)
      }
    }
  })

  it('the anchor race day is a named RACE DAY card (defect 1)', () => {
    const anchorDay = weeks.flatMap(w => w.days.map(d => ({ d, w })))
      .find(({ d, w }) => dayIsoInWeek(d.day, w) === ANCHOR_ISO)
    expect(anchorDay).toBeTruthy()
    expect(anchorDay!.d.type).toBe('race')
    expect(anchorDay!.d.workout).toContain('RACE DAY')
    expect(anchorDay!.d.workout).toContain('Oakland Hills')
    expect(anchorDay!.d.detail).not.toContain('Substituted')
  })

  it('a June-2026 activity attaches to ZERO June-2027 days (defect 2)', () => {
    const juneRace2026: StravaActivity = {
      id: 1, name: 'Broken Arrow Skyrace 18K', type: 'Run', sport_type: 'TrailRun',
      distance: 18350, moving_time: 9180, elapsed_time: 9500, total_elevation_gain: 950,
      start_date: '2026-06-19T15:00:00Z', start_date_local: '2026-06-19T08:00:00',
      average_speed: 2.0, average_heartrate: 175,
    } as unknown as StravaActivity
    const matched = matchActivitiesToPlan(weeks, [juneRace2026])
    const june2027Actuals = matched.flatMap(w => w.days.map(d => ({ d, w })))
      .filter(({ d, w }) => {
        const iso = dayIsoInWeek(d.day, w)
        return !!d.actual && !!iso && iso >= '2027-06-01' && iso <= '2027-06-30'
      })
    expect(june2027Actuals).toEqual([])
  })

  it('every week starts on a Monday — no orphan partial weeks (defect 3)', () => {
    const nonMonday = weeks
      .filter(w => w.startIso && (new Date(`${w.startIso}T12:00:00`).getDay() + 6) % 7 !== 0)
      .map(w => `${w.num}: ${w.startIso}`)
    expect(nonMonday).toEqual([])
  })

  it('no week anywhere has fewer than 3 days except a race-terminated final', () => {
    for (const w of weeks) {
      if (w.days.length >= 3) continue
      const lastDay = w.days[w.days.length - 1]
      expect(lastDay?.type, `week ${w.num} (${w.dates}) is a ${w.days.length}-day week not ending in a race`).toBe('race')
    }
  })

  it('every seasonRace stamp points at the chronologically NEXT race; none after the last race (defect 4)', () => {
    const raceIsos = [ANCHOR_ISO, HYROX_ISO, TRAIL46K_ISO]
    for (const w of weeks) {
      if (!w.seasonRace) continue
      const first = w.startIso!
      const expected = raceIsos.find(iso => iso >= first)
      expect(expected, `week ${w.num} (${w.dates}) stamped ${w.seasonRace.name} but no race remains`).toBeTruthy()
      expect(w.seasonRace.dateIso, `week ${w.num} (${w.dates}) points at the wrong race`).toBe(expected)
    }
  })

  it('the chip strip has no trailing anchor segment and races appear in order (defect 4)', () => {
    const segs = seasonSegments(weeks)
    expect(segs[0].label).toBe('Race plan')
    expect(segs[segs.length - 1].label).not.toContain('Oakland Hills')
    // First appearance order of each race across chips matches the calendar.
    const order: string[] = []
    for (const s of segs) {
      for (const name of ['Hyrox - Anaheim', 'Broken Arrow 46 k']) {
        if (s.label.includes(name) && !order.includes(name)) order.push(name)
      }
    }
    expect(order).toEqual(['Hyrox - Anaheim', 'Broken Arrow 46 k'])
  })

  it('both non-anchor race days carry named cards on their exact dates', () => {
    for (const [iso, name] of [[HYROX_ISO, 'Hyrox - Anaheim'], [TRAIL46K_ISO, 'Broken Arrow 46 k']] as const) {
      const hits = weeks.flatMap(w => w.days.map(d => ({ d, w })))
        .filter(({ d, w }) => d.type === 'race' && dayIsoInWeek(d.day, w) === iso)
      expect(hits, `${name} race day missing on ${iso}`).toHaveLength(1)
      expect(hits[0].d.workout).toContain(name)
    }
  })
})
