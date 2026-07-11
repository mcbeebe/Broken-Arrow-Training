import { describe, it, expect } from 'vitest'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { normalizeSeasonConfig } from '../utils/seasonConfig'

/**
 * The plan always anchors on the chronologically FIRST race. Field failure:
 * the athlete entered their December Hyrox (the main goal) as "the race"
 * and added an earlier October half — the Hyrox became the anchor and the
 * half was silently dropped by the splice (it only chains AFTER the anchor).
 */

const base = {
  raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-12-05',
  raceDescription: 'First Hyrox, go sub-90', athleteGoal: 'sub-90 Hyrox',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
  athleteName: 'Mike', age: 45, maxHR: 178, planStartDate: '2026-08-03',
  goalMode: 'season', anchorIsPrimary: true, completedAt: '',
} as OnboardingConfig

describe('normalizeSeasonConfig — earliest race anchors the plan', () => {
  it('THE FIELD CASE: an earlier half swaps in as the anchor; the entered Hyrox keeps the main-goal flag', () => {
    const config: OnboardingConfig = {
      ...base,
      additionalRaces: [
        { name: 'Oakland Hills Half Marathon', date: '2026-10-24', priority: 'B', distanceMiles: 13.1, format: 'road', description: 'Rolling road half' },
      ],
    }
    const n = normalizeSeasonConfig(config)
    // The half is now the scalar anchor.
    expect(n.raceName).toBe('Oakland Hills Half Marathon')
    expect(n.raceDate).toBe('2026-10-24')
    expect(n.raceType).toBe('road')
    expect(n.raceDistance).toBe('half_marathon')
    expect(n.raceDescription).toBe('Rolling road half')
    // The plan start survives; the goal time never re-aims.
    expect(n.planStartDate).toBe('2026-08-03')
    expect(n.goalRaceTimeSeconds).toBeUndefined()
    expect(n.selectedMethodId).toBeUndefined()
    // The entered Hyrox is demoted but keeps the main-goal crown.
    expect(n.anchorIsPrimary).toBe(false)
    const hyrox = n.additionalRaces!.find(r => r.name === 'Hyrox Anaheim')!
    expect(hyrox).toMatchObject({
      date: '2026-12-05', priority: 'A', isPrimary: true,
      format: 'hyrox', integration: 'layered', distanceMiles: 8,
      description: 'First Hyrox, go sub-90',
    })
    // The promoted race left the additional list.
    expect(n.additionalRaces!.some(r => r.name === 'Oakland Hills Half Marathon')).toBe(false)
  })

  it('no-op when the entered race is already the earliest', () => {
    const config: OnboardingConfig = {
      ...base,
      raceType: 'trail', raceName: 'Spring Trail', raceDate: '2026-09-01', raceDistance: 'half_marathon',
      additionalRaces: [{ name: 'Hyrox LA', date: '2026-12-05', priority: 'B', format: 'hyrox' }],
    }
    expect(normalizeSeasonConfig(config)).toBe(config)
  })

  it('no-op on a same-date tie (the entered anchor wins)', () => {
    const config: OnboardingConfig = {
      ...base,
      additionalRaces: [{ name: 'Same Day 10k', date: '2026-12-05', priority: 'C', format: 'road' }],
    }
    expect(normalizeSeasonConfig(config)).toBe(config)
  })

  it('unparseable extra dates are skipped, not promoted', () => {
    const config: OnboardingConfig = {
      ...base,
      additionalRaces: [{ name: 'Someday Race', date: 'TBD', priority: 'B' }],
    }
    expect(normalizeSeasonConfig(config)).toBe(config)
  })

  it('promoting a HYROX clears raceDistance (the MethodSelection gate rule)', () => {
    const config: OnboardingConfig = {
      ...base,
      raceType: 'road', raceName: 'CIM Marathon', raceDate: '2027-04-11', raceDistance: 'marathon',
      goalRaceTimeSeconds: 3 * 3600,
      additionalRaces: [{ name: 'Hyrox LA', date: '2026-11-07', priority: 'B', format: 'hyrox', distanceMiles: 8 }],
    }
    const n = normalizeSeasonConfig(config)
    expect(n.raceType).toBe('hyrox')
    expect(n.raceDistance).toBeUndefined()
    expect(n.goalRaceTimeSeconds).toBeUndefined()
    // The demoted marathon carries its distance and road format.
    const cim = n.additionalRaces!.find(r => r.name === 'CIM Marathon')!
    expect(cim).toMatchObject({ format: 'road', distanceMiles: 26.2, integration: 'sequential' })
  })

  it('a formatless earlier race falls back to hyrox-sniffing, then the entered trail/road type', () => {
    const config: OnboardingConfig = {
      ...base,
      raceType: 'trail', raceName: 'Fall 50k', raceDate: '2026-12-12', raceDistance: '50k',
      additionalRaces: [{ name: 'Tune-up Race', date: '2026-10-10', priority: 'C', distanceMiles: 6.2 }],
    }
    const n = normalizeSeasonConfig(config)
    expect(n.raceType).toBe('trail') // inherits the athlete's entered kind
    expect(n.raceDistance).toBe('10k')
  })

  it("primary recomputation: a starred ROW that gets promoted leaves the anchor as the season's main goal", () => {
    const config: OnboardingConfig = {
      ...base,
      anchorIsPrimary: false,
      additionalRaces: [
        { name: 'Oakland Hills Half', date: '2026-10-24', priority: 'A', isPrimary: true, format: 'road', distanceMiles: 13.1 },
      ],
    }
    const n = normalizeSeasonConfig(config)
    // The starred race became the anchor; no additional race is primary.
    expect(n.raceName).toBe('Oakland Hills Half')
    expect(n.additionalRaces!.some(r => r.isPrimary)).toBe(false)
    expect(n.anchorIsPrimary).toBe(true)
    // The demoted entered race is a stepping stone.
    expect(n.additionalRaces!.find(r => r.name === 'Hyrox Anaheim')).toMatchObject({ priority: 'B' })
  })

  it('race-mode single earlier extra also swaps (legacy capture path)', () => {
    const config: OnboardingConfig = {
      ...base,
      goalMode: 'race', anchorIsPrimary: undefined,
      raceType: 'road', raceName: 'CIM Marathon', raceDate: '2027-04-11', raceDistance: 'marathon',
      additionalRaces: [{ name: 'Clarksburg Half', date: '2026-11-08', priority: 'B', distanceMiles: 13.1 }],
    }
    const n = normalizeSeasonConfig(config)
    expect(n.raceName).toBe('Clarksburg Half')
    // Legacy anchorIsPrimary undefined ⇒ the entered race was the goal.
    expect(n.additionalRaces!.find(r => r.name === 'CIM Marathon')).toMatchObject({ isPrimary: true, priority: 'A' })
  })

  it('no-op without additional races or without a race date', () => {
    expect(normalizeSeasonConfig({ ...base, additionalRaces: undefined })).toEqual({ ...base, additionalRaces: undefined })
    expect(normalizeSeasonConfig({ ...base, raceDate: '', additionalRaces: [{ name: 'X', date: '2026-10-01', priority: 'B' }] }).raceName).toBe(base.raceName)
  })
})
