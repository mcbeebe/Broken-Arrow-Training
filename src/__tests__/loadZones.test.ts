/**
 * The load-zone table and the contract that every surface reads from it.
 *
 * Field bug (2026-09-20): a Load Ratio of 1.27 read "Sweet Spot · Safe
 * zone" on one card and "Injury Risk Alert · Deload this week" on the
 * next; a Recovery Balance of −13.2 sat inside the chart's "Training
 * Zone" while its card said "Overreaching". These tests pin the one
 * story per number.
 */
import { describe, it, expect } from 'vitest'
import {
  TSB_ZONES, TSB_BOUNDS, TSB_BANDS, ACWR_BOUNDS, RAMP_ALERT,
  tsbZone, acwrZone, acwrZones, acwrBoundsFrom,
} from '../utils/loadZones'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import { classifyLoad, buildTrainingSignals, todaysCallSentence } from '../utils/trainingSignals'
import { checkInjuryRisk, checkACWRAcceleration } from '../utils/readiness'
import { DEFAULT_READINESS_TUNING } from '../utils/engineConfig'
import type { PerformanceMetrics, ReadinessScore } from '../types'

const perf = (tsb: number, acwr: number): PerformanceMetrics => ({ date: '2026-09-20', ctl: 48.7, atl: 61.9, tsb, acwr })

function readiness(status: ReadinessScore['status']): ReadinessScore {
  return {
    date: '2026-09-20', status,
    composite: status === 'PEAK' ? 1.5 : status === 'GREEN' ? 0.5 : status === 'YELLOW' ? 0 : -0.5,
    displayScore: status === 'RED' ? 40 : 70,
    components: { hrv: 0, rhr: 0, sleep: 0, load: 0, battery: 0 },
    trainingState: status === 'RED' ? 'C' : 'A',
    reasons: [],
  } as unknown as ReadinessScore
}

/** A ramp that mirrors the field report: 1.13 three days ago, 1.27 now,
 *  faster than the four days before it. Eight points, the check's minimum. */
function rampingSeries(now: number, threeDaysAgo = now - 0.14): PerformanceMetrics[] {
  const t = threeDaysAgo
  const acwrs = [t - 0.07, t - 0.05, t - 0.03, t - 0.02, t, t + 0.05, t + 0.1, now]
  return acwrs.map((acwr, i) => ({ date: `2026-09-${13 + i}`, ctl: 48, atl: 48 * acwr, tsb: -13, acwr }))
}

describe('the table', () => {
  it('covers every recovery balance without gaps or overlaps, in order', () => {
    const seen: string[] = []
    for (let tsb = 40; tsb >= -50; tsb -= 0.5) {
      const key = tsbZone(tsb).key
      if (seen[seen.length - 1] !== key) seen.push(key)
    }
    expect(seen).toEqual(TSB_ZONES.map(z => z.key))
  })

  it('draws the band lines exactly at the table\'s bounds', () => {
    expect(tsbZone(TSB_BOUNDS.steady).key).toBe('steady')
    expect(tsbZone(TSB_BOUNDS.steady - 0.01).key).toBe('build')
    expect(tsbZone(TSB_BOUNDS.build).key).toBe('build')
    expect(tsbZone(TSB_BOUNDS.build - 0.01).key).toBe('overreaching')
    expect(TSB_BANDS.build).toMatchObject({ y1: TSB_BOUNDS.build, y2: TSB_BOUNDS.steady, label: 'Build zone' })
    expect(TSB_BANDS.overreachingLine.y).toBe(TSB_BOUNDS.build)
  })

  it('the athlete\'s −13.2 is the build zone: neutral, one word, on the chart and the card alike', () => {
    const z = tsbZone(-13.2)
    expect(z.key).toBe('build')
    expect(z.label).toBe(TSB_BANDS.build.label)
    expect(z.tone).toBe('neutral')
    expect(z.note).toMatch(/Back off only if Readiness agrees/)
  })

  it('"Overreaching" is the word for below −30 and nothing else', () => {
    expect(TSB_ZONES.filter(z => /overreach/i.test(z.label)).map(z => z.key)).toEqual(['overreaching'])
    expect(tsbZone(-31).label).toBe('Overreaching')
    expect(tsbZone(-31).tone).toBe('critical')
  })

  it('load ratio: in range up to 1.3 inclusive, ramping to 1.5, spike above', () => {
    expect(acwrZone(0.79).key).toBe('detraining')
    expect(acwrZone(0.8).key).toBe('in_range')
    expect(acwrZone(1.27).key).toBe('in_range')
    expect(acwrZone(1.3).key).toBe('in_range')
    expect(acwrZone(1.31).key).toBe('ramping')
    expect(acwrZone(1.5).key).toBe('ramping')
    expect(acwrZone(1.51).key).toBe('spike')
  })

  it('tuned bounds move the lines and the printed ranges together', () => {
    const b = acwrBoundsFrom({ acwrSweetTop: 1.2, acwrDanger: 1.4 })
    expect(acwrZone(1.25, b).key).toBe('ramping')
    expect(acwrZones(b).find(z => z.key === 'in_range')!.range).toBe('0.8 to 1.2')
    expect(acwrBoundsFrom(null)).toEqual({ low: 0.8, sweetTop: 1.3, danger: 1.5 })
  })
})

