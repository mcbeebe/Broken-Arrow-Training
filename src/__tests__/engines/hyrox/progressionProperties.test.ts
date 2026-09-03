import { describe, it, expect } from 'vitest'
import { generateHyroxPlan } from '../../../utils/planGenerator'
import { FULL_SIM_DAYS_OUT, HALF_SIM_DAYS_OUT, SPEC_DAY_DAYS_OUT, STATION_RAMP } from '../../../engines/hyrox/heuristics'
import { FULL_SPEC_PHRASE } from '../../../engines/hyrox/spec'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { TrainingPlan, TrainingWeek } from '../../../types'

/**
 * Mutation-derived properties (M1a, M3, M4a).
 *
 * The 2026-09 audit mutated the Hyrox engine and asked which mutants the
 * suite kills. `heuristics.test.ts` kills a CONSTANT ramp — it asserts
 * startPct < endPct on the tiered value — but nothing looked at what the
 * generator does with those numbers, so a REVERSED lerp in
 * `stationPctForWeek` shipped green: a first-timer prescribed a 1000 m
 * SkiErg and a 152 kg sled push in week 1, easing to half spec by race
 * week. Likewise nothing pinned the half simulation or the full-spec
 * stations day against being re-gated on training phase, which is exactly
 * the v1 defect #402 fixed (the peak phase was unreachable on a clamped
 * runway, so the key session never fired).
 *
 * These are properties over the persona × runway grid, not example tests:
 * a mutant has to survive all of them, in every plan shape the app ships.
 */

const TODAY = '2026-09-07' // a Monday
const RACE_BY_WEEKS: Record<number, string> = {
  4: '2026-10-03', 8: '2026-10-31', 12: '2026-11-28', 16: '2026-12-26', // Saturdays
}
const RUNWAYS = [4, 8, 12, 16]
const DAYS_PER_WEEK = [3, 4, 5, 6, 7]

const base = {
  raceType: 'hyrox' as const, raceName: 'Hyrox Test City', longRunDay: 'Saturday',
  wearable: 'garmin' as const, completedAt: '', athleteName: 'X', sex: 'male' as const,
  equipmentAccess: ['gym'],
}

const plan = (days: number, weeks: number, extra: Partial<OnboardingConfig> = {}): TrainingPlan =>
  generateHyroxPlan({
    ...base, age: 35, experienceLevel: 'intermediate', trainingDaysPerWeek: days,
    raceDate: RACE_BY_WEEKS[weeks], ...extra,
  } as unknown as OnboardingConfig, TODAY)

/** The taper and race week deliberately drop station volume (TAPER_WEEK), so
 *  the ramp property is about the BUILD. */
const IS_TAPER = /taper|race\s*week/i

/** The largest ramped station volume prescribed in a week. The full-spec
 *  overlays (spec day, both simulations) are excluded on purpose: they are
 *  guaranteed 100% touches placed by date arithmetic, not by the ramp, so
 *  including them would mask a reversed ramp behind them. */
function rampedSkiErgM(w: TrainingWeek): number {
  let best = 0
  for (const d of w.days) {
    if (d.detail.includes(FULL_SPEC_PHRASE) || /SIMULATION/i.test(d.workout)) continue
    for (const m of d.detail.matchAll(/SkiErg (\d+)m/g)) best = Math.max(best, Number(m[1]))
  }
  return best
}

function buildRamp(p: TrainingPlan): number[] {
  return p.weeks.filter(w => !IS_TAPER.test(w.focus)).map(rampedSkiErgM).filter(v => v > 0)
}

const daysOut = (p: TrainingPlan, match: RegExp): number[] => {
  const raceIso = p.race.date
  const out: number[] = []
  for (const w of p.weeks) {
    if (!w.startIso) continue
    w.days.forEach((d, i) => {
      if (!match.test(d.workout)) return
      const iso = new Date(Date.parse(`${w.startIso}T12:00:00`) + i * 86_400_000)
      out.push(Math.round((Date.parse(`${raceIso}T12:00:00`) - iso.getTime()) / 86_400_000))
    })
  }
  return out
}

