import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

/**
 * Field P0: attune.coach rendered a BLANK page ("completely frozen") right
 * after the #283 deploy, for an athlete with a completed 4-race season
 * config, an old season-seed stamp, and leftover plan edits. This boots the
 * REAL App against that stored state — if anything on the boot path throws
 * or loops, this test catches it before any deploy.
 */

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = () => {}
  window.scrollTo = () => {}
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ items: [], serverNow: new Date().toISOString() }),
    text: async () => '{}',
  })))
})

function seedFieldState() {
  window.location.hash = 'mike'
  localStorage.setItem('ba_onboarding_mike', JSON.stringify({
    raceType: 'trail', raceName: 'Oakland Hills Half Maraton', raceDate: '2026-10-24',
    raceDistance: 'half_marathon', goalMode: 'season', raceKinds: ['trail', 'hyrox'],
    raceDescription: 'Redwood groves, 2900 ft of gain, hot fall day.',
    athleteGoal: 'sub-1:45 and a strong first Hyrox',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 7, longRunDay: 'Sunday',
    wearable: 'garmin', athleteName: 'Mike', age: 42, maxHR: 178,
    selectedMethodId: 'higdon', completedAt: '2026-07-10T05:30:00.000Z',
    additionalRaces: [
      { name: 'Hyrox - Anaheim', date: '2026-12-12', priority: 'A', format: 'hyrox', integration: 'layered', description: 'Hyrox open, first one' },
      { name: 'Turkey Trot', date: '2026-11-26', priority: 'C', format: 'road' },
      { name: 'CIM Marathon', date: '2027-04-11', priority: 'A', format: 'road' },
    ],
    valuePropsSeenAt: '2026-07-10T05:31:00.000Z',
    connectSeenAt: '2026-07-10T05:31:30.000Z',
    welcomeLetterSeenAt: '2026-07-10T05:32:00.000Z',
    primerSeenAt: '2026-07-10T05:33:00.000Z',
    zonesPrimerSeenAt: '2026-07-10T05:34:00.000Z',
  }))
  // OLD once-per-athlete seed stamp (pre-#283 shape: an ISO timestamp).
  localStorage.setItem('ba_season_seeded_v1_mike', '2026-07-08T00:00:00.000Z')
  // Stored season from the earlier generation: anchor + old hyrox only.
  localStorage.setItem('ba_season_v1_mike', JSON.stringify({
    races: [
      { id: 'oakland-hills-half-maraton_2026-10-24', priority: 'A', status: 'upcoming', raceInfo: { name: 'Oakland Hills Half Maraton', date: '2026-10-24', startTime: '', distance: 'Half Marathon', distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '' } },
      { id: 'hyrox-anaheim_2026-12-12', priority: 'A', status: 'upcoming', raceInfo: { name: 'Hyrox - Anaheim', date: '2026-12-12', startTime: '', distance: 'Hyrox', distanceMiles: 8, elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '', description: 'Hyrox open' } },
    ],
    blocks: [],
  }))
  // Leftover June plan edits (index-keyed) from the previous plan.
  localStorage.setItem('ba_plan_edits_mike', JSON.stringify([
    { id: 'e1', batchId: 'b1', appliedAt: 1, op: { kind: 'updateDay', weekNum: 8, dayIndex: 3, updates: { workout: 'Tiger Mtn 3', type: 'quality' } } },
  ]))
  localStorage.setItem('ba_manual_logs_mike', JSON.stringify({
    '2026-06-26': { name: 'Granite Mtn with pack', distance: 8.6, movingTime: 10500, notes: 'snow final mile' },
  }))
}

describe('App boots against the field state', () => {
  it('renders the plan (never a blank screen) with the 4-race season seeded', async () => {
    seedFieldState()
    render(<App />)
    // The app shell renders — the anchor race title is in the header.
    expect(await screen.findByText(/Oakland Hills Half Maraton/i, {}, { timeout: 8000 })).toBeInTheDocument()
    // The per-generation re-seed ran at boot: the stored season now
    // carries ALL FOUR races (it had two before this generation).
    const season = JSON.parse(localStorage.getItem('ba_season_v1_mike')!)
    const names = season.races.map((r: { raceInfo: { name: string } }) => r.raceInfo.name)
    expect(names).toContain('Hyrox - Anaheim')
    expect(names).toContain('Turkey Trot')
    expect(names).toContain('CIM Marathon')
    // The redo REPLACE stores exactly the captured races — the anchor is
    // composed at runtime from the active plan, and the pre-redo stored
    // anchor row (typo'd name) is pruned as stale.
    expect(season.races).toHaveLength(3)
    // And the re-captured Hyrox adopted its layered integration.
    expect(season.races.find((r: { raceInfo: { name: string } }) => r.raceInfo.name === 'Hyrox - Anaheim').integration).toBe('layered')
  }, 20000)
})
