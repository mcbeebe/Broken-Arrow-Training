import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../../App'
import { addDays, mondayOnOrBefore, todayDateString } from '../../utils/planDates'
import { captureBackup, configForRestore, readBackups } from '../../utils/planBackups'
import type { ImportedPlanV1, ImportedSession } from '../../utils/planImport/types'

/**
 * Initiative 004 — boots the REAL App against an onboarding config that
 * carries an uploaded plan. Whatever day the suite runs, week 1 is pinned two
 * Mondays back, so today always falls in week 3.
 */

const thisMonday = mondayOnOrBefore(todayDateString())
const pinned = addDays(thisMonday, -14)

function week(n: number): { focus: string; sessions: ImportedSession[] } {
  return {
    focus: `Block week ${n}`,
    sessions: [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, type: 'run' as const, title: `Week ${n} run`, distanceMi: 4, intensity: 'easy' as const })),
  }
}

const importedPlan: ImportedPlanV1 = {
  v: 1,
  source: { name: 'coach-plan.pdf', kind: 'pdf', importedAt: '2026-10-08T12:00:00.000Z' },
  title: 'Coach Riley Marathon Block',
  sport: 'road',
  raceDistance: 'Marathon',
  weeks: [1, 2, 3, 4, 5].map(week),
}

function seed(planValue: unknown, search = '', raceDate = '') {
  // replaceState, not location.hash: a hash assignment fires a late
  // hashchange, and the app answers that by switching to the Today tab.
  window.history.replaceState({}, '', `/app/${search}#mike`)
  // The first-run walkthrough overlays every tab; it is not under test here.
  localStorage.setItem('ba_tutorial_seen_mike', '1')
  localStorage.setItem('ba_onboarding_mike', JSON.stringify({
    raceType: 'road',
    raceName: '',
    raceDate,
    // A race distance with no method picked would normally send the athlete
    // to method selection; an uploaded plan must skip it.
    raceDistance: 'marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'Mike',
    age: 42,
    maxHR: 178,
    planStartPinnedIso: pinned,
    importedPlan: planValue,
    completedAt: '2026-10-08T12:00:00.000Z',
    valuePropsSeenAt: '2026-10-08T12:01:00.000Z',
    connectStepSeenAt: '2026-10-08T12:02:00.000Z',
    welcomeLetterSeenAt: '2026-10-08T12:03:00.000Z',
    // primerSeenAt and zonesPrimerSeenAt deliberately absent: an uploaded
    // plan has no method to explain, so neither primer may appear.
  }))
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/app/')
  Element.prototype.scrollIntoView = () => {}
  window.scrollTo = () => {}
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ items: [], serverNow: new Date().toISOString() }),
    text: async () => '{}',
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/app/')
})

describe('App boots on an uploaded plan', () => {
  it("shows today's session from the uploaded plan, not a generated or hand-written one", async () => {
    seed(importedPlan)
    render(<App />)
    const today = await screen.findAllByText(/Week 3 run/, {}, { timeout: 8000 })
    expect(today.length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Week 2 run|Week 4 run/)).toBeNull()
    // The plan's own title names it, and Mike's hand-written race is gone.
    expect(screen.getAllByText(/Coach Riley Marathon Block/).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Broken Arrow Skyrace/)).toBeNull()
    // No method pick and no primers.
    expect(screen.queryByText(/Pick your training method/)).toBeNull()
    expect(screen.queryByText(/how it's structured/)).toBeNull()
    expect(screen.queryByText(/The numbers your plan trains to/)).toBeNull()
  }, 20000)

  it('counts the current week from the plan’s dates, not back from the race', async () => {
    // A block that ends weeks before race day: counting back from the race
    // (the generated-plan rule) would put today in week 1.
    seed(importedPlan, '?view=progress', addDays(pinned, 70))
    render(<App />)
    const header = await screen.findByText('This week, in numbers', {}, { timeout: 8000 })
    expect(header.parentElement?.textContent).toContain('Week 3')
  }, 20000)

  it('never splices a stored season’s later races into the uploaded plan', async () => {
    seed(importedPlan, '?view=progress', addDays(pinned, 34))
    const cfg = JSON.parse(localStorage.getItem('ba_onboarding_mike')!)
    cfg.goalMode = 'season'
    cfg.additionalRaces = [{ name: 'Autumn Half', date: addDays(pinned, 90), priority: 'A', format: 'road' }]
    localStorage.setItem('ba_onboarding_mike', JSON.stringify(cfg))
    render(<App />)
    await screen.findByText('This week, in numbers', {}, { timeout: 8000 })
    expect(screen.getAllByText('Week 5').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Week 6')).toBeNull()
  }, 20000)

  it('shows a way out, not a blank app or a generated plan, when the stored plan is broken', async () => {
    seed({ v: 2, weeks: 'garbled' })
    render(<App />)
    expect(await screen.findByText(/couldn.t open your plan/i, {}, { timeout: 8000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Redo onboarding/i })).toBeTruthy()
    expect(screen.queryByText(/Pick your training method/)).toBeNull()
  }, 20000)
})

describe('An uploaded plan survives backup and restore', () => {
  it('keeps the plan intact in the backup ring and in the restored config', () => {
    seed(importedPlan)
    captureBackup('mike', 'before redo')
    const [backup] = readBackups('mike')
    const restored = configForRestore(backup)
    expect(restored?.importedPlan).toEqual(importedPlan)
    expect(restored?.planStartPinnedIso).toBe(pinned)
  })
})
