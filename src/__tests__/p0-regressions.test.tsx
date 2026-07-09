import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
import type { ActualWorkout, RaceInfo, SeasonRace, TrainingWeek, PlannedDay } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { useManualLog, manualLogKey } from '../hooks/useManualLog'
import Journal from '../components/Journal'
import { generateHyroxPlan } from '../utils/planGenerator'
import { planSeason } from '../engines/season/planSeason'
import { spliceSeasonWeeks } from '../engines/season/spliceSeason'
import { parseDayToDate } from '../utils/planDates'

/**
 * P0 regression suite — the three field-reported failures from the first
 * onboarding-redo with a season:
 *  1. journal reflections vanished (orphaned by the plan rebuild);
 *  2. week numbers/dates corrupted (the fixed-length Hyrox template
 *     back-counted on top of the anchor race's build);
 *  3. the second race captured too thin.
 */

beforeEach(() => {
  localStorage.clear()
})

// ── 1 · Journal survival across a plan rebuild ───────────────────

function actual(notes: string, over: Partial<ActualWorkout> = {}): ActualWorkout {
  return { name: 'Morning Run', distance: 4.1, movingTime: 2400, notes, ...over } as ActualWorkout
}

describe('P0-1: reflections survive a plan rebuild', () => {
  it('migrates legacy label keys to ISO dates and still merges onto plan days', () => {
    localStorage.setItem('ba_manual_logs_t', JSON.stringify({
      'Sat 7/4': actual('felt smooth'),
    }))
    const { result } = renderHook(() => useManualLog('t'))
    // Migrated on load.
    expect(result.current.logs['2026-07-04']).toBeDefined()
    expect(result.current.logs['Sat 7/4']).toBeUndefined()
    // And still lands on a matching plan day.
    const weeks: TrainingWeek[] = [{
      num: 1, dates: 'Jun 29-Jul 5', miles: 10, focus: '',
      days: [{ day: 'Sat 7/4', type: 'run', workout: 'Easy', detail: '', zone: '—', route: '', time: '—' } as PlannedDay],
    }]
    const applied = result.current.applyLogsToWeeks(weeks)
    expect(applied[0].days[0].actual?.notes).toBe('felt smooth')
  })

  it('new logs are written under ISO keys', () => {
    const { result } = renderHook(() => useManualLog('t'))
    act(() => result.current.logWorkout('Tue 7/7', actual('strong tempo')))
    expect(result.current.logs['2026-07-07']).toBeDefined()
    expect(manualLogKey('Tue 7/7')).toBe('2026-07-07')
  })

  it('THE BUG: a note from a day the rebuilt plan no longer contains still renders in the Journal', () => {
    // Old-plan log (May) — the rebuilt plan below starts in September.
    localStorage.setItem('ba_manual_logs_t', JSON.stringify({
      '2026-05-12': actual('legs finally coming back'),
    }))
    const { result } = renderHook(() => useManualLog('t'))
    const rebuiltPlan: TrainingWeek[] = [{
      num: 1, dates: 'Sep 7-13', miles: 12, focus: 'New plan',
      days: [{ day: 'Mon 9/7', type: 'run', workout: 'Easy', detail: '', zone: '—', route: '', time: '—' } as PlannedDay],
    }]
    render(<Journal weeks={rebuiltPlan} athleteId="t" manualLog={result.current} />)
    expect(screen.getByText('legs finally coming back')).toBeInTheDocument()
    expect(screen.getByText(/previous plan/)).toBeInTheDocument()
  })

  it('a note on a CURRENT plan day renders normally (no orphan tag, no duplicate)', () => {
    const weeks: TrainingWeek[] = [{
      num: 3, dates: 'Jul 6-12', miles: 12, focus: '',
      days: [{
        day: 'Tue 7/7', type: 'run', workout: 'Tempo', detail: '', zone: '—', route: '', time: '—',
        actual: actual('current note', { startDate: '2026-07-07T08:00:00' }),
      } as PlannedDay],
    }]
    render(<Journal weeks={weeks} athleteId="t"
      manualLog={{ logWorkout: () => {}, logs: { '2026-07-07': actual('current note') } }} />)
    expect(screen.getAllByText('current note')).toHaveLength(1)
    expect(screen.queryByText(/previous plan/)).toBeNull()
  })
})

// ── 2 · Hyrox runway clamp + splice no-overlap guarantee ─────────

const hyroxConfig = {
  raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-12-12',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 4, wearable: 'none',
  athleteName: 'M', age: 45, maxHR: 178, completedAt: '',
} as OnboardingConfig

