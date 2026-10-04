/**
 * The Today briefing's recent-training lines describe sessions, not load
 * totals: a rest day carrying soreness from yesterday's strength session
 * is not "yesterday's workout".
 */
import { describe, it, expect } from 'vitest'
import { recentLoadLines } from '../utils/briefingLoad'
import type { DailyTRIMP, TRIMPRecord } from '../types'

const TODAY = '2026-10-04'
const iso = (daysAgo: number) => {
  const d = new Date(`${TODAY}T12:00:00`)
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const rec = (name: string, sport: string, load: number): TRIMPRecord => ({
  date: '', activityName: name, sportType: sport as TRIMPRecord['sportType'],
  baseTRIMP: load, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: load,
})
const session = (daysAgo: number, ...records: TRIMPRecord[]): DailyTRIMP => ({
  date: iso(daysAgo), total: records.reduce((t, r) => t + r.adjustedTRIMP, 0), records,
})
/** Load with no session behind it: soreness carried forward or checked in. */
const carried = (daysAgo: number, total: number): DailyTRIMP => ({ date: iso(daysAgo), total, records: [] })

describe('recentLoadLines', () => {
  it('says nothing about a rest day that only carries soreness', () => {
    // Field bug: a 200-load carry on a rest day read as a heavy workout.
    expect(recentLoadLines([carried(1, 200), carried(2, 120), carried(3, 90)], TODAY)).toEqual([])
  })

  it('describes yesterday by the session’s own load, not the soreness it inherits', () => {
    // 60 of the 150 is carry from the day before; the run itself was 90.
    const day: DailyTRIMP = { ...session(1, rec('Tempo', 'running', 90)), total: 150 }
    expect(recentLoadLines([day], TODAY)).toEqual([
      "Yesterday's running (90 load) is factoring into today's recovery.",
    ])
  })

  it('names the session with the most load, not the first one recorded', () => {
    const lines = recentLoadLines([session(1, rec('Commute', 'ebike', 8), rec('Long run', 'running', 160))], TODAY)
    expect(lines).toEqual(["Yesterday's running was a heavy session (168 load) — that's adding to today's fatigue."])
  })

  it('keeps the DOMS lines for strength across the three days', () => {
    const lines = recentLoadLines([
      session(1, rec('Lower body', 'strength_lower', 70)),
      session(2, rec('Full body', 'strength_full', 60)),
      session(3, rec('Steep hike', 'hiking_steep', 95)),
    ], TODAY)
    expect(lines).toEqual([
      "Yesterday's strength lower (70 load) is causing delayed muscle soreness (DOMS) — this peaks today and tomorrow, adding to your fatigue.",
      'Strength full from 2 days ago is still causing DOMS — muscle soreness typically peaks at 24-48 hours.',
      'Hiking steep from 3 days ago may still have residual DOMS effects.',
    ])
  })

  it('counts calendar days across a daylight-saving change', () => {
    // US clocks go back on 2026-11-01: that Sunday is 25 hours long.
    const lines = recentLoadLines(
      [{ date: '2026-11-01', total: 120, records: [rec('Long run', 'running', 120)] }],
      '2026-11-02',
    )
    expect(lines).toEqual(["Yesterday's running (120 load) is factoring into today's recovery."])
  })

  it('stays quiet for light days', () => {
    expect(recentLoadLines([session(1, rec('Easy spin', 'cycling', 40)), session(2, rec('Easy run', 'running', 60))], TODAY)).toEqual([])
  })
})
