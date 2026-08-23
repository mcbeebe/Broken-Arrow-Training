/**
 * Cross-plan strength history (N10) — prior-plan manual logs fold back
 * into the history the records layer reads, so a plan rebuild never
 * erases e1RM trends, PRs, or ghost weights.
 */
import { describe, it, expect } from 'vitest'
import type { TrainingWeek, ActualWorkout } from '../types'
import { weeksWithPriorLogs } from '../utils/strengthHistory'
import { detectPRs, weeklyStrengthVolume, epley1RM } from '../utils/strengthRecords'
import { buildProgression } from '../utils/strengthProgression'

function strengthActual(date: string, weight: string, reps = 12): ActualWorkout {
  return {
    stravaId: Date.parse(date), source: 'manual', distance: 0, movingTime: 3000,
    elapsedTime: 3000, elevationGain: 0, type: 'strength_training',
    name: 'Strength', startDate: `${date}T08:00:00`,
    strengthLog: [{ name: 'Goblet squats', focus: 'lower', sets: [{ reps, weight }] }],
  }
}

function currentPlan(): TrainingWeek[] {
  return [{
    num: 1, dates: 'Aug 24–30', miles: 12, focus: 'Base',
    days: [{
      day: 'Tue 8/25', type: 'strength', workout: 'STRENGTH', detail: '',
      zone: 'Z1', route: 'Gym', time: '50 min',
      actual: strengthActual('2026-08-25', '35 lb'),
    }],
  }]
}

const priorLogs: Record<string, ActualWorkout> = {
  // Orphans — dates from a rebuilt-away plan.
  '2026-07-06': strengthActual('2026-07-06', '25 lb'),
  '2026-07-20': strengthActual('2026-07-20', '30 lb'),
  // Consumed by the current plan (same log that's attached to Tue 8/25).
  '2026-08-25': strengthActual('2026-08-25', '35 lb'),
  // A run log from the old plan — not strength history.
  '2026-07-10': { ...strengthActual('2026-07-10', ''), strengthLog: undefined, type: 'running' },
}

describe('weeksWithPriorLogs', () => {
  it('folds orphaned strength logs into a synthetic week 0, oldest first', () => {
    const weeks = weeksWithPriorLogs(currentPlan(), priorLogs)
    expect(weeks).toHaveLength(2)
    expect(weeks[0].num).toBe(0)
    expect(weeks[0].days.map(d => d.day)).toEqual(['7/6', '7/20'])
    // The consumed log and the run log stayed out.
    expect(weeks[0].days).toHaveLength(2)
  })

  it('returns the weeks untouched when there is nothing to fold in', () => {
    const weeks = currentPlan()
    expect(weeksWithPriorLogs(weeks, undefined)).toBe(weeks)
    expect(weeksWithPriorLogs(weeks, { '2026-08-25': priorLogs['2026-08-25'] })).toBe(weeks)
  })

  it('progression and PRs now span the rebuild — old bests must be beaten', () => {
    const weeks = weeksWithPriorLogs(currentPlan(), priorLogs)
    const prog = buildProgression(weeks).get('goblet squat')!
    expect(prog.sessions).toHaveLength(3)
    expect(prog.sessions[0].date).toBe('2026-07-06')

    const prs = detectPRs(weeks)
    // 25→30 (old plan) and 30→35 (this plan) are PRs; the very first
    // session is the baseline.
    expect(prs).toHaveLength(2)
    expect(prs[0].weekNum).toBe(0)
    expect(prs[1].date).toBe('2026-08-25')
    expect(prs[1].prev).toBe(epley1RM(30, 12))
  })

  it('weekly volume never charts the week-0 bucket', () => {
    const weeks = weeksWithPriorLogs(currentPlan(), priorLogs)
    expect(weeklyStrengthVolume(weeks)).toEqual([{ weekNum: 1, sets: 1 }])
  })
})
