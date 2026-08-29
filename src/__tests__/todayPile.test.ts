/**
 * P3 — the pile comes down.
 *
 * Today opened with a coherence banner, a race countdown card and a season
 * race list before it said anything about today. The countdown rendered
 * twice in the app. None of that information is lost; it moved to where it
 * belongs, and the page now leads with the answer.
 */
import { describe, it, expect } from 'vitest'

const src = (glob: Record<string, unknown>) => Object.values(glob)[0] as string
const SUMMARY = src(import.meta.glob('../components/Summary.tsx', { query: '?raw', import: 'default', eager: true }))
const PLAN = src(import.meta.glob('../components/WeeklyPlan.tsx', { query: '?raw', import: 'default', eager: true }))
const APP = src(import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }))

describe('what left Today', () => {
  it('no longer opens with the race countdown card or the season list', () => {
    expect(SUMMARY).not.toMatch(/<RaceCard/)
    expect(SUMMARY).not.toMatch(/<SeasonRacesCard/)
  })

  it('no longer renders the full-width coherence banner', () => {
    // It named the disagreement without saying what to do about it.
    expect(SUMMARY).not.toMatch(/<SignalCoherenceBanner/)
  })
})

describe('where it went', () => {
  it('puts the countdown card and the season list in Plan', () => {
    expect(PLAN).toMatch(/<RaceCard/)
    expect(PLAN).toMatch(/<SeasonRacesCard/)
  })

  it('keeps the coherence reading as a line inside the Verdict card', () => {
    // Moved, not deleted: the athlete still learns the axes disagree, and
    // now also learns what today's call is.
    expect(APP).toMatch(/signals: trainingSignals/)
  })
})

describe('the countdown renders once', () => {
  it('lives in the app header and nowhere else on Today', () => {
    const inHeader = /\{daysUntilRace\} days/.test(APP)
    expect(inHeader).toBe(true)
    expect(SUMMARY).not.toMatch(/daysUntilRace/)
  })
})

describe('the rhythm strip', () => {
  it('is the header line on Today, and only on Today', () => {
    expect(APP).toMatch(/view === 'today' && rhythm\.length > 0/)
  })
})
