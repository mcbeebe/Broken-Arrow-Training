/**
 * The sheet's "what this changes" comes from the real engines, so a saved
 * benchmark does exactly what the preview said. These pin that the preview
 * moves when the plan would move, stays quiet when it would not, and tells
 * the athlete the two things that would otherwise surprise them: a race
 * outranking their easy pace, and an old result not outranking a new one.
 */
import { describe, it, expect } from 'vitest'
import { previewBenchmark, formatBenchmarkValue } from '../../../engines/benchmark/preview'
import { getMethodById } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { Benchmark } from '../../../engines/benchmark/log'

const daniels = () => getMethodById('daniels')!

function cfg(over: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'Half', raceDate: '2026-11-15', raceDistance: 'half_marathon',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday', wearable: 'garmin',
    athleteName: 'Mike', age: 45, maxHR: 185, completedAt: '2026-05-20T10:00:00Z',
    fitnessAnchor: { type: 'race_5k', valueSeconds: 22 * 60 + 15, dateIso: '2026-05-02' },
    ...over,
  } as OnboardingConfig
}

const seedLog: Benchmark[] = [
  { id: 'seed_race_5k', kind: 'race_5k', value: 22 * 60 + 15, unit: 'seconds', dateIso: '2026-05-02', source: 'derived', at: 1 },
]

const base = { log: seedLog, config: cfg(), capacity: null, weeks: [], method: daniels() }

describe('previewBenchmark — run plans', () => {
  it('a faster 5K moves every pace and says by how much', () => {
    const p = previewBenchmark({ ...base, candidate: { kind: 'race_5k', value: 21 * 60 + 40, unit: 'seconds', dateIso: '2026-09-16', source: 'manual' } })
    expect(p.changesPlan).toBe(true)
    expect(p.lines.some(l => l.startsWith('VDOT'))).toBe(true)
    expect(p.lines.some(l => l.startsWith('Easy:') && l.includes('→'))).toBe(true)
    expect(p.caution).toBeUndefined()
  })
  it('the same 5K again changes nothing the paces read', () => {
    const p = previewBenchmark({ ...base, candidate: { kind: 'race_5k', value: 22 * 60 + 15, unit: 'seconds', dateIso: '2026-09-16', source: 'manual' } })
    expect(p.lines.some(l => l.includes('→'))).toBe(false)
  })
  it('an easy pace is recorded but does not outrank the race — and says so', () => {
    const p = previewBenchmark({ ...base, candidate: { kind: 'easy_pace', value: 9 * 60, unit: 'seconds', dateIso: '2026-09-16', source: 'manual' } })
    expect(p.changesPlan).toBe(false)
    expect(p.caution).toMatch(/race time outranks an easy pace/i)
    expect(p.caution).toContain('22:15')
  })
  it('an older result than the current one is history, not the anchor', () => {
    const p = previewBenchmark({ ...base, candidate: { kind: 'race_5k', value: 20 * 60, unit: 'seconds', dateIso: '2026-03-01', source: 'manual' } })
    expect(p.changesPlan).toBe(false)
    expect(p.caution).toMatch(/older than your current 5K/i)
  })
  it('a tested LTHR moves the HR bands and leaves the pace anchor alone', () => {
    const p = previewBenchmark({ ...base, candidate: { kind: 'lthr', value: 172, unit: 'bpm', dateIso: '2026-09-16', source: 'manual' } })
    expect(p.changesPlan).toBe(true)
    expect(p.lines).toContain('Your pace anchor is untouched.')
    expect(p.lines.some(l => /HR:/.test(l) && l.includes('bpm'))).toBe(true)
  })
  it('a mile time trial or a custom entry is for the coach only', () => {
    const mile = previewBenchmark({ ...base, candidate: { kind: 'mile_tt', value: 330, unit: 'seconds', dateIso: '2026-09-16', source: 'manual' } })
    expect(mile.changesPlan).toBe(false)
    expect(mile.lines[0]).toMatch(/for the coach/i)
    const murph = previewBenchmark({ ...base, candidate: { kind: 'other', label: 'Murph', value: 2890, unit: 'seconds', dateIso: '2026-09-16', source: 'manual' } })
    expect(murph.changesPlan).toBe(false)
  })
})

describe('previewBenchmark — strength and Hyrox', () => {
  it('a strength entry names the load it moves, from not-set or from the previous value', () => {
    const first = previewBenchmark({ ...base, candidate: { kind: 'goblet_squat_8rm', value: 55, unit: 'lb', dateIso: '2026-09-16', source: 'manual' } })
    expect(first.lines[0]).toMatch(/Goblet squat 8RM: not set → 55 lb/)
    const again = previewBenchmark({ ...base, capacity: { measuredAt: '2026-06-03', gobletSquatLb: 50 }, candidate: { kind: 'goblet_squat_8rm', value: 55, unit: 'lb', dateIso: '2026-09-16', source: 'manual' } })
    expect(again.lines[0]).toMatch(/50 lb → 55 lb/)
    expect(again.changesPlan).toBe(true)
  })
  it('a Hyrox erg split states the station target the plan will prescribe', () => {
    const p = previewBenchmark({ ...base, config: cfg({ raceType: 'hyrox', raceDistance: undefined }), method: null, candidate: { kind: 'ski_erg_1k', value: 250, unit: 'seconds', dateIso: '2026-09-16', source: 'manual' } })
    expect(p.changesPlan).toBe(true)
    expect(p.lines.some(l => l.startsWith('SkiErg target') && l.includes('4:20'))).toBe(true)
  })
})

describe('formatBenchmarkValue', () => {
  it('speaks the athlete\'s units', () => {
    expect(formatBenchmarkValue({ kind: 'race_hm', value: 5400 + 61, unit: 'seconds' })).toBe('1:31:01')
    expect(formatBenchmarkValue({ kind: 'race_5k', value: 1300, unit: 'seconds' })).toBe('21:40')
    expect(formatBenchmarkValue({ kind: 'easy_pace', value: 525, unit: 'seconds' })).toBe('8:45 /mi')
    expect(formatBenchmarkValue({ kind: 'lthr', value: 168, unit: 'bpm' })).toBe('168 bpm')
    expect(formatBenchmarkValue({ kind: 'sled_push_rpe', value: 7, unit: 'rpe' })).toBe('RPE 7')
  })
})
