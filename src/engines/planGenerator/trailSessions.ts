/**
 * R4 / R7 — trail-specific session content.
 *   R4: a dress-rehearsal "predictor" long run 4–6 weeks out (~30–60% of course)
 *       to rehearse terrain, gear, fuel and pacing — for any race long enough to
 *       warrant it (half-marathon and up).
 *   R7: power-hiking as a prescribed skill on climby races — built into the long
 *       run through the build/peak ("hike the steep climbs to keep big-vert days
 *       aerobic"); flat races get none.
 */
import type { PlannedDay } from '../../types'

function appendDetail(detail: string, add: string): string { return detail ? `${detail} · ${add}` : add }

/** Races short enough that a course dress rehearsal isn't warranted (5K/10K). */
const PREDICTOR_MIN_MILES = 13

/** True for the 4–6-week-out window where the dress rehearsal is scheduled. */
export function isPredictorWeek(weeksToRace: number): boolean {
  return weeksToRace >= 4 && weeksToRace <= 6
}

/**
 * Tag the long run 4–6 weeks out as a dress-rehearsal predictor (half-marathon and
 * up). Short races / other weeks are returned unchanged.
 */
export function applyPredictorRehearsal(days: PlannedDay[], raceMiles: number, weeksToRace: number): PlannedDay[] {
  if (raceMiles < PREDICTOR_MIN_MILES || !isPredictorWeek(weeksToRace)) return days
  let tagged = false
  return days.map(d => {
    if (!tagged && d.type === 'long') {
      tagged = true
      return { ...d, detail: appendDetail(d.detail, 'Dress rehearsal — rehearse course terrain, gear, fuel & pacing') }
    }
    return d
  })
}

/**
 * R14 — trail-first framing: lead the long run with time-on-feet (run by time, not
 * pace) for trail races, where pace is meaningless. Road races are unchanged.
 */
export function applyTimeOnFeet(days: PlannedDay[], isTrail: boolean): PlannedDay[] {
  if (!isTrail) return days
  let tagged = false
  return days.map(d => {
    if (!tagged && d.type === 'long') {
      tagged = true
      return { ...d, detail: appendDetail(d.detail, 'Run by time on feet, not pace') }
    }
    return d
  })
}

/**
 * Add a power-hiking emphasis to the long run on climby races through the build/
 * peak (not the taper). Flat races are returned unchanged.
 */
export function applyPowerHike(days: PlannedDay[], isClimby: boolean, isTaper: boolean): PlannedDay[] {
  if (!isClimby || isTaper) return days
  let tagged = false
  return days.map(d => {
    if (!tagged && d.type === 'long') {
      tagged = true
      return { ...d, detail: appendDetail(d.detail, 'Power-hike the steep climbs (build toward 90 min of strong hiking)') }
    }
    return d
  })
}
