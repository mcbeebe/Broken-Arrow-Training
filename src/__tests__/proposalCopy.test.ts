/**
 * P15 — the queue must say what the card said.
 *
 * Folding the four calibration cards into the review queue would have been
 * a pure loss if the queue kept its placeholder strings ("Benchmark result
 * ready to apply") while the cards carried the finding and its evidence.
 * The argument is the thing that makes a proposal answerable.
 */
import { describe, it, expect } from 'vitest'
import type { BenchmarkResultAssessment } from '../engines/planGenerator/benchmarkResult'
import type { RecalibrationAssessment } from '../engines/planGenerator/recalibration'
import {
  fmt500, benchmarkTitle, benchmarkConsequence, recalTitle, recalConsequence, recalPercent,
} from '../utils/proposalCopy'

const bench = (over: Partial<BenchmarkResultAssessment> = {}): BenchmarkResultAssessment => ({
  qualifies: true, source: null, isoDate: '2026-08-29', workout: '20 min TT',
  ttAvgHR: 172, observedMaxHR: 181, suggestedLthr: null, suggestedMaxHR: null,
  suggestedErg500Sec: null, suggestedErg1kSec: null, currentMaxHR: 185, currentLthr: 165,
  evidence: ['20 min TT on Aug 29.', 'Average HR 172 over the fastest 20 minutes.'],
  ...over,
})

const recal = (over: Partial<RecalibrationAssessment> = {}): RecalibrationAssessment => ({
  qualifies: true, sessions: [], medianSpeedupFrac: 0.04, suggestedFactor: 0.98,
  evidence: ['Tempo on Aug 12 ran 3% quick.', 'Long run on Aug 16 ran 2% quick.',
             'Threshold on Aug 20 ran 4% quick.', 'A fourth line that should not appear.'],
  ...over,
})

describe('fmt500', () => {
  it('reads as a rowing split', () => {
    expect(fmt500(112)).toBe('1:52 /500m')
    expect(fmt500(120)).toBe('2:00 /500m')
    expect(fmt500(95)).toBe('1:35 /500m')
  })

  it('pads the seconds, so 1:05 never renders as 1:5', () => {
    expect(fmt500(65)).toBe('1:05 /500m')
  })
})

describe('the benchmark proposal', () => {
  it('leads with the threshold read when there is one', () => {
    expect(benchmarkTitle(bench({ suggestedLthr: 168 })))
      .toBe('Your time trial puts your threshold HR at ~168 bpm')
  })

  it('reports a max above the configured one when there is no threshold read', () => {
    expect(benchmarkTitle(bench({ suggestedMaxHR: 191 })))
      .toBe('Your test hit 191 bpm — above your configured max')
  })

  it('falls back to the erg baseline, formatted', () => {
    expect(benchmarkTitle(bench({ suggestedErg500Sec: 112 })))
      .toBe('Erg baseline captured — 1:52 /500m')
  })

  it('prefers the threshold read over the others when several are present', () => {
    const all = bench({ suggestedLthr: 168, suggestedMaxHR: 191, suggestedErg500Sec: 112 })
    expect(benchmarkTitle(all)).toContain('threshold HR')
  })

  it('still says something when the assessment suggests nothing', () => {
    expect(benchmarkTitle(bench())).toBe('Benchmark result ready')
  })

  it('describes the HR case and the erg case differently — they do different things', () => {
    const hr = benchmarkConsequence(bench({ suggestedLthr: 168 }))
    const erg = benchmarkConsequence(bench({ suggestedErg500Sec: 112 }))
    expect(hr).toContain('HR zones')
    expect(erg).toContain('measured benchmarks')
    expect(hr).not.toBe(erg)
  })

  it('promises that history is safe, because that is the fear', () => {
    expect(benchmarkConsequence(bench({ suggestedLthr: 168 }))).toContain('Past workouts are never touched')
  })

  it('carries every line of evidence — the argument is not a detail', () => {
    const text = benchmarkConsequence(bench({ suggestedLthr: 168 }))
    for (const line of bench().evidence) expect(text, line).toContain(line)
  })
})

describe('the recalibration proposal', () => {
  it('says what was observed, not what will be done', () => {
    expect(recalTitle()).toBe('You’ve been running faster than your targets — at the right effort')
  })

  it('quantifies the change from the suggested factor', () => {
    expect(recalPercent(recal({ suggestedFactor: 0.98 }))).toBe('2.0')
    expect(recalPercent(recal({ suggestedFactor: 0.97 }))).toBe('3.0')
    expect(recalConsequence(recal({ suggestedFactor: 0.98 }))).toContain('~2.0% faster')
  })

  it('says why it is conservative, because half the gain looks like a bug otherwise', () => {
    expect(recalConsequence(recal())).toContain('half the observed gain')
  })

  it('promises structure and history are untouched', () => {
    const text = recalConsequence(recal())
    expect(text).toContain('Workout structure and past weeks do not change')
  })

  it('shows at most three lines of evidence — a queue item is a decision, not a document', () => {
    const text = recalConsequence(recal())
    expect(text).toContain('Tempo on Aug 12 ran 3% quick.')
    expect(text).toContain('Threshold on Aug 20 ran 4% quick.')
    expect(text).not.toContain('A fourth line that should not appear.')
  })
})
