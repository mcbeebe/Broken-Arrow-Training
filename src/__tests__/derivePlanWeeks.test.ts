/**
 * The derived-plan pipeline's ORDER is the contract.
 *
 * Ten transforms turn the season-spliced base plan into what the athlete
 * sees, and several are only correct because of what runs before them: edits
 * re-anchor in post-swap coordinates, locks stamp final-positioned days,
 * the replan rewrites the prescription before any actual is matched in, and
 * rezone rewrites HR text last so it catches what the earlier layers wrote.
 *
 * None of that was tested. The pipeline lived inline in App.tsx's `weeks`
 * useMemo, closing over a dozen hook values inside a 2500-line component, so
 * a reordering could only be caught by rendering the whole app and hoping
 * something downstream noticed. These tests watch the sequence directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TrainingWeek, HRZone } from '../types'
// Vite's ?raw loader: App.tsx as a string, no node builtins needed.
import appSrc from '../App.tsx?raw'

const calls: string[] = []

vi.mock('../utils/matching', () => ({
  matchActivitiesToPlan: vi.fn((w: TrainingWeek[]) => { calls.push('strava'); return w }),
  mergeGarminDetailIntoWeeks: vi.fn((w: TrainingWeek[]) => { calls.push('garminDetail'); return w }),
  mergeAppleActivitiesIntoWeeks: vi.fn((w: TrainingWeek[]) => { calls.push('apple'); return w }),
}))
vi.mock('../utils/rezone', () => ({
  rezoneWeeks: vi.fn((w: TrainingWeek[]) => { calls.push('rezone'); return w }),
}))

const { derivePlanWeeks, DERIVED_PIPELINE_ORDER } = await import('../utils/derivePlanWeeks')

const BASE = [{ num: 1, days: [] }] as unknown as TrainingWeek[]
const ZONES = [] as HRZone[]

/** Every source switched ON, so the full pipeline runs. */
function fullInput(over: Partial<Parameters<typeof derivePlanWeeks>[0]> = {}) {
  const tap = (name: string) => (w: TrainingWeek[]) => { calls.push(name); return w }
  return {
    base: BASE,
    applySwaps: tap('swaps'),
    applyEdits: tap('edits'),
    applyLocks: tap('locks'),
    applyReplans: tap('replan'),
    applyManualLogs: tap('manualLog'),
    showStrava: true,
    stravaActivities: [{ id: 1 }] as never,
    garminConnected: true,
    garminActivityDetails: { '2026-01-01': [] as never },
    appleActivities: [{ durationMinutes: 30 }] as never,
    zones: ZONES,
    ...over,
  }
}

beforeEach(() => { calls.length = 0 })

describe('the pipeline order', () => {
  it('runs all ten layers in the documented sequence', () => {
    derivePlanWeeks(fullInput())
    expect(calls).toEqual([
      'swaps', 'edits', 'locks', 'replan',
      'strava', 'garminDetail', 'apple',
      'manualLog', 'rezone',
    ])
  })

  it('matches DERIVED_PIPELINE_ORDER, so the written-down order cannot drift from the code', () => {
    derivePlanWeeks(fullInput())
    expect(calls).toEqual([...DERIVED_PIPELINE_ORDER])
  })

  it('applies edits AFTER swaps', () => {
    // Field edits must sit in post-swap coordinate space so an edit follows
    // its workout into the swapped slot. Reversing these two reintroduces
    // "the edit landed on the wrong day after a swap".
    derivePlanWeeks(fullInput())
    expect(calls.indexOf('swaps')).toBeLessThan(calls.indexOf('edits'))
  })

  it('stamps locks AFTER both swaps and edits', () => {
    // `day.locked` goes on final-positioned days, or a lock protects the
    // wrong calendar day for every scheduler that reads these weeks.
    derivePlanWeeks(fullInput())
    expect(calls.indexOf('edits')).toBeLessThan(calls.indexOf('locks'))
    expect(calls.indexOf('swaps')).toBeLessThan(calls.indexOf('locks'))
  })

  it('replans the prescription BEFORE any actual is merged in', () => {
    derivePlanWeeks(fullInput())
    const firstActual = Math.min(
      calls.indexOf('strava'), calls.indexOf('garminDetail'), calls.indexOf('apple'))
    expect(calls.indexOf('replan')).toBeLessThan(firstActual)
  })

  it('layers actuals poorest-source-first so the richest wins', () => {
    derivePlanWeeks(fullInput())
    expect(calls.indexOf('strava')).toBeLessThan(calls.indexOf('garminDetail'))
    expect(calls.indexOf('garminDetail')).toBeLessThan(calls.indexOf('apple'))
  })

  it("puts the athlete's own manual log above every device source", () => {
    derivePlanWeeks(fullInput())
    expect(calls.indexOf('apple')).toBeLessThan(calls.indexOf('manualLog'))
  })

  it('rezones LAST, so it catches text the earlier layers wrote', () => {
    derivePlanWeeks(fullInput())
    expect(calls[calls.length - 1]).toBe('rezone')
  })
})

