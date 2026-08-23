/**
 * Hyrox finish-time projection (Phase 4, PR 10) — evidence priority
 * (sim > benchmark > run fitness > typical), the honest confidence
 * bands, and the refusal to project from population averages alone.
 */
import { describe, it, expect } from 'vitest'
import type { TrainingWeek, ActualWorkout } from '../types'
import { projectHyroxFinish, latestSimEvidence, formatFinish } from '../engines/hyrox/projection'
import type { OnboardingConfig } from '../hooks/useOnboarding'

function simDay(date: string, splits: NonNullable<ActualWorkout['stationSplits']>): TrainingWeek['days'][number] {
  return {
    day: 'Sat', type: 'long', workout: 'HALF SIMULATION: 4 runs + 4 stations',
    detail: '', zone: '—', route: 'Gym', time: '~60 min',
    actual: {
      stravaId: Date.parse(date), source: 'manual', distance: 2.49, movingTime: 3600,
      elapsedTime: 3600, elevationGain: 0, type: 'workout',
      name: `Half simulation`, startDate: `${date}T08:00:00`, stationSplits: splits,
    },
  }
}

function week(num: number, days: TrainingWeek['days']): TrainingWeek {
  return { num, dates: '', miles: 0, focus: 'Build', days }
}

const halfSimSplits: NonNullable<ActualWorkout['stationSplits']> = [
  { label: 'Run 1 — 1 km', kind: 'run', sec: 300 },
  { label: 'SkiErg — 1000 m', kind: 'station', sec: 250 },
  { label: 'Run 2 — 1 km', kind: 'run', sec: 310 },
  { label: 'Sled push — 50 m @ 152 kg', kind: 'station', sec: 170 },
  { label: 'Run 3 — 1 km', kind: 'run', sec: 320 },
  { label: 'Sled pull — 50 m @ 103 kg', kind: 'station', sec: 230 },
  { label: 'Run 4 — 1 km', kind: 'run', sec: 330 },
  { label: 'Burpee broad jumps — 80 m', kind: 'station', sec: 280 },
]

const hyroxConfig = {
  raceType: 'hyrox', experienceLevel: 'intermediate', trainingDaysPerWeek: 4,
  wearable: 'garmin', athleteName: 'Mike', age: 45,
} as OnboardingConfig

describe('latestSimEvidence', () => {
  it('finds the newest run+station split set and averages the run legs', () => {
    const weeks = [week(6, [simDay('2026-08-29', halfSimSplits)])]
    const ev = latestSimEvidence(weeks)!
    expect(ev.date).toBe('2026-08-29')
    expect(ev.runLegSec).toBe(315) // (300+310+320+330)/4
    expect(ev.runLegsMeasured).toBe(4)
    expect(ev.stationSec.skierg).toBe(250)
    expect(ev.stationSec.wall_balls).toBeUndefined()
  })

  it('ignores circuit-only splits — stations without runs are not a sim', () => {
    const circuit = week(3, [{
      ...simDay('2026-08-14', [
        { label: 'SkiErg — round 1', kind: 'station', sec: 64 },
        { label: 'Wall balls — round 1', kind: 'station', sec: 58 },
      ]),
    }])
    expect(latestSimEvidence([circuit])).toBeNull()
  })
})

describe('projectHyroxFinish', () => {
  it('returns null when nothing personal informs it', () => {
    expect(projectHyroxFinish({ weeks: [], config: hyroxConfig })).toBeNull()
  })

  it('a half sim drives runs and 4 stations; typicals fill the rest with a wider band', () => {
    const p = projectHyroxFinish({
      weeks: [week(6, [simDay('2026-08-29', halfSimSplits)])],
      config: hyroxConfig,
    })!
    const runs = p.segments.find(s => s.key === 'runs')!
    expect(runs.source).toBe('sim')
    expect(runs.sec).toBe(315 * 8)
    expect(p.segments.find(s => s.key === 'skierg')!.source).toBe('sim')
    expect(p.segments.find(s => s.key === 'wall_balls')!.source).toBe('typical')
    // Sim-based: transitions already inside the splits — no roxzone line.
    expect(p.segments.find(s => s.key === 'roxzone')).toBeUndefined()
    expect(p.confidence).toBe('medium')
    // Race-day freshness discount applies to the sim-based total.
    const raw = p.segments.reduce((n, s) => n + s.sec, 0)
    expect(p.totalSec).toBe(Math.round(raw * 0.97))
    expect(p.lowSec).toBeLessThan(p.totalSec)
    expect(p.highSec).toBeGreaterThan(p.totalSec)
  })

  it('without a sim, benchmarks + run anchor build the parts and add roxzone', () => {
    const p = projectHyroxFinish({
      weeks: [],
      config: {
        ...hyroxConfig,
        skiErg1kSeconds: 240,
        row1kSeconds: 230,
        fitnessAnchor: { type: 'race_10k', valueSeconds: 50 * 60 },
      } as OnboardingConfig,
      capacity: { measuredAt: '2026-08-01', wallBallsUnbroken: 20, sledRpe: 6 },
    })!
    expect(p.segments.find(s => s.key === 'runs')!.source).toBe('run-fitness')
    expect(p.segments.find(s => s.key === 'skierg')!.sec).toBe(258)
    expect(p.segments.find(s => s.key === 'row')!.sec).toBe(248)
    // Wall balls: 12/set → 9 sets → 100×2.2 + 8×12 = 316.
    expect(p.segments.find(s => s.key === 'wall_balls')!.sec).toBe(316)
    expect(p.segments.find(s => s.key === 'sled_push')!.sec).toBe(180)
    expect(p.segments.find(s => s.key === 'roxzone')).toBeDefined()
    expect(p.confidence).toBe('medium')
    expect(p.basis.join(' ')).toMatch(/fitness anchor/)
  })

  it('run anchor alone projects at low confidence with the widest band', () => {
    const p = projectHyroxFinish({
      weeks: [],
      config: { ...hyroxConfig, fitnessAnchor: { type: 'race_10k', valueSeconds: 50 * 60 } } as OnboardingConfig,
    })!
    expect(p.confidence).toBe('low')
    expect(p.highSec - p.lowSec).toBeGreaterThanOrEqual(Math.round(p.totalSec * 0.19))
    expect(p.basis.join(' ')).toMatch(/typical age-group/)
  })

  it('formatFinish renders h:mm:ss past the hour', () => {
    expect(formatFinish(5070)).toBe('1:24:30')
    expect(formatFinish(3500)).toBe('58:20')
  })
})
