import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from '../../App'
import { addDays, todayDateString } from '../../utils/planDates'

/**
 * Initiative 004, PR 5 — the REAL App: Settings → Training Plan → Upload my
 * own plan → Check your plan → Use this plan. The owner sees the way in and
 * nobody else does, and an upload leaves the season calendar exactly as it
 * was (it would otherwise re-seed and drop the races added in the panel).
 * PR 7 adds the other way in: onboarding's "I already have a plan".
 */

const API = 'https://api.example.test'
const GENERATION = '2026-09-01T00:00:00.000Z'

const EXTRACTION = {
  status: 'ok', title: 'Club 10K block', sport: 'road', units: 'mi',
  race: { distance: '10K' },
  weeks: [1, 2, 3, 4].map(n => ({
    focus: `Club week ${n}`,
    s: [{ d: 'tue', t: 'run', w: 'Easy run', dist: 4 }, { d: 'sun', t: 'long', w: `Long run ${n}`, dist: 6 + n }],
  })),
}

const PANEL_RACE = {
  id: 'panel-5k_2026-12-05', priority: 'C', status: 'upcoming',
  raceInfo: { name: 'Panel 5K', date: '2026-12-05', startTime: '', distance: '5K', distanceMiles: 3.1, elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '' },
}

function seed(athlete: string, withConfig = true) {
  window.history.replaceState({}, '', `/app/?view=settings#${athlete}`)
  localStorage.setItem(`ba_tutorial_seen_${athlete}`, '1')
  if (!withConfig) return
  localStorage.setItem(`ba_onboarding_${athlete}`, JSON.stringify({
    raceType: 'road', raceName: 'Fall Half', raceDate: addDays(todayDateString(), 90),
    raceDistance: 'half_marathon', selectedMethodId: 'higdon',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday',
    wearable: 'none', athleteName: 'Mike', age: 42, maxHR: 178,
    additionalRaces: [],
    completedAt: GENERATION,
    valuePropsSeenAt: GENERATION, connectStepSeenAt: GENERATION,
    welcomeLetterSeenAt: GENERATION, primerSeenAt: GENERATION, zonesPrimerSeenAt: GENERATION,
  }))
  // A race added in the Season panel, under this plan generation.
  localStorage.setItem(`ba_season_v1_${athlete}`, JSON.stringify({ races: [PANEL_RACE], blocks: [], seededGeneration: GENERATION }))
}

const importCalls: RequestInit[] = []

beforeEach(() => {
  localStorage.clear()
  importCalls.length = 0
  window.history.replaceState({}, '', '/app/')
  Element.prototype.scrollIntoView = () => {}
  window.scrollTo = () => {}
  vi.stubEnv('VITE_COACH_API_URL', API)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/api/coach/plan_import')) {
      importCalls.push(init ?? {})
      return new Response(JSON.stringify({ extraction: EXTRACTION, warnings: [], usage: { input: 1, output: 1 }, importsLeft: 4 }), { status: 200 })
    }
    // The rest of the coach API is not under test: unavailable, as offline.
    if (String(url).startsWith(API)) return new Response('', { status: 503 })
    return {
      ok: true, status: 200, json: async () => ({ items: [], serverNow: new Date().toISOString() }),
      text: async (): Promise<string> => '{}',
    }
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/app/')
})

async function openTrainingPlan() {
  fireEvent.click(await screen.findByRole('button', { name: /Training Plan/ }, { timeout: 8000 }))
}

