/**
 * R3 / R13 — environmental preparation. Detects a hot or high-altitude goal race
 * from the athlete's free-text race description and emits honest PlanAdvisory
 * prep notes (which reach the coach for free via the existing advisories path),
 * plus a heat-acclimation block on the final taper weeks.
 *
 * All numbers are the fact-checked iRunFar values (v1.3): heat 7–10 days /
 * 50–100 min/day / start ~2 weeks out / every 3rd day; altitude 21–28 days /
 * live-high-train-low / ferritin <35 gate / VO2 −8–11% per 1,000 m.
 */
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { PlanAdvisory, PlannedDay } from '../types'

function appendDetail(detail: string, add: string): string { return detail ? `${detail} · ${add}` : add }

const HEAT_RE = /\b(hot|heat|humid|tropical|desert|sweltering)\b/i

/** True when the race description signals heat. */
export function detectHeat(config: OnboardingConfig): boolean {
  return HEAT_RE.test(config.raceDescription ?? '')
}

/**
 * Altitude (height above sea level) of the race in feet, or 0. Requires the
 * number to be paired with an elevation/altitude word so "8,000 ft of climbing"
 * (vertical gain) does NOT trigger altitude prep; a bare high-altitude/alpine
 * keyword yields a nominal 8,000 ft.
 */
export function detectAltitudeFt(config: OnboardingConfig): number {
  const text = config.raceDescription ?? ''
  const m =
    text.match(/([\d,]{4,6})\s*(?:ft|feet|')\s*(?:of\s*)?(?:elevation|altitude|above sea)/i) ||
    text.match(/\b(?:at|to|around|near)\s*([\d,]{4,6})\s*(?:ft|feet)\b/i)
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10)
    if (n >= 7000) return n
  }
  if (/\b(high[-\s]?altitude|alpine|thin air|hypoxic)\b/i.test(text)) return 8000
  return 0
}

/** Heat + altitude prep advisories for the race (empty when neither applies). */
export function environmentAdvisories(config: OnboardingConfig): PlanAdvisory[] {
  const out: PlanAdvisory[] = []
  if (detectHeat(config)) {
    out.push({
      id: 'heat_prep',
      severity: 'caution',
      title: 'Heat preparation',
      detail: 'Your race looks hot. Heat acclimation takes 7–10 days — 50–100 min/day of easy exercise in the heat (or a post-run sauna), starting about two weeks out; most of the adaptation comes in the first 4–6 days.',
      suggestion: 'Once acclimated, top it up every third day, and end every session rehydrated.',
    })
  }
  const altFt = detectAltitudeFt(config)
  if (altFt >= 7000) {
    out.push({
      id: 'altitude_prep',
      severity: 'caution',
      title: 'Altitude preparation',
      detail: `Your race sits near ${altFt.toLocaleString()} ft. Expect roughly an 8–11% VO₂ drop per 1,000 m and slower easy paces; full acclimatization takes 21–28 days (live-high/train-low).`,
      suggestion: 'Get ferritin checked first (low iron blunts the response), and either arrive the night before or ≥1 week out — avoid the 2–4-day window.',
    })
  }
  return out
}

/**
 * Tag one easy run in the final ~2 weeks with a heat-acclimation block when the
 * race is hot. Other weeks / temperate races are returned unchanged.
 */
export function applyHeatBlock(days: PlannedDay[], heat: boolean, weeksToRace: number): PlannedDay[] {
  if (!heat || weeksToRace > 2) return days
  let tagged = false
  return days.map(d => {
    if (!tagged && d.type === 'run') {
      tagged = true
      return { ...d, detail: appendDetail(d.detail, 'Heat prep: 50–100 min easy in the heat or a post-run sauna') }
    }
    return d
  })
}
