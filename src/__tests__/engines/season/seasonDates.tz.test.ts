import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { raceDateToIso } from '../../../engines/season'
import { planSeason } from '../../../engines/season/planSeason'
import type { SeasonRace } from '../../../types'

// vitest runs on Node, but the app tsconfig carries no Node types —
// reach process.env through globalThis for the TZ switch.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env


/**
 * P0 field bug: `new Date("YYYY-MM-DD")` parses a bare ISO date as UTC
 * MIDNIGHT; reading local components back shifted every season date one
 * day EARLY for athletes west of UTC — the recovery block started ON race
 * day (overwriting the race card) and the second race's whole build ran
 * Fri→Thu. CI runs in UTC where the bug is invisible, so this suite pins
 * the process TZ to both sides of UTC. Vitest's forks pool isolates test
 * files per process, so mutating env.TZ here can't leak.
 */

function race(id: string, name: string, dateIso: string, priority: 'A' | 'B' | 'C' = 'A', extra: Partial<SeasonRace['raceInfo']> = {}): SeasonRace {
  return {
    id,
    priority,
    status: 'upcoming',
    raceInfo: {
      name,
      date: dateIso,
      startTime: '8:00 AM',
      distance: extra.distance ?? 'Half Marathon',
      distanceMiles: extra.distanceMiles ?? 13.1,
      elevation: '', elevationRange: '', course: '', cutoff: '',
      landmarks: [], gear: [], nutrition: '',
      ...extra,
    },
  }
}

describe('season dates under America/Los_Angeles (west of UTC)', () => {
  let savedTz: string | undefined

  beforeAll(() => {
    savedTz = env.TZ
    env.TZ = 'America/Los_Angeles'
  })
  afterAll(() => {
    if (savedTz === undefined) delete env.TZ
    else env.TZ = savedTz
  })

  it('CANARY: this runner honors env.TZ (suite is not vacuous)', () => {
    // Under LA time, UTC midnight of 10/24 is still 10/23 locally. If this
    // fails, the runner ignored the TZ switch and every green result below
    // would be meaningless — fail loudly instead.
    expect(new Date('2026-10-24').getDate()).toBe(23)
  })

  it('raceDateToIso returns bare ISO dates unchanged (never a day early)', () => {
    expect(raceDateToIso('2026-10-24')).toBe('2026-10-24')
    expect(raceDateToIso('2026-12-12')).toBe('2026-12-12')
    expect(raceDateToIso('2026-01-01')).toBe('2026-01-01')
  })

  it('raceDateToIso still parses long-form dates and rejects garbage', () => {
    expect(raceDateToIso('Saturday, October 24, 2026')).toBe('2026-10-24')
    expect(raceDateToIso('someday soon')).toBeNull()
  })

  it('planSeason: recovery starts the day AFTER the race; race blocks land on the real dates', () => {
    const result = planSeason(
      [race('half', 'Oakland Hills Half Marathon', '2026-10-24'), race('hyrox', 'Hyrox - Anaheim', '2026-12-12', 'A', { distance: 'Hyrox', description: 'Hyrox open' })],
      '2026-07-08',
    )
    const blocks = result.season.blocks
    const raceBlocks = blocks.filter(b => b.kind === 'RACE')
    expect(raceBlocks.map(b => b.startDate)).toEqual(['2026-10-24', '2026-12-12'])

    const recover = blocks.find(b => b.kind === 'RECOVER')
    expect(recover?.startDate).toBe('2026-10-25')
  })
})

describe('season dates under Asia/Tokyo (east of UTC)', () => {
  let savedTz: string | undefined

  beforeAll(() => {
    savedTz = env.TZ
    env.TZ = 'Asia/Tokyo'
  })
  afterAll(() => {
    if (savedTz === undefined) delete env.TZ
    else env.TZ = savedTz
  })

  it('bare ISO dates are unchanged east of UTC too', () => {
    expect(raceDateToIso('2026-10-24')).toBe('2026-10-24')
    expect(raceDateToIso('2026-12-12')).toBe('2026-12-12')
  })
})
