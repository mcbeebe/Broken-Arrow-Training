/**
 * What the coach sees of the benchmark log: the newest of each series with
 * its age and retest status, the entry count, and the kinds this plan
 * accepts — or null when nothing is measured.
 */
import { describe, it, expect } from 'vitest'
import { buildCoachBenchmarkContext } from '../../../engines/benchmark/coachContext'
import type { Benchmark } from '../../../engines/benchmark/log'

const live: Benchmark[] = [
  { id: 'b2', kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-08-30', source: 'manual', at: 2, protocol: 'parkrun' },
  { id: 'b1', kind: 'race_5k', value: 1335, unit: 'seconds', dateIso: '2026-05-02', source: 'derived', at: 1 },
  { id: 'l1', kind: 'lthr', value: 168, unit: 'bpm', dateIso: '2026-06-03', source: 'logged', at: 3 },
  { id: 'm1', kind: 'other', label: 'Murph', value: 50 * 60, unit: 'seconds', dateIso: '2026-06-01', source: 'manual', at: 4 },
]

describe('buildCoachBenchmarkContext', () => {
  it('lists the newest of each series with age, retest status, protocol and entry count', () => {
    const ctx = buildCoachBenchmarkContext(live, 'road', '2026-09-17')!
    expect(ctx.current).toEqual([
      { kind: 'race_5k', label: '5K', value: '21:40', dateIso: '2026-08-30', weeksOld: 2, stale: false, protocol: 'parkrun', entries: 2 },
      { kind: 'lthr', label: 'Threshold HR', value: '168 bpm', dateIso: '2026-06-03', weeksOld: 15, stale: true, entries: 1 },
      { kind: 'other', label: 'Murph', value: '50:00', dateIso: '2026-06-01', weeksOld: 15, stale: false, entries: 1 },
    ])
    expect(ctx.kinds.map(k => k.kind)).toContain('race_5k')
    expect(ctx.kinds.map(k => k.kind)).not.toContain('ski_erg_1k')  // hyrox-only preset
    expect(ctx.kinds.find(k => k.kind === 'lthr')).toEqual({ kind: 'lthr', label: 'Threshold HR', unit: 'bpm' })
  })

  it('is null with nothing measured, and ignores tombstones', () => {
    expect(buildCoachBenchmarkContext([], 'road', '2026-09-17')).toBeNull()
    expect(buildCoachBenchmarkContext([{ ...live[0], deleted: true }], 'road', '2026-09-17')).toBeNull()
  })
})
