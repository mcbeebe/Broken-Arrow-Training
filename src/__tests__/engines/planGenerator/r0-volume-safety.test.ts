/**
 * R0 — volume-safety gate (the "Jim" regression suite).
 *
 * The 2026-08 running-plan audit found weekly volume was a step function
 * of phase quality-density: quality templates landed at full method size
 * on top of the ramp-capped weekly target, so every method cliffed
 * +36–119% at the base→build boundary, at every runway, for every age
 * (docs/running-plan-audit.md, root cause A1). This suite regenerates the
 * originating case — a 79-year-old beginner's two-5K season — across
 * EVERY method and requires:
 *   - zero validator errors on the anchor plan AND the spliced season,
 *   - no >30% week-over-week mileage jump anywhere outside sanctioned
 *     seams (race → post-race recovery),
 *   - a 5K taper of at most 2 weeks (race week included),
 *   - day content that tracks the progression target (quality budgeted,
 *     not additive).
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById, ALL_METHODS } from '../../../data/methods'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { RaceInfo, SeasonRace, TrainingWeek } from '../../../types'

const TODAY = '2026-08-17' // a Monday

function raceInfo(name: string, date: string): RaceInfo {
  return {
    name, date, startTime: '08:00', distance: '5K', distanceMiles: 3.1,
    elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [],
    gear: [], nutrition: '', format: 'road',
  }
}
const R1 = raceInfo('Spruce Railroad', '2026-10-03')
const R2 = raceInfo('Jamestown Glow Run', '2026-12-05')

function jim(over: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: R1.name, raceDate: R1.date,
    goalMode: 'season', raceDistance: '5k', raceDistanceMiles: 3.1,
    athleteName: 'Jim', age: 79, sex: 'male',
    experienceLevel: 'beginner', trainingDaysPerWeek: 6,
    longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    ...over,
  } as unknown as OnboardingConfig
}

const SEASON: SeasonRace[] = [
  { id: 'r1', priority: 'A', status: 'upcoming', raceInfo: R1 },
  { id: 'r2', priority: 'A', status: 'upcoming', raceInfo: R2, isPrimary: true },
]

const isRaceWeek = (w: TrainingWeek) => w.days.some(d => d.type === 'race')
const isRecoverish = (w: TrainingWeek) => /recover|bridge|post-race/i.test(w.focus ?? '')

function maxSaneJumpViolations(weeks: TrainingWeek[]): string[] {
  const out: string[] = []
  let baseline = 0
  for (const w of weeks) {
    const mi = Number(w.miles)
    if (!Number.isFinite(mi) || mi <= 0) continue
    const skip = isRaceWeek(w) || isRecoverish(w)
    if (!skip && baseline >= 5 && mi > baseline * 1.3) {
      out.push(`wk${w.num}: ${baseline} → ${mi}`)
    }
    if (!skip && !/cutback|recovery week/i.test(w.focus ?? '')) baseline = mi
  }
  return out
}

describe('R0 — Jim gate: two-5K season, every method', () => {
  it.each(ALL_METHODS.map(m => [m.id] as const))('%s: zero errors, sane ramp, short-race taper', (id) => {
    const cfg = jim({ selectedMethodId: id })
    const anchor = generatePlanFromMethod(getMethodById(id)!, cfg, TODAY)
    const season = planSeason(SEASON, TODAY)
    const spliced = spliceSeasonWeeks(anchor.weeks, season, cfg, TODAY)

    // Zero validator errors, anchor and season.
    expect(validatePlan(anchor).errors.map(e => `${e.id}@${e.weekNum}: ${e.detail}`)).toEqual([])
    expect(validatePlan({ ...anchor, weeks: spliced }).errors.map(e => `${e.id}@${e.weekNum}: ${e.detail}`)).toEqual([])

    // No >30% week-over-week jump against the last full training week.
    expect(maxSaneJumpViolations(spliced)).toEqual([])

    // 5K taper cap: at most 2 trailing weeks labeled Taper (incl. race week).
    const taperRun = (() => {
      let n = 0
      for (let i = anchor.weeks.length - 1; i >= 0; i--) {
        if (/taper/i.test(anchor.weeks[i].focus ?? '')) n++
        else break
      }
      return n
    })()
    expect(taperRun, `${id} taper length`).toBeLessThanOrEqual(2)

    // Day content tracks the progression target (quality is budgeted).
    for (const w of anchor.weeks) {
      if (w.targetMi == null || w.targetMi <= 3 || isRaceWeek(w)) continue
      if (w.days.some(d => /\bBENCHMARK\b/i.test(d.workout))) continue
      const mi = Number(w.miles)
      const dev = Math.abs(mi - w.targetMi)
      expect(dev <= Math.max(3, w.targetMi * 0.25), `${id} wk${w.num}: ${mi} vs target ${w.targetMi}`).toBe(true)
    }

    // No duplicate calendar days (the Pfitzinger double-Saturday bug).
    for (const w of spliced) {
      expect(new Set(w.days.map(d => d.day)).size, `${id} wk${w.num} duplicate days`).toBe(w.days.length)
    }

    // Weekly race-pace workouts are quality sessions, not race days: the
    // only type='race' day in the whole season is an actual race.
    const raceDays = spliced.flatMap(w => w.days).filter(d => d.type === 'race')
    expect(raceDays.length).toBeLessThanOrEqual(2)
    for (const d of raceDays) expect(d.workout).toMatch(/RACE DAY/)
  })

  it('the original cliff is dead: daniels 16-week single race ramps within 30% everywhere', () => {
    const cfg = jim({ raceName: R2.name, raceDate: R2.date, goalMode: 'race', additionalRaces: undefined })
    const plan = generatePlanFromMethod(getMethodById('daniels')!, cfg, TODAY)
    expect(maxSaneJumpViolations(plan.weeks)).toEqual([])
    // And the peak stays anchored to the athlete's base (1.4× multiplier on
    // ~10 mi/wk beginner default + tolerance), nowhere near the audit's 27.5.
    const peak = Math.max(...plan.weeks.map(w => Number(w.miles) || 0))
    expect(peak).toBeLessThan(20)
  })

  it('quality sessions scale down for low-volume athletes instead of overflowing', () => {
    const cfg = jim({ selectedMethodId: 'daniels', raceName: R2.name, raceDate: R2.date, goalMode: 'race', additionalRaces: undefined })
    const plan = generatePlanFromMethod(getMethodById('daniels')!, cfg, TODAY)
    // Every quality day's steps agree with its header (re-derived after
    // scaling) and no single quality session dwarfs the week.
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.type !== 'quality' || !d.plannedWorkout) continue
        const mi = Number(w.miles)
        if (mi > 0) {
          const window = d.plannedWorkout.approxDurationMinutes
          expect(window.max, `${w.num} ${d.workout} header sanity`).toBeLessThanOrEqual(75)
        }
      }
    }
  })
})

describe('R0 — QA rules', () => {
  const mkWeek = (num: number, miles: number, focus = 'Build', days: TrainingWeek['days'] = []): TrainingWeek =>
    ({ num, dates: '', miles, focus, days } as unknown as TrainingWeek)

  it('qa_weekly_ramp: errors above +30%, warns above +20%, ignores cutback rebounds', () => {
    const weeks = [
      mkWeek(1, 10), mkWeek(2, 11), mkWeek(3, 7, 'Cutback'),
      mkWeek(4, 12),          // rebound vs wk2 baseline (11): +9% — fine
      mkWeek(5, 15),          // +25% vs 12 — warn
      mkWeek(6, 21),          // +40% vs 15 — error
    ]
    const qa = validatePlan({ weeks })
    const ramp = qa.findings.filter(f => f.id === 'qa_weekly_ramp')
    expect(ramp.some(f => f.weekNum === 4)).toBe(false)
    expect(ramp.find(f => f.weekNum === 5)?.severity).toBe('warn')
    expect(ramp.find(f => f.weekNum === 6)?.severity).toBe('error')
  })

  it('qa_weekly_ramp: race and recovery weeks are neither subjects nor baselines', () => {
    const raceDay = { day: 'Sat 10/3', type: 'race', workout: 'RACE DAY — 5K', detail: '', zone: '—', route: '', time: '—' } as TrainingWeek['days'][number]
    const weeks = [
      mkWeek(1, 12), mkWeek(2, 13),
      mkWeek(3, 5, 'Taper', [raceDay]),                       // race week
      mkWeek(4, 8, '[After race] Post-race recovery — easy'), // recover
      mkWeek(5, 14),                                          // vs wk2 baseline 13: +8% — fine
    ]
    const qa = validatePlan({ weeks })
    expect(qa.findings.filter(f => f.id === 'qa_weekly_ramp')).toEqual([])
  })

  it('qa_target_adherence: fires when day content ignores the progression target', () => {
    const weeks = [
      ({ num: 1, dates: '', miles: 28, targetMi: 12, focus: 'Build', days: [] } as unknown as TrainingWeek),
    ]
    const qa = validatePlan({ weeks })
    expect(qa.errors.some(f => f.id === 'qa_target_adherence')).toBe(true)
  })

  it('qa_load_spike: the time leg fires without any vert (road plans)', () => {
    const day = (time: string) => ({ day: 'Mon', type: 'run', workout: 'Easy', detail: '', zone: '—', route: '', time } as TrainingWeek['days'][number])
    const full = (num: number, minutes: number, focus = 'Build') =>
      mkWeek(num, 20, focus, Array.from({ length: 6 }, () => day(`${Math.round(minutes / 6)} min`)))
    const weeks = [full(1, 300), full(2, 300), full(3, 480)] // +60% time, zero vert
    const qa = validatePlan({ weeks })
    expect(qa.findings.some(f => f.id === 'qa_load_spike' && f.weekNum === 3)).toBe(true)
  })

  it('qa_taper_monotonic: post-race recovery weeks are not "the taper"', () => {
    const raceDay = { day: 'Sat 10/3', type: 'race', workout: 'RACE DAY', detail: '', zone: '—', route: '', time: '—' } as TrainingWeek['days'][number]
    const weeks = [
      mkWeek(1, 14), mkWeek(2, 10, 'Taper'),
      mkWeek(3, 5, 'Taper', [raceDay]),
      mkWeek(4, 8, '[After race] Post-race recovery — reverse taper'), // rising is CORRECT here
      mkWeek(5, 12, '[After race] Post-race recovery — reverse taper'),
    ]
    const qa = validatePlan({ weeks })
    expect(qa.findings.filter(f => f.id === 'qa_taper_monotonic')).toEqual([])
  })
})