describe('Settings → Upload my own plan', () => {
  it('the owner uploads a plan, and it becomes their plan, with the season left alone', async () => {
    seed('mike')
    // A day edit made under the generated plan, after its generation.
    localStorage.setItem('ba_plan_edits_mike', JSON.stringify([{
      id: 'seed-edit', batchId: 'b-seed', appliedAt: Date.parse(GENERATION) + 60_000,
      op: { kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: { workout: 'Hill reps with Sam' } },
    }]))
    render(<App />)
    await openTrainingPlan()
    const card = await screen.findByTestId('plan-import-card')
    fireEvent.click(within(card).getByText('Upload a plan'))

    fireEvent.change(screen.getByTestId('plan-file-input'), {
      target: { files: [new File(['%PDF-1.7\nplan'], 'Club-10K.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByText('Read my plan'))
    expect(await screen.findByText('Check your plan', {}, { timeout: 8000 })).toBeTruthy()
    fireEvent.click(screen.getByText('Use this plan'))

    // Saved, and the app moved on from Settings.
    expect((await screen.findAllByText(/Easy run|Long run \d/, {}, { timeout: 8000 })).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('import-review')).toBeNull()
    expect(screen.queryByTestId('plan-import-card')).toBeNull()
    expect(importCalls).toHaveLength(1)
    expect(String(importCalls[0].body)).not.toContain('Club-10K')

    const cfg = JSON.parse(localStorage.getItem('ba_onboarding_mike')!)
    expect(cfg.importedPlan.title).toBe('Club 10K block')
    expect(cfg.importedPlan.source.name).toBe('Club-10K.pdf')
    expect(cfg).not.toHaveProperty('raceDistance')
    expect(cfg).not.toHaveProperty('selectedMethodId')
    expect(cfg.completedAt).not.toBe(GENERATION)

    // The upload is a new plan generation; the stored calendar was not
    // re-seeded, so the panel's race is still there.
    const season = JSON.parse(localStorage.getItem('ba_season_v1_mike')!)
    expect(season.races.map((r: { raceInfo: { name: string } }) => r.raceInfo.name)).toContain('Panel 5K')
    expect(season.seededGeneration).toBe(GENERATION)

    // And the generated plan is one tap from coming back.
    const backups = JSON.parse(localStorage.getItem('ba_plan_backups_mike')!)
    const before = backups.find((b: { reason: string }) => b.reason === 'before upload')
    expect(JSON.parse(before.config).raceName).toBe('Fall Half')

    // Restore it from Settings: the generated plan returns, and the calendar
    // with it (a restore is a new generation too, which would re-seed it).
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('button', { name: /Restore a Previous Plan/ }, { timeout: 8000 }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(await screen.findByTestId(`plan-backup-restore-${before.savedAt}`))
    expect((await screen.findAllByText(/Fall Half/, {}, { timeout: 8000 })).length).toBeGreaterThan(0)
    const restored = JSON.parse(localStorage.getItem('ba_onboarding_mike')!)
    expect(restored.importedPlan).toBeUndefined()
    expect(restored.raceDistance).toBe('half_marathon')
    const after = JSON.parse(localStorage.getItem('ba_season_v1_mike')!)
    expect(after.races.map((r: { raceInfo: { name: string } }) => r.raceInfo.name)).toContain('Panel 5K')
    expect(after.seededGeneration).toBe(restored.completedAt)
    // And the plan's day edit with it, still there once the app's edit hooks
    // have run on the restored plan (they used to drop it as older).
    await new Promise(r => setTimeout(r, 50))
    const edits = JSON.parse(localStorage.getItem('ba_plan_edits_mike')!)
    expect(edits.map((e: { id: string }) => e.id)).toEqual([`r${Date.parse(restored.completedAt)}_seed-edit`])
    expect(edits[0].batchId).toBe('b-seed')
    expect(edits[0].appliedAt).toBeGreaterThanOrEqual(Date.parse(restored.completedAt))
  }, 30_000)

  it('is not offered to anyone else during the beta', async () => {
    seed('jim')
    render(<App />)
    await openTrainingPlan()
    expect(await screen.findByText('Redo Onboarding', { selector: 'p' })).toBeTruthy()
    expect(screen.queryByTestId('plan-import-card')).toBeNull()
  })

  it('is not offered when the coach API is not configured', async () => {
    vi.stubEnv('VITE_COACH_API_URL', '')
    vi.stubEnv('VITE_GARMIN_API_URL', '')
    seed('mike')
    render(<App />)
    await openTrainingPlan()
    expect(await screen.findByText('Redo Onboarding', { selector: 'p' })).toBeTruthy()
    expect(screen.queryByTestId('plan-import-card')).toBeNull()
  })
})

describe('Onboarding → I already have a plan (PR 7)', () => {
  it('the owner redoing onboarding uploads their plan, and the app opens on it', async () => {
    // Mid-redo, as Settings → Redo Onboarding leaves it: the live config is
    // gone, the old one is kept to prefill who the athlete is.
    window.history.replaceState({}, '', '/app/#mike')
    localStorage.setItem('ba_tutorial_seen_mike', '1')
    localStorage.setItem('ba_onboarding_redo_mike', '1')
    localStorage.setItem('ba_onboarding_prev_mike', JSON.stringify({
      raceType: 'road', raceName: 'Fall Half', raceDate: addDays(todayDateString(), 90),
      raceDistance: 'half_marathon', selectedMethodId: 'higdon',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday',
      wearable: 'none', athleteName: 'Mike', age: 42, maxHR: 178, completedAt: GENERATION,
    }))
    render(<App />)

    fireEvent.click(await screen.findByText('I already have a plan', {}, { timeout: 8000 }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByTestId('plan-file-input'), {
      target: { files: [new File(['%PDF-1.7\nplan'], 'Club-10K.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // → the wearable, prefilled
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // → the review
    fireEvent.click(await screen.findByText('Use this plan', {}, { timeout: 8000 }))
    // A redo starts the app afresh, as it does for a generated plan, and the
    // letter (the coach is unreachable here) says whose plan it is.
    fireEvent.click(await screen.findByText("Let's go", {}, { timeout: 8000 }))
    expect(await screen.findByText(/your own 4-week plan, followed as written/, {}, { timeout: 8000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start training' }))

    expect((await screen.findAllByText(/Easy run|Long run \d/, {}, { timeout: 8000 })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Pick your training method/)).toBeNull()
    expect(importCalls).toHaveLength(1)

    const cfg = JSON.parse(localStorage.getItem('ba_onboarding_mike')!)
    expect(cfg.importedPlan.title).toBe('Club 10K block')
    expect(cfg.importedPlan.source.name).toBe('Club-10K.pdf')
    expect(cfg).not.toHaveProperty('goalMode')
    expect(cfg).not.toHaveProperty('raceDistance')
    expect(cfg).not.toHaveProperty('selectedMethodId')
    expect(cfg).toMatchObject({ athleteName: 'Mike', age: 42, experienceLevel: 'intermediate', raceType: 'road' })
    expect(localStorage.getItem('ba_onboarding_redo_mike')).toBeNull()
  }, 30_000)

  // A full phone is the browser's ~5 MB for the whole site (storageRoom.ts),
  // modelled as storageRoom.test.ts does.
  function installQuota(limit: number) {
    const original = Storage.prototype.setItem
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      let used = 0
      for (let i = 0; i < this.length; i++) {
        const k = this.key(i)!
        if (k !== key) used += k.length + (this.getItem(k)?.length ?? 0)
      }
      if (used + key.length + value.length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      original.call(this, key, value)
    })
  }
  const used = () => {
    let n = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      n += k.length + (localStorage.getItem(k)?.length ?? 0)
    }
    return n
  }
  /** Mid-redo, with `count` restore points of about `size` characters each. */
  function seedRedo(size: number, count = 8) {
    window.history.replaceState({}, '', '/app/#mike')
    localStorage.setItem('ba_tutorial_seen_mike', '1')
    localStorage.setItem('ba_onboarding_redo_mike', '1')
    const prev = {
      raceType: 'road', raceName: 'Fall Half', raceDate: addDays(todayDateString(), 90),
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
      athleteName: 'Mike', age: 42, maxHR: 178, completedAt: GENERATION,
    }
    localStorage.setItem('ba_onboarding_prev_mike', JSON.stringify(prev))
    localStorage.setItem('ba_plan_backups_mike', JSON.stringify(Array.from({ length: count }, (_, i) => ({
      savedAt: 1_000 - i, reason: i === 0 ? 'before redo' : 'auto', raceName: i === 0 ? 'Fall Half' : `Old plan ${i}`,
      completedAt: GENERATION, config: JSON.stringify({ ...prev, raceDescription: 'x'.repeat(size) }), edits: {},
    }))))
  }
  async function uploadToReview() {
    render(<App />)
    fireEvent.click(await screen.findByText('I already have a plan', {}, { timeout: 8000 }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByTestId('plan-file-input'), {
      target: { files: [new File(['%PDF-1.7\nplan'], 'Club-10K.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Use this plan', {}, { timeout: 8000 })
  }
  async function openThePlan() {
    fireEvent.click(await screen.findByText("Let's go", {}, { timeout: 8000 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start training' }, { timeout: 8000 }))
    expect((await screen.findAllByText(/Easy run|Long run \d/, {}, { timeout: 8000 })).length).toBeGreaterThan(0)
    expect(JSON.parse(localStorage.getItem('ba_onboarding_mike')!).importedPlan.title).toBe('Club 10K block')
    expect(importCalls).toHaveLength(1)
  }

  it('on a full phone, the older restore points make room and the plan is saved', async () => {
    seedRedo(5_000)
    await uploadToReview()
    // No room for the plan beside eight restore points.
    installQuota(used() + 500)
    fireEvent.click(screen.getByText('Use this plan'))
    expect(screen.queryByTestId('plan-import-save-failed')).toBeNull()
    await openThePlan()
    // The new plan's own, then the plan it replaced and the one before.
    const kept = JSON.parse(localStorage.getItem('ba_plan_backups_mike')!) as { raceName: string }[]
    expect(kept.map(b => b.raceName)).toEqual(['Club 10K block', 'Fall Half', 'Old plan 1'])
  }, 30_000)

  it('on a phone too full even for that, keeps the owner in onboarding with the plan to save again, not on the old plan', async () => {
    // Dropping the one older restore point frees less than the plan needs.
    seedRedo(0, 3)
    await uploadToReview()
    const ring = localStorage.getItem('ba_plan_backups_mike')
    const quota = installQuota(used() + 500)
    fireEvent.click(screen.getByText('Use this plan'))

    // Still in onboarding, with the plan kept: not the seed plan, not lost,
    // and not a restore point lost for nothing.
    expect((await screen.findByTestId('plan-import-save-failed')).textContent).toContain('This app’s storage on this phone is full')
    expect(localStorage.getItem('ba_onboarding_mike')).toBeNull()
    expect(localStorage.getItem('ba_onboarding_redo_mike')).toBe('1')
    expect(localStorage.getItem('ba_plan_backups_mike')).toBe(ring)
    fireEvent.click(screen.getByText('Try saving again'))
    expect(screen.getByTestId('plan-import-save-failed').textContent).toContain('Still no room')

    // Room appears (the app's data was cleared elsewhere, say): the same
    // plan is saved, without reading it again.
    quota.mockRestore()
    fireEvent.click(screen.getByText('Try saving again'))
    await openThePlan()
  }, 30_000)
})