describe('P0-2: the Hyrox template can never start before today', () => {
  it('clamps to the runway and says so honestly', () => {
    const plan = generateHyroxPlan(hyroxConfig, '2026-11-01') // 6 weeks out
    expect(plan.weeks.length).toBeLessThanOrEqual(6)
    const firstIso = parseDayToDate(plan.weeks[0].days[0].day)!
    expect(firstIso >= '2026-11-01').toBe(true)
    expect(plan.advisories?.some(a => a.id === 'runway_short')).toBe(true)
  })

  it('a full runway keeps the level template, no advisory', () => {
    const plan = generateHyroxPlan(hyroxConfig, '2026-06-01')
    expect(plan.weeks.length).toBeGreaterThanOrEqual(10)
    expect(plan.advisories?.some(a => a.id === 'runway_short')).toBeFalsy()
  })
})

function sr(id: string, priority: SeasonRace['priority'], info: Partial<RaceInfo>): SeasonRace {
  return {
    id, priority, status: 'upcoming',
    raceInfo: {
      name: 'Race', date: '2026-10-24', startTime: '', distance: 'Half Marathon',
      distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
      landmarks: [], gear: [], nutrition: '', ...info,
    },
  }
}

describe("P0-2: THE SCREENSHOT BUG — spliced Hyrox weeks may never overlap the anchor race's build", () => {
  it('every spliced week is dated AFTER the anchor race; dates never rewind', () => {
    // The exact field shape: half 10/24, Hyrox Open ~7 weeks later.
    const races = [
      sr('half', 'A', { name: 'Oakland Hills Half Marathon', date: '2026-10-24' }),
      sr('hyrox', 'A', { name: 'Hyrox - Anaheim', date: '2026-12-12', distance: 'Hyrox', distanceMiles: 8, description: 'Hyrox open' }),
    ]
    const result = planSeason(races, '2026-07-08')
    const anchorWeeks: TrainingWeek[] = [{
      num: 1, dates: 'Jul 6-12', miles: 20, focus: 'Half build',
      days: [{ day: 'Mon 7/6', type: 'run', workout: 'Easy', detail: '', zone: '4 mi · Z2 (108-148)', route: '', time: '45 min' } as PlannedDay],
    }]
    const config = { ...hyroxConfig, raceType: 'trail', raceDate: '2026-10-24', raceDistance: 'half_marathon', selectedMethodId: 'daniels' } as OnboardingConfig

    const spliced = spliceSeasonWeeks(anchorWeeks, result, config, '2026-07-08')
    const hyroxWeeks = spliced.filter(w => w.focus.includes('Hyrox - Anaheim'))
    expect(hyroxWeeks.length).toBeGreaterThan(0)
    for (const w of hyroxWeeks) {
      const iso = parseDayToDate(w.days[0].day)!
      expect(iso > '2026-10-24', `Hyrox week ${w.num} dated ${iso} overlaps the half build`).toBe(true)
    }
    // Week numbers strictly increase AND their dates never rewind.
    let lastIso = ''
    for (const w of spliced.slice(1)) { // skip anchor week (fixture date is loose)
      const iso = parseDayToDate(w.days[0].day)
      if (!iso) continue
      expect(iso >= lastIso, `week ${w.num} (${iso}) rewinds before ${lastIso}`).toBe(true)
      lastIso = iso
    }
  })
})

// ── 3 · Second-race capture carries details ──────────────────────

describe('P0-3: the second race carries its details into the season', () => {
  it('description flows through the splice into the generator config (Hyrox detection included)', () => {
    const races = [
      sr('half', 'A', { name: 'Half', date: '2026-10-24' }),
      sr('hyrox', 'B', { name: 'Anaheim Open', date: '2026-12-12', distanceMiles: 8, description: 'Hyrox open race, first one' }),
    ]
    const result = planSeason(races, '2026-07-08')
    const config = { ...hyroxConfig, raceType: 'trail', raceDate: '2026-10-24', raceDistance: 'half_marathon', selectedMethodId: 'daniels' } as OnboardingConfig
    const spliced = spliceSeasonWeeks(
      [{ num: 1, dates: 'Jul 6-12', miles: 20, focus: 'Half build', days: [] }],
      result, config, '2026-07-08',
    )
    // "Hyrox" appears only in the description — detection must still route
    // the second race through the Hyrox engine (station work in the weeks).
    const anaheim = spliced.filter(w => w.focus.includes('Anaheim Open'))
    expect(anaheim.length).toBeGreaterThan(0)
    expect(anaheim.some(w => w.days.some(d => /station|hyrox|sled|wall ball/i.test(d.workout + d.detail)))).toBe(true)
  })
})
