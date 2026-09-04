import { describe, it, expect } from 'vitest'
import {
  assembleAdditionalRaces, parseErgSeconds, formatSecondsLabel,
  defaultDetailLevel, isRealMenopauseStage, newSeasonRaceRow,
  type SeasonRaceRow,
} from '../components/onboarding/helpers'

/**
 * assembleAdditionalRaces feeds BOTH the final submit and the live preview, so
 * a disagreement between the two would show the athlete one season and build
 * another. It decides which races reach the season engine at all, whether each
 * is a Hyrox, which division it runs, and whether a "layered" request survives.
 */

const row = (over: Partial<SeasonRaceRow> = {}): SeasonRaceRow =>
  ({ ...newSeasonRaceRow(), name: 'Spring 50K', date: '2026-05-16', ...over })

const args = (over: Partial<Parameters<typeof assembleAdditionalRaces>[0]> = {}) => ({
  raceType: 'trail' as const,
  goalMode: 'season' as const,
  seasonRaces: [] as SeasonRaceRow[],
  primaryKey: 'anchor' as const,
  extraRaceName: '', extraRaceDate: '', extraRacePriority: 'B' as const,
  extraRaceMiles: '', extraRaceVertFt: '', extraRaceDescription: '',
  ...over,
})

describe('assembleAdditionalRaces — season mode', () => {
  it('general fitness has no additional races at all', () => {
    expect(assembleAdditionalRaces(args({
      raceType: 'general', seasonRaces: [row()],
    }))).toBeUndefined()
  })

  it('drops rows the athlete started but never finished', () => {
    // A half-typed row must not reach the engine as a real race.
    const rows = [row({ name: '  ' }), row({ date: '' }), row({ name: 'Real Race' })]
    const out = assembleAdditionalRaces(args({ seasonRaces: rows }))
    expect(out?.map(r => r.name)).toEqual(['Real Race'])
  })

  it('returns undefined rather than an empty list when nothing is complete', () => {
    expect(assembleAdditionalRaces(args({ seasonRaces: [row({ name: '' })] }))).toBeUndefined()
  })

  it('the main goal is a full A regardless of the row\'s own chip', () => {
    const goal = row({ name: 'Goal', priority: 'C' })
    const other = row({ name: 'Tune-up', priority: 'C' })
    const out = assembleAdditionalRaces(args({
      seasonRaces: [goal, other], primaryKey: goal.key,
    }))
    expect(out?.find(r => r.name === 'Goal')).toMatchObject({ priority: 'A', isPrimary: true })
    expect(out?.find(r => r.name === 'Tune-up')).toMatchObject({ priority: 'C' })
    expect(out?.find(r => r.name === 'Tune-up')?.isPrimary).toBeUndefined()
  })

  it('parses miles and rounds vert, dropping blanks and zeroes', () => {
    const out = assembleAdditionalRaces(args({
      seasonRaces: [row({ miles: '31.07', vertFt: '5432.6' }), row({ name: 'B', miles: '', vertFt: '0' })],
    }))
    expect(out?.[0]).toMatchObject({ distanceMiles: 31.07, elevationGainFt: 5433 })
    expect(out?.[1].distanceMiles).toBeUndefined()
    expect(out?.[1].elevationGainFt).toBeUndefined()
  })

  it('infers Hyrox from the name when no chip was tapped', () => {
    // A row named "Hyrox LA" must route correctly without a tap.
    const out = assembleAdditionalRaces(args({
      seasonRaces: [row({ name: 'Hyrox LA', format: null, hyroxDivision: 'pro' })],
    }))
    expect(out?.[0].format).toBe('hyrox')
    expect(out?.[0].hyroxDivision).toBe('pro')
  })

  it('never seeds a format the athlete did not choose', () => {
    const out = assembleAdditionalRaces(args({ seasonRaces: [row({ name: 'Spring 50K' })] }))
    expect(out?.[0].format).toBeUndefined()
    // Division only travels with a Hyrox — the sleds differ by ~50 kg, so
    // carrying it onto a trail race would be meaningless noise.
    expect(out?.[0].hyroxDivision).toBeUndefined()
  })

  it('an explicit chip overrides name detection in both directions', () => {
    const asRoad = assembleAdditionalRaces(args({
      seasonRaces: [row({ name: 'Hyrox LA', format: 'road' })],
    }))
    expect(asRoad?.[0].format).toBe('road')
    expect(asRoad?.[0].hyroxDivision).toBeUndefined()

    const asHyrox = assembleAdditionalRaces(args({
      seasonRaces: [row({ name: 'Spring 50K', format: 'hyrox', hyroxDivision: 'pro' })],
    }))
    expect(asHyrox?.[0].hyroxDivision).toBe('pro')
  })

  it('a non-Hyrox race always runs sequential — the only defined behaviour', () => {
    const out = assembleAdditionalRaces(args({
      seasonRaces: [row({ name: 'Spring 50K', integration: 'layered' })],
    }))
    expect(out?.[0].integration).toBe('sequential')
  })

  it('honours a layered Hyrox when the anchor can carry it', () => {
    const out = assembleAdditionalRaces(args({
      raceType: 'trail',
      seasonRaces: [row({ name: 'Hyrox LA', integration: 'layered' })],
    }))
    expect(out?.[0].integration).toBe('layered')
  })

  it('coerces a layered request the anchor cannot carry, rather than storing a lie', () => {
    // The athlete may have chosen "layered" and then gone back and switched
    // their main race to a Hyrox — at which point the choice is hidden from
    // them. Storing a request the transform will silently refuse is worse
    // than coercing it here, where the review screen can show the truth.
    const out = assembleAdditionalRaces(args({
      raceType: 'hyrox',
      seasonRaces: [row({ name: 'Hyrox LA', integration: 'layered' })],
    }))
    expect(out?.[0].integration).toBe('sequential')
  })
})