describe('the source gates', () => {
  it('skips Strava when it is hidden', () => {
    derivePlanWeeks(fullInput({ showStrava: false }))
    expect(calls).not.toContain('strava')
  })

  it('skips Strava when there are no activities', () => {
    derivePlanWeeks(fullInput({ stravaActivities: [] }))
    expect(calls).not.toContain('strava')
  })

  it('skips Garmin detail when the watch is not connected', () => {
    derivePlanWeeks(fullInput({ garminConnected: false }))
    expect(calls).not.toContain('garminDetail')
  })

  it('skips Garmin detail when no days have detail', () => {
    derivePlanWeeks(fullInput({ garminActivityDetails: {} }))
    expect(calls).not.toContain('garminDetail')
  })

  it('skips Apple when there is nothing to merge', () => {
    derivePlanWeeks(fullInput({ appleActivities: [] }))
    expect(calls).not.toContain('apple')
  })

  it('still runs the four plan layers and rezone with every source off', () => {
    derivePlanWeeks(fullInput({
      showStrava: false, garminConnected: false, appleActivities: [],
    }))
    expect(calls).toEqual(['swaps', 'edits', 'locks', 'replan', 'manualLog', 'rezone'])
  })
})

describe('the pipeline is threaded, not branched', () => {
  it('feeds each layer the previous layer’s output', () => {
    // A layer that returned its input instead of the accumulator would break
    // silently — every transform here is identity-shaped, so only the
    // threading itself is under test.
    const seen: TrainingWeek[][] = []
    const stage = (n: number) => (w: TrainingWeek[]) => {
      seen.push(w)
      return [{ num: n, days: [] }] as unknown as TrainingWeek[]
    }
    derivePlanWeeks({
      ...fullInput(),
      applySwaps: stage(10),
      applyEdits: stage(20),
      applyLocks: stage(30),
      applyReplans: stage(40),
      showStrava: false,
      garminConnected: false,
      appleActivities: [],
      applyManualLogs: stage(50),
    })
    expect(seen[0]).toBe(BASE)
    expect(seen[1][0].num).toBe(10)
    expect(seen[2][0].num).toBe(20)
    expect(seen[3][0].num).toBe(30)
    expect(seen[4][0].num).toBe(40)
  })
})

describe('App.tsx delegates rather than keeping its own copy', () => {
  // The point of the extraction is that there is ONE pipeline. A second copy
  // inlined back into the component would pass every test above while the
  // app ran a different order.
  it('calls derivePlanWeeks for its weeks memo', () => {
    expect(appSrc).toContain('derivePlanWeeks({')
  })

  it('no longer applies the merge transforms itself', () => {
    for (const fn of [
      'matchActivitiesToPlan(',
      'mergeGarminDetailIntoWeeks(',
      'mergeAppleActivitiesIntoWeeks(',
      'rezoneWeeks(',
    ]) {
      expect(appSrc, `${fn} is applied in App.tsx — the pipeline has been re-inlined`)
        .not.toContain(fn)
    }
  })
})
