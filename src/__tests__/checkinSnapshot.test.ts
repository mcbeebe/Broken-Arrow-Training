/**
 * The check-in snapshot (initiative 005): what the server writes the
 * Sunday/Wednesday email from. The server cannot rebuild the plan, so if a
 * day goes missing here, or lands on the wrong date, the email is wrong.
 */
import { describe, it, expect } from 'vitest'
import mikePlan from '../data/mike-18k-plan'
import type { PerformanceMetrics, TrainingPlan } from '../types'
import { buildCheckinSnapshot, checkinHash, CHECKIN_AHEAD_DAYS, CHECKIN_PAST_DAYS } from '../utils/checkin/snapshot'
import { buildMethodologyContext } from '../utils/methodologyContext'
import { plannedMinutes } from '../utils/markDone'
import { shiftDate } from '../utils/metricTrend'
import { tsbZone, acwrZone } from '../utils/loadZones'

const TODAY = '2026-05-10' // Sunday of week 4
const NOW = new Date('2026-05-10T20:00:00Z')

function perf(days: number, endIso = TODAY): PerformanceMetrics[] {
  return Array.from({ length: days }, (_, i) => {
    const ctl = 30 + i
    const atl = 35 + i
    return { date: shiftDate(endIso, i - days + 1), ctl, atl, tsb: ctl - atl, acwr: atl / ctl }
  })
}

function build(plan: TrainingPlan = mikePlan, performance: PerformanceMetrics[] = perf(20)) {
  return buildCheckinSnapshot({
    plan, currentWeekNum: 4, performance, todayIso: TODAY, now: NOW, timezone: 'America/Los_Angeles',
  })
}

describe('the day window', () => {
  const snap = build()

  it('covers the last 14 days and the next 6 weeks, in order, one entry per date', () => {
    const dates = snap.days.map(d => d.date)
    expect(dates[0]).toBe(shiftDate(TODAY, -CHECKIN_PAST_DAYS))
    expect(dates[dates.length - 1] <= shiftDate(TODAY, CHECKIN_AHEAD_DAYS - 1)).toBe(true)
    expect([...dates].sort()).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('keeps rest days, so the server can tell a rest day from a missing one', () => {
    expect(snap.days.some(d => d.type === 'rest')).toBe(true)
  })

  it('carries each day as the app shows it, with its planned minutes', () => {
    const week4 = mikePlan.weeks.find(w => w.num === 4)!
    const mon = week4.days[0]
    const entry = snap.days.find(d => d.date === '2026-05-04')!
    expect(entry.week).toBe(4)
    expect(entry.workout).toBe(mon.workout)
    expect(entry.type).toBe(mon.type)
    expect(entry.minutes).toBe(plannedMinutes(mon.time))
  })

  it('lists every plan week the window touches, with its first date', () => {
    expect(snap.weeks.map(w => w.num)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10].filter(n => snap.days.some(d => d.week === n)))
    const w4 = snap.weeks.find(w => w.num === 4)!
    expect(w4.startIso).toBe('2026-05-04')
    expect(w4.plannedMiles).toBe(mikePlan.weeks.find(w => w.num === 4)!.miles)
  })
})

describe('actuals', () => {
  it('turns a logged workout into miles and minutes', () => {
    const plan: TrainingPlan = structuredClone(mikePlan)
    const tue = plan.weeks.find(w => w.num === 4)!.days[1]
    tue.actual = {
      stravaId: 1, distance: 8046.72, movingTime: 2700, elapsedTime: 2800,
      elevationGain: 0, type: 'Run', name: 'Morning run', startDate: '2026-05-05T14:00:00Z',
    }
    const entry = build(plan).days.find(d => d.date === '2026-05-05')!
    expect(entry.actual).toEqual({ miles: 5, minutes: 45, name: 'Morning run' })
    expect(build().days.find(d => d.date === '2026-05-05')!.actual).toBeUndefined()
  })
})

describe('race, block and load', () => {
  it('gives the race as a calendar date', () => {
    expect(build().race).toEqual({ name: 'Broken Arrow Skyrace 18K', date: '2026-06-19' })
  })

  it('places this week in the plan’s phases, as the Methodology screen does', () => {
    const ctx = buildMethodologyContext(mikePlan)
    const block = build().block!
    expect(block.weekNum).toBe(4)
    expect(block.totalWeeks).toBe(ctx.totalWeeks)
    expect(block.phases.map(p => p.label)).toEqual(ctx.phases.map(p => p.label))
    expect(block.currentPhase).toBe(ctx.phases.find(p => p.weekStart <= 4 && p.weekEnd >= 4)!.label)
  })

  it('reports the latest load with its 14-day Fitness change and zone words', () => {
    const p = perf(20)
    const last = p[p.length - 1]
    const load = build(mikePlan, p).load!
    expect(load.date).toBe(TODAY)
    expect(load.fitness).toBe(last.ctl)
    expect(load.fitnessChange).toBe(14)
    expect(load.balance).toBe(last.tsb)
    expect(load.balanceLabel).toBe(tsbZone(last.tsb).label)
    expect(load.ratio).toBe(Math.round(last.acwr * 100) / 100)
    expect(load.ratioLabel).toBe(acwrZone(last.acwr).label)
  })

  it('leaves the change out when history is shorter than 14 days', () => {
    expect(build(mikePlan, perf(5)).load!.fitnessChange).toBeNull()
  })

  it('has no load at all without a performance series', () => {
    expect(build(mikePlan, []).load).toBeNull()
  })
})

describe('checkinHash', () => {
  it('ignores the build time, so a re-render never re-uploads', () => {
    const a = build()
    const b = { ...a, generatedAt: '2030-01-01T00:00:00.000Z' }
    expect(checkinHash(a)).toBe(checkinHash(b))
  })

  it('changes when a day in the window changes', () => {
    const plan: TrainingPlan = structuredClone(mikePlan)
    plan.weeks.find(w => w.num === 5)!.days[1].workout = 'Tempo run'
    expect(checkinHash(build(plan))).not.toBe(checkinHash(build()))
  })

  it('changes when the day changes, so each new day is uploaded once', () => {
    const next = buildCheckinSnapshot({
      plan: mikePlan, currentWeekNum: 4, performance: perf(20), todayIso: '2026-05-11', now: NOW, timezone: 'UTC',
    })
    expect(checkinHash(next)).not.toBe(checkinHash(build()))
  })
})