describe('assembleAdditionalRaces — race mode (the single extra)', () => {
  const raceMode = (over = {}) => args({ goalMode: 'race' as const, ...over })

  it('needs both a name and a date', () => {
    expect(assembleAdditionalRaces(raceMode({ extraRaceName: 'Tune-up' }))).toBeUndefined()
    expect(assembleAdditionalRaces(raceMode({ extraRaceDate: '2026-04-01' }))).toBeUndefined()
  })

  it('carries the typed priority, miles, vert and description through', () => {
    const out = assembleAdditionalRaces(raceMode({
      extraRaceName: '  Tune-up 10K  ', extraRaceDate: '2026-04-01',
      extraRacePriority: 'C', extraRaceMiles: '6.2', extraRaceVertFt: '300.4',
      extraRaceDescription: '  flat and fast  ',
    }))
    expect(out).toEqual([{
      name: 'Tune-up 10K', date: '2026-04-01', priority: 'C',
      distanceMiles: 6.2, elevationGainFt: 300, description: 'flat and fast',
    }])
  })
})

describe('parseErgSeconds — a typo must never become a race target', () => {
  it('accepts a plausible 1 km erg split', () => {
    expect(parseErgSeconds('3:34')).toBe(214)
    expect(parseErgSeconds(' 4:00 ')).toBe(240)
  })

  it('rejects anything outside the 2:00–10:00 window', () => {
    expect(parseErgSeconds('1:59')).toBeUndefined()
    expect(parseErgSeconds('10:01')).toBeUndefined()
  })

  it('rejects malformed input rather than guessing', () => {
    for (const bad of ['', '334', '3:4', '3:456', 'abc', '3.34', '-3:34']) {
      expect(parseErgSeconds(bad), bad).toBeUndefined()
    }
  })
})

describe('formatSecondsLabel', () => {
  it('drops the hour when there is none and pads the rest', () => {
    expect(formatSecondsLabel(214)).toBe('3:34')
    expect(formatSecondsLabel(65)).toBe('1:05')
    expect(formatSecondsLabel(0)).toBe('0:00')
  })

  it('shows hours past the hour mark', () => {
    expect(formatSecondsLabel(3600)).toBe('1:00:00')
    expect(formatSecondsLabel(13565)).toBe('3:46:05')
  })
})

describe('the small derivations', () => {
  it('newer athletes get the simplest view, seasoned ones the fullest', () => {
    expect(defaultDetailLevel('first_timer')).toBe('simple')
    expect(defaultDetailLevel('beginner')).toBe('simple')
    expect(defaultDetailLevel('advanced')).toBe('detailed')
    expect(defaultDetailLevel('elite')).toBe('detailed')
    expect(defaultDetailLevel('intermediate')).toBe('balanced')
    expect(defaultDetailLevel(null)).toBe('balanced')
  })

  it('only a real stage on the continuum carries coach personalization', () => {
    for (const s of ['premenopause', 'perimenopause', 'menopause', 'postmenopause'] as const) {
      expect(isRealMenopauseStage(s), s).toBe(true)
    }
    // The non-answers must not personalize anything.
    for (const s of ['not_applicable', 'prefer_not_to_say'] as const) {
      expect(isRealMenopauseStage(s), s).toBe(false)
    }
    expect(isRealMenopauseStage(null)).toBe(false)
  })
})