describe('M1a — the station ramp cannot run backwards', () => {
  it.each(DAYS_PER_WEEK.flatMap(d => RUNWAYS.map(w => [`${d} d/wk, ${w} wk`, d, w] as const)))(
    '%s: build volumes never decrease, and the last exceeds the first',
    (_label, days, weeks) => {
      const ramp = buildRamp(plan(days, weeks))
      // A 4-week runway's only ramped station day lands in the taper week,
      // which is excluded by design — there is nothing to compare. The
      // non-vacuity guard below is what stops that silently becoming true
      // everywhere.
      if (ramp.length < 2) return
      for (let i = 1; i < ramp.length; i++) {
        expect(ramp[i], `week ${i + 1} of ${JSON.stringify(ramp)} went backwards`).toBeGreaterThanOrEqual(ramp[i - 1])
      }
      expect(ramp[ramp.length - 1], JSON.stringify(ramp)).toBeGreaterThan(ramp[0])
    },
  )

  it('NON-VACUITY: every runway that can hold a ramp actually exercises the check', () => {
    // Without this, a change that stopped emitting station volumes entirely
    // would make the property above pass by having nothing to look at.
    for (const days of DAYS_PER_WEEK) {
      for (const weeks of [8, 12, 16]) {
        expect(buildRamp(plan(days, weeks)).length, `${days}d ${weeks}wk`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('opens near STARTPCT and finishes near ENDPCT — not the other way round', () => {
    // The reversed lerp keeps the same two endpoints and the same spread; it
    // only swaps which end the athlete meets first. Pinning the endpoints in
    // the plan (not in the constant) is what tells the two apart.
    const ramp = buildRamp(plan(5, 16))
    const r = STATION_RAMP.value
    // SkiErg is 1000 m at spec, so the fraction reads directly off the metres.
    expect(ramp[0] / 1000).toBeLessThanOrEqual(r.startPct + 0.1)
    expect(ramp[ramp.length - 1] / 1000).toBeGreaterThanOrEqual(r.endPct - 0.15)
  })

  it('a first-timer is never handed race-spec stations in week 1', () => {
    // The athlete-facing statement of the same property, in the shape the
    // reversed mutant actually harms someone.
    for (const weeks of [8, 12, 16]) {
      const p = plan(3, weeks, { experienceLevel: 'first_timer', equipmentAccess: [] })
      const first = p.weeks[0]
      for (const d of first.days) {
        if (d.detail.includes(FULL_SPEC_PHRASE) || /SIMULATION/i.test(d.workout)) continue
        for (const m of d.detail.matchAll(/SkiErg (\d+)m/g)) {
          expect(Number(m[1]), `${weeks}wk week 1: ${d.workout}`).toBeLessThan(1000)
        }
      }
    }
  })
})

describe('M3 / M4a — the key sessions are placed by date, never by phase', () => {
  it.each(DAYS_PER_WEEK.flatMap(d => RUNWAYS.map(w => [`${d} d/wk, ${w} wk`, d, w] as const)))(
    '%s: full sim, half sim and the full-spec stations day all appear',
    (_label, days, weeks) => {
      const p = plan(days, weeks)
      expect(daysOut(p, /FULL RACE SIMULATION/).length, 'full simulation').toBeGreaterThan(0)
      expect(daysOut(p, /HALF SIMULATION/).length, 'half simulation').toBeGreaterThan(0)
      expect(daysOut(p, /Full-distance stations/).length, 'full-spec stations day').toBeGreaterThan(0)
    },
  )

  it.each(DAYS_PER_WEEK.flatMap(d => RUNWAYS.map(w => [`${d} d/wk, ${w} wk`, d, w] as const)))(
    '%s: each lands inside its own tiered window',
    (_label, days, weeks) => {
      const p = plan(days, weeks)
      for (const d of daysOut(p, /FULL RACE SIMULATION/)) {
        expect(d).toBeGreaterThanOrEqual(FULL_SIM_DAYS_OUT.value.min)
        expect(d).toBeLessThanOrEqual(FULL_SIM_DAYS_OUT.value.max)
      }
      for (const d of daysOut(p, /HALF SIMULATION/)) {
        expect(d).toBeGreaterThanOrEqual(HALF_SIM_DAYS_OUT.value.min)
        expect(d).toBeLessThanOrEqual(HALF_SIM_DAYS_OUT.value.max)
      }
      // The spec day's floor drops on a clamped runway (SPEC_DAY_SHORT_RUNWAY_MIN)
      // so a 4-week athlete still gets one; the ceiling is the tiered value.
      for (const d of daysOut(p, /Full-distance stations/)) {
        expect(d).toBeLessThanOrEqual(SPEC_DAY_DAYS_OUT.value.max)
        expect(d).toBeGreaterThan(FULL_SIM_DAYS_OUT.value.max)
      }
    },
  )

  it('the ordering the race demands: spec day, then half sim, then full sim', () => {
    for (const days of DAYS_PER_WEEK) {
      for (const weeks of [8, 12, 16]) {
        const p = plan(days, weeks)
        const spec = Math.min(...daysOut(p, /Full-distance stations/))
        const half = Math.min(...daysOut(p, /HALF SIMULATION/))
        const full = Math.min(...daysOut(p, /FULL RACE SIMULATION/))
        // Larger daysOut = earlier in the build.
        expect(spec, `${days}d ${weeks}wk`).toBeGreaterThan(half)
        expect(half, `${days}d ${weeks}wk`).toBeGreaterThan(full)
      }
    }
  })
})