describe('every surface reads the same table', () => {
  it('the performance model\'s readers are the table', () => {
    for (let tsb = 30; tsb >= -40; tsb -= 1) {
      expect(getTSBState(tsb)).toBe(tsbZone(tsb).key)
      expect(getTSBLabel(getTSBState(tsb))).toBe(tsbZone(tsb).label)
    }
    for (let acwr = 0.5; acwr <= 2; acwr += 0.05) {
      expect(getACWRRisk(acwr)).toBe(acwrZone(acwr).key)
      expect(getACWRLabel(getACWRRisk(acwr))).toBe(acwrZone(acwr).label)
    }
  })

  it('the training-signals load axis draws its danger line where the card does', () => {
    expect(classifyLoad(perf(TSB_BOUNDS.build, 1.0)).state).toBe('build')
    expect(classifyLoad(perf(TSB_BOUNDS.build - 0.01, 1.0)).state).toBe('danger')
    expect(classifyLoad(perf(0, ACWR_BOUNDS.sweetTop)).state).toBe('balanced')
    expect(classifyLoad(perf(0, ACWR_BOUNDS.sweetTop + 0.01)).state).toBe('ramping')
    expect(classifyLoad(perf(0, ACWR_BOUNDS.danger + 0.01)).state).toBe('danger')
  })

  it('the build zone is neutral on the load axis — the body decides', () => {
    const load = classifyLoad(perf(-13.2, 1.27))
    expect(load.state).toBe('build')
    expect(load.label).toBe('Build zone')
    expect(load.severity).toBe(0)
  })

  it('the ramp alert can never say "deload" while the card says "in range"', () => {
    // Sweep the level the alert fires at; whatever the card's tone is
    // "good", the alert is a heads-up, and its message holds volume.
    for (let now = RAMP_ALERT.levelFloor + 0.01; now <= 1.8; now += 0.02) {
      const flags = checkInjuryRisk([], rampingSeries(now), undefined, undefined, undefined, DEFAULT_READINESS_TUNING)
      const ramp = flags.find(f => f.id === 'acwr_accel')
      expect(ramp, `no ramp flag at ${now}`).toBeTruthy()
      const card = acwrZone(now)
      if (card.tone === 'good') {
        expect(ramp!.severity).toBe('warning')
        expect(ramp!.message).toMatch(/Still in range/)
        expect(ramp!.message).not.toMatch(/deload/i)
      } else {
        expect(ramp!.severity).toBe('alert')
      }
      if (card.key === 'spike') expect(ramp!.message).toMatch(/Deload/)
    }
  })

  it('the ramp alert shows the change, not the level', () => {
    const accel = checkACWRAcceleration(rampingSeries(1.27))
    expect(accel).toMatchObject({ accelerating: true, acwrNow: 1.27, rise3d: 0.14 })
    const [ramp] = checkInjuryRisk([], rampingSeries(1.27))
    expect(ramp.title).toBe('Load ramping fast')
    expect(ramp.metric).toBe('+0.14 in 3 d')
    expect(ramp.message).toBe('Your load ratio rose from 1.13 to 1.27 in three days. Still in range. Hold this week\'s volume flat; a rise past 1.3 is when to trim it.')
  })

  it('a tuned in-range top moves the alert\'s severity with it', () => {
    const beginner = { ...DEFAULT_READINESS_TUNING, acwrSweetTop: 1.2, acwrDanger: 1.4 }
    const [ramp] = checkInjuryRisk([], rampingSeries(1.27), undefined, undefined, undefined, beginner)
    expect(ramp.severity).toBe('alert')
    expect(ramp.message).toMatch(/now above 1\.2/)
  })
})

describe('today\'s call — the one sentence the cards agree with', () => {
  it('September 20: in range but climbing, body not absorbing it → easy day', () => {
    const signals = buildTrainingSignals({
      performance: perf(-13.2, 1.27),
      readiness: readiness('RED'),
      rampAlert: true,
    })
    expect(signals.load.state).toBe('build')
    expect(signals.rampAlert).toBe(true)
    expect(signals.todayCall).toBe('rest')
    expect(todaysCallSentence(signals)).toBe('Load is in the build zone but climbing fast, and your body needs rest.')
  })

  it('a quiet build week with a recovered body is aligned, not "mixed signals"', () => {
    const signals = buildTrainingSignals({ performance: perf(-13.2, 1.1), readiness: readiness('GREEN') })
    expect(signals.coherence).toBe('aligned')
    expect(signals.todayCall).toBe('train')
    expect(todaysCallSentence(signals)).toBe('Load is in the build zone, and your body is recovered.')
  })

  it('a fast ramp on a fine day lifts the load axis to "monitor", never past it', () => {
    const signals = buildTrainingSignals({ performance: perf(0, 1.27), readiness: readiness('GREEN'), rampAlert: true })
    expect(signals.load.severity).toBe(1)
    expect(signals.load.label).toBe('Balanced · climbing fast')
    expect(signals.todayCall).toBe('monitor')
    expect(signals.reason).toMatch(/climbing fast/)
  })
})
