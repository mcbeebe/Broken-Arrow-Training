/**
 * Adaptive engine PR 6 — Level Up: evidence-ranked accelerator levers,
 * never filler, headroom-honest.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { PlannedDay, TrainingWeek, ActualWorkout } from '../types'
import { buildLevelUp } from '../engines/adaptive/levelUp'
import LevelUpCard from '../components/LevelUpCard'

afterEach(cleanup)

function day(over: Partial<PlannedDay>, actualOver?: Partial<ActualWorkout> | null): PlannedDay {
  const actual: ActualWorkout | undefined = actualOver == null ? undefined : {
    stravaId: 1, source: 'strava', distance: 4, movingTime: 2400, elapsedTime: 2500,
    elevationGain: 0, type: 'Run', name: 'Run', startDate: '2026-09-08T07:00:00',
    avgHR: 140, ...actualOver,
  }
  return {
    day: 'Tue 9/8', type: 'run', workout: 'Easy run', detail: '',
    zone: '4.0 mi · Z2 (130–148)', route: '', time: '45 min', actual, ...over,
  }
}

function weeksOf(days: PlannedDay[], miles = 18): TrainingWeek[] {
  return [{ num: 5, dates: '', startIso: '2026-09-07', miles, focus: 'Build', days }]
}

const TODAY = '2026-09-14'

describe('buildLevelUp', () => {
  it('fires the weak-station lever from the latest simulation, headroom-aware', () => {
    const sim = day({ day: 'Sat 9/12', type: 'long', workout: 'HALF SIMULATION' }, {
      startDate: '2026-09-12T08:00:00', distance: 2.5, movingTime: 2400, type: 'workout',
      stationSplits: [
        { label: 'Run 1 — 1 km', kind: 'run', sec: 300 },
        { label: 'SkiErg — 1000 m', kind: 'station', sec: 255 },
        { label: 'Run 2 — 1 km', kind: 'run', sec: 300 },
        { label: 'Sled pull — 50 m @ 103 kg', kind: 'station', sec: 360 }, // blown
        { label: 'Run 3 — 1 km', kind: 'run', sec: 300 },
        { label: 'Sled push — 50 m @ 152 kg', kind: 'station', sec: 180 },
        { label: 'Run 4 — 1 km', kind: 'run', sec: 300 },
        { label: 'Burpee broad jumps — 80 m', kind: 'station', sec: 300 },
      ],
    })
    const levers = buildLevelUp(weeksOf([sim, day({ day: 'Wed 9/16' }, null)]), TODAY)
    const weak = levers.find(l => l.id === 'weak-station')!
    expect(weak.title.toLowerCase()).toContain('sled pull')
    expect(weak.evidence).toMatch(/lost ~/)
    expect(weak.coachSeed).toMatch(/Sled pull/)
  })

  it('fires the easy-day lever when easy runs run hot, and stays quiet when honest', () => {
    const hot = (d: string, iso: string) => day({ day: d }, { avgHR: 156, startDate: `${iso}T07:00:00` })
    const cool = (d: string, iso: string) => day({ day: d }, { avgHR: 140, startDate: `${iso}T07:00:00` })
    const hotWeeks = weeksOf([hot('Mon 9/7', '2026-09-07'), hot('Wed 9/9', '2026-09-09'), cool('Fri 9/11', '2026-09-11')])
    const lever = buildLevelUp(hotWeeks, TODAY).find(l => l.id === 'easy-day-discipline')!
    expect(lever.evidence).toMatch(/2 of your last 3 easy runs/)

    const honestWeeks = weeksOf([cool('Mon 9/7', '2026-09-07'), cool('Wed 9/9', '2026-09-09'), cool('Fri 9/11', '2026-09-11')])
    expect(buildLevelUp(honestWeeks, TODAY).find(l => l.id === 'easy-day-discipline')).toBeUndefined()
  })

  it('fires the sleep lever when hard days land on short nights, quiet when rested', () => {
    const hard = (d: string, iso: string) =>
      day({ day: d, type: 'quality', workout: 'Intervals' }, { startDate: `${iso}T07:00:00` })
    const weeks = weeksOf([hard('Mon 9/7', '2026-09-07'), hard('Wed 9/9', '2026-09-09'), hard('Fri 9/11', '2026-09-11')])
    const night = (date: string, hours: number) => ({
      date,
      sleep: { durationSeconds: hours * 3600, quality: 'FAIR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0 },
    })
    const lever = buildLevelUp(weeks, TODAY, {
      health: [night('2026-09-07', 6), night('2026-09-09', 6.5), night('2026-09-11', 8)],
    }).find(l => l.id === 'sleep-before-hard-days')!
    expect(lever.evidence).toMatch(/2 of your last 3 hard sessions/)

    const rested = buildLevelUp(weeks, TODAY, {
      health: ['2026-09-07', '2026-09-09', '2026-09-11'].map(d => night(d, 8)),
    })
    expect(rested.find(l => l.id === 'sleep-before-hard-days')).toBeUndefined()
  })

  it('an athlete with no data gets zero levers — never invented evidence', () => {
    expect(buildLevelUp(weeksOf([]), TODAY)).toHaveLength(0)
  })

  it('a doing-fine athlete still gets the benchmark lever while CS is a floor', () => {
    // Honest easy running, nothing broken: the way up is sharper inputs.
    const cool = (d: string, iso: string) => day({ day: d }, { avgHR: 140, startDate: `${iso}T07:00:00` })
    const levers = buildLevelUp(weeksOf([cool('Mon 9/7', '2026-09-07'), cool('Wed 9/9', '2026-09-09'), cool('Fri 9/11', '2026-09-11')]), TODAY)
    const bench = levers.find(l => l.id === 'benchmark-engine')!
    expect(bench.evidence).toMatch(/best-effort floor/)
  })

  it('hyrox plans without a recent sim get the race-rehearsal lever', () => {
    const cool = (d: string, iso: string) => day({ day: d }, { avgHR: 140, startDate: `${iso}T07:00:00` })
    const weeks = weeksOf([cool('Mon 9/7', '2026-09-07'), day({ day: 'Wed 9/16' }, null)])
    expect(buildLevelUp(weeks, TODAY, { raceType: 'hyrox' }).find(l => l.id === 'race-rehearsal')).toBeTruthy()
    // Non-hyrox plans never see it.
    expect(buildLevelUp(weeks, TODAY, { raceType: 'marathon' }).find(l => l.id === 'race-rehearsal')).toBeUndefined()
  })

  it('a fresh simulation silences the race-rehearsal lever', () => {
    const sim = day({ day: 'Sat 9/12', type: 'long', workout: 'HALF SIMULATION' }, {
      startDate: '2026-09-12T08:00:00', type: 'workout',
      stationSplits: [
        { label: 'Run 1 — 1 km', kind: 'run', sec: 300 },
        { label: 'SkiErg — 1000 m', kind: 'station', sec: 255 },
      ],
    })
    const weeks = weeksOf([sim, day({ day: 'Wed 9/16' }, null)])
    expect(buildLevelUp(weeks, TODAY, { raceType: 'hyrox' }).find(l => l.id === 'race-rehearsal')).toBeUndefined()
  })
})

describe('LevelUpCard', () => {
  it('renders ranked levers and routes the action to the coach', () => {
    const onAskCoach = vi.fn()
    render(<LevelUpCard onAskCoach={onAskCoach} levers={[{
      id: 'easy-day-discipline', kind: 'execution',
      title: 'Make easy days actually easy',
      evidence: '4 of your last 6 easy runs came in above their heart-rate zone.',
      payoff: 'Harder hard days for free.',
      actionLabel: 'Cap my easy runs at zone',
      coachSeed: 'Help me keep easy days honest.',
    }]} />)
    expect(screen.getByText('Level up')).toBeTruthy()
    expect(screen.getByText(/4 of your last 6/)).toBeTruthy()
    fireEvent.click(screen.getByText('Cap my easy runs at zone'))
    expect(onAskCoach).toHaveBeenCalledWith('Help me keep easy days honest.')
  })

  it('with no levers it shows the honest on-track state, not nothing', () => {
    const onAskCoach = vi.fn()
    render(<LevelUpCard levers={[]} onAskCoach={onAskCoach} />)
    expect(screen.getByTestId('level-up-ontrack')).toBeTruthy()
    expect(screen.getByText(/Nothing urgent right now/)).toBeTruthy()
    fireEvent.click(screen.getByText(/what's my next level/))
    expect(onAskCoach).toHaveBeenCalledWith(expect.stringContaining('next level'))
  })
})
