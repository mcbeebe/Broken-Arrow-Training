import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

/**
 * Initiative 004, PR 7: onboarding's "I already have a plan". The athlete
 * picks their plan, answers the few questions an uploaded plan still needs
 * while it is read, then checks it and it becomes their plan. A real File
 * through the real file input; the network is the only thing faked, and it is
 * slow on purpose, as the real read takes a minute or two.
 */

const logInteraction = vi.fn()
vi.mock('../../hooks/useCoachTelemetry', () => ({
  useCoachTelemetry: () => ({ logInteraction, flush: vi.fn() }),
}))
const Onboarding = (await import('../../components/Onboarding')).default

const API = 'https://api.example.test'
const EXTRACTION = {
  status: 'ok', title: 'Club 10K block', sport: 'road', units: 'mi',
  weeks: [
    { s: [{ d: 'tue', t: 'run', w: 'Easy run', dist: 4 }, { d: 'sun', t: 'long', w: 'Long run', dist: 8 }] },
    { s: [{ d: 'tue', t: 'run', w: 'Easy run', dist: 4 }, { d: 'sun', t: 'long', w: 'Long run', dist: 9 }] },
  ],
}
const ok = (extraction: unknown = EXTRACTION) =>
  new Response(JSON.stringify({ extraction, warnings: [], usage: { input: 1, output: 1 }, importsLeft: 4 }), { status: 200 })

const pdf = (name = 'Coach-Riley-Plan.pdf') => new File(['%PDF-1.7\nplan'], name, { type: 'application/pdf', lastModified: 1_760_000_000_000 })
const busy = () => new Response(JSON.stringify({ error: 'busy' }), { status: 503 })

interface Call { body: Record<string, unknown>; signal?: AbortSignal; answer: (r: Response) => void }
let calls: Call[] = []

beforeEach(() => {
  calls = []
  logInteraction.mockClear()
  window.scrollTo = () => {}
  vi.stubEnv('VITE_COACH_API_URL', API)
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    if (!String(url).endsWith('/api/coach/plan_import')) throw new Error(`unexpected fetch ${url}`)
    return new Promise<Response>(answer => {
      calls.push({ body: JSON.parse(init.body as string), signal: init.signal ?? undefined, answer })
    })
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const continueButton = () => screen.queryByRole('button', { name: /^(continue|create my plan)$/i }) as HTMLButtonElement | null
const clickContinue = () => fireEvent.click(continueButton()!)
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }))
const choose = (file: File) => fireEvent.change(screen.getByTestId('plan-file-input'), { target: { files: [file] } })
const heading = () => screen.getByRole('heading', { level: 1 }).textContent

function start(props: Partial<Parameters<typeof Onboarding>[0]> = {}) {
  const onComplete = vi.fn<(cfg: OnboardingConfig) => void>()
  render(<Onboarding athleteId="mike" onComplete={onComplete} loadingDurationMs={0} {...props} />)
  return { onComplete }
}

/** Goal mode → the upload step, with a file picked and Continue pressed. */
function pickAndContinue(file = pdf(), hint = '') {
  fireEvent.click(screen.getByText('I already have a plan'))
  clickContinue()
  expect(heading()).toBe('Upload your plan')
  choose(file)
  if (hint) fireEvent.change(screen.getByLabelText(/Anything we should know/), { target: { value: hint } })
  clickContinue()
}

/** Experience, profile and wearable, as a first-time athlete answers them. */
function answerQuestions() {
  expect(heading()).toBe('How would you rate your fitness?')
  fireEvent.click(screen.getByText('Intermediate')); clickContinue()
  fireEvent.change(screen.getByPlaceholderText('e.g. Jenn'), { target: { value: 'Mike' } })
  fireEvent.change(screen.getByPlaceholderText('e.g. 41'), { target: { value: '42' } })
  clickContinue()
  fireEvent.click(screen.getByText('Garmin Watch')); clickContinue()
}

const definedKeys = (cfg: OnboardingConfig) => Object.keys(cfg).filter(k => cfg[k as keyof OnboardingConfig] !== undefined).sort()
const FIRST_TIME_KEYS = [
  'age', 'athleteName', 'completedAt', 'detailLevel', 'experienceLevel', 'importedPlan', 'maxHR',
  'planStartPinnedIso', 'raceDate', 'raceName', 'raceType', 'trainingDaysPerWeek', 'wearable',
]

const events = (kind: string) => logInteraction.mock.calls.filter(([k]) => k === kind).map(([, meta]) => meta as Record<string, unknown>)

describe('who sees "I already have a plan"', () => {
  it('the owner, with the coach API there to read the plan', () => {
    start()
    expect(screen.getByText('I already have a plan')).toBeTruthy()
  })

  it('nobody else yet (D8)', () => {
    start({ athleteId: 'jim' })
    expect(screen.queryByText('I already have a plan')).toBeNull()
    expect(screen.getByText('General fitness')).toBeTruthy()
    expect(screen.queryByTestId('plan-file-input')).toBeNull()
  })

  it('not the owner either, when nothing could read the plan', () => {
    vi.unstubAllEnvs()
    start()
    expect(screen.queryByText('I already have a plan')).toBeNull()
  })
})

describe('a first-time athlete with their own plan', () => {
  it('is read while they answer, once, and becomes their plan as they checked it', async () => {
    const { onComplete } = start()
    fireEvent.click(screen.getByText('I already have a plan'))
    clickContinue()
    expect(heading()).toBe('Upload your plan')
    expect(continueButton()!.disabled).toBe(true)
    choose(pdf())
    expect(screen.getByTestId('plan-file-chosen').textContent).toContain('Coach-Riley-Plan.pdf')
    // The shared fields are drawn for a dark surface in dark mode, and a redo
    // can start from dark mode; onboarding itself is light-only.
    expect(screen.getByTestId('onboarding-import-pick').className).toContain('dark:bg-slate-800')
    fireEvent.change(screen.getByLabelText(/Anything we should know/), { target: { value: 'Intermediate column' } })
    expect(calls).toHaveLength(0)
    clickContinue()

    // The read starts now and runs while the athlete answers.
    expect(screen.getByTestId('import-progress').textContent).toContain('Reading Coach-Riley-Plan.pdf')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toMatchObject({ kind: 'pdf', hint: 'Intermediate column' })
    expect(JSON.stringify(calls[0].body)).not.toContain('Coach-Riley')
    answerQuestions()

    // Still reading at the end: the review waits, with no "Create My Plan"
    // and none of the generated plan's setup summary.
    expect(screen.getByTestId('plan-import-reading').textContent).toContain('Reading Coach-Riley-Plan.pdf')
    expect(continueButton()).toBeNull()
    expect(screen.queryByText('Review your plan setup')).toBeNull()
    // A heading for the step, and seconds that are seen, not read out each tick.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your plan')
    expect(screen.getByText(/^\d+s$/).getAttribute('aria-hidden')).toBe('true')
    calls[0].answer(ok())
    expect(await screen.findByText('Check your plan')).toBeTruthy()
    expect(calls).toHaveLength(1)

    fireEvent.click(screen.getByText('Use this plan'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    const cfg = onComplete.mock.calls[0][0]
    expect(cfg.importedPlan?.title).toBe('Club 10K block')
    expect(cfg.raceType).toBe('road')
    expect(cfg.goalMode).toBeUndefined()
    expect(cfg.additionalRaces).toBeUndefined()
    expect(cfg).toMatchObject({ athleteName: 'Mike', age: 42, maxHR: 178, experienceLevel: 'intermediate', wearable: 'garmin', trainingDaysPerWeek: 5 })
    expect(new Date(`${cfg.planStartPinnedIso}T12:00:00Z`).getUTCDay()).toBe(1)
    // What this path asked, the plan, and nothing else.
    expect(definedKeys(cfg)).toEqual(FIRST_TIME_KEYS)
  })

  it('reports the new step by name, and the finish as an upload', async () => {
    start()
    pickAndContinue()
    // Picking a goal re-reports the first step with the new length, as on
    // every path; what matters is the order and the name.
    const entered = events('onboarding_step_entered').map(m => m.step)
    expect(entered.filter((s, i) => s !== entered[i - 1])).toEqual(['goal_mode', 'import_plan', 'experience'])
    answerQuestions()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(ok())
    fireEvent.click(await screen.findByText('Use this plan'))
    expect(events('onboarding_completed')).toEqual([{ steps: 6, redo: false, goalMode: 'import' }])
  })

  it('the questions show the read finishing, or failing, as it happens', async () => {
    start()
    pickAndContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(ok())
    expect((await screen.findByText('Coach-Riley-Plan.pdf is read.')).closest('[data-testid="import-progress"]')).toBeTruthy()
  })
})

describe('going back and forth', () => {
  it('the same pick is read once, however often the athlete comes back to it', async () => {
    start()
    pickAndContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    back()
    expect(heading()).toBe('Upload your plan')
    // Back on the upload step, the athlete sees the pick is being read.
    expect(screen.getByTestId('import-progress').textContent).toContain('Reading Coach-Riley-Plan.pdf')
    expect(screen.getByTestId('plan-file-chosen').textContent).toContain('Coach-Riley-Plan.pdf')
    clickContinue()
    back(); back()
    expect(heading()).toBe('What are you training for?')
    clickContinue(); clickContinue()
    await new Promise(r => setTimeout(r, 0))
    expect(calls).toHaveLength(1)
    expect(calls[0].signal?.aborted).toBe(false)
  })

  it('a note changed only by spaces, or the same file chosen again, is the same pick', async () => {
    start()
    pickAndContinue(pdf(), 'Intermediate')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    back()
    // Phone keyboards add a space after a word; the note is sent trimmed.
    fireEvent.change(screen.getByLabelText(/Anything we should know/), { target: { value: 'Intermediate ' } })
    choose(pdf())
    clickContinue()
    await new Promise(r => setTimeout(r, 0))
    expect(calls).toHaveLength(1)
    expect(calls[0].signal?.aborted).toBe(false)
  })

  it('a changed note, or another file, is read again and the first read stopped', async () => {
    start()
    pickAndContinue(pdf(), 'Intermediate column')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    back()
    fireEvent.change(screen.getByLabelText(/Anything we should know/), { target: { value: 'Advanced column' } })
    clickContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[0].signal?.aborted).toBe(true)
    expect(calls[1].body.hint).toBe('Advanced column')

    back()
    choose(pdf('Other-plan.pdf'))
    // The strip is about the read, and that read is of another pick now.
    expect(screen.queryByTestId('import-progress')).toBeNull()
    clickContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[1].signal?.aborted).toBe(true)
    expect(screen.getByTestId('import-progress').textContent).toContain('Reading Other-plan.pdf')
  })

  it('pasted text is read as text, and editing it reads it again', async () => {
    start()
    fireEvent.click(screen.getByText('I already have a plan'))
    clickContinue()
    fireEvent.click(screen.getByText('Paste text'))
    expect(continueButton()!.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Paste your plan'), { target: { value: 'Week 1\nTue easy 4' } })
    clickContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({ kind: 'text', text: 'Week 1\nTue easy 4' })
    back()
    fireEvent.change(screen.getByLabelText('Paste your plan'), { target: { value: 'Week 1\nTue easy 5' } })
    clickContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(2))
  })

  it('a race started and abandoned leaves nothing in the uploaded plan', async () => {
    const { onComplete } = start()
    fireEvent.click(screen.getByText('A specific race'))
    clickContinue()
    fireEvent.click(screen.getByText('Road Race'))
    clickContinue()
    fireEvent.change(screen.getByPlaceholderText('e.g. Boston Marathon'), { target: { value: 'Boston' } })
    fireEvent.change(screen.getByPlaceholderText(/Terrain, elevation/i), { target: { value: 'Rolling course with the Newton hills.' } })
    fireEvent.change(screen.getByPlaceholderText(/finish strong/i), { target: { value: 'Sub 3' } })
    fireEvent.click(screen.getByText(/I have another race after this one/i))
    fireEvent.change(screen.getByPlaceholderText(/Second race name/i), { target: { value: 'Fall Half' } })
    fireEvent.change(screen.getByLabelText('Second race date'), { target: { value: '2027-10-10' } })
    back(); back()

    pickAndContinue()
    answerQuestions()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(ok())
    fireEvent.click(await screen.findByText('Use this plan'))
    const cfg = onComplete.mock.calls[0][0]
    expect(cfg.raceName).toBe('')
    expect(cfg.raceType).toBe('road')
    for (const field of ['additionalRaces', 'raceDescription', 'athleteGoal', 'raceDistance', 'goalMode'] as const) {
      expect(cfg[field], field).toBeUndefined()
    }
    expect(definedKeys(cfg)).toEqual(FIRST_TIME_KEYS)
  })

  it('choosing another goal after all builds a plan as before', async () => {
    const { onComplete } = start({ athleteId: 'mike' })
    pickAndContinue()
    back(); back()
    fireEvent.click(screen.getByText('General fitness'))
    clickContinue()
    expect(heading()).not.toBe('Upload your plan')
    expect(screen.queryByTestId('import-progress')).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('when the plan can\'t be used', () => {
  it('a file that holds no plan says why at the end, and Try another file goes back to the upload', async () => {
    start()
    pickAndContinue(pdf('Race-info-packet.pdf'))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(ok({ status: 'not_a_plan', title: 'Race info packet', weeks: [] }))
    expect((await screen.findByTestId('import-progress')).textContent).toContain('We couldn’t read Race-info-packet.pdf.')
    answerQuestions()

    const err = screen.getByTestId('plan-import-error')
    expect(err.textContent).toContain("We couldn't find a plan in that file")
    expect(err.textContent).toContain("This counted as one of today's uploads.")
    // Onboarding has no current plan to promise is untouched.
    expect(err.textContent).not.toContain('your current plan is untouched')
    expect(continueButton()).toBeNull()

    // Nothing about the file says trying it again would help.
    expect(within(err).queryByText('Try again')).toBeNull()
    fireEvent.click(within(err).getByText('Try another file'))
    expect(heading()).toBe('Upload your plan')
    // The same file again is not read again...
    clickContinue()
    expect(heading()).toBe('How would you rate your fitness?')
    back()
    // ...another one is.
    choose(pdf('Coach-Riley-Plan.pdf'))
    clickContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(2))
  })

  it('a read that failed while the athlete was back on the upload step is shown there, and Continue doesn\'t spend another', async () => {
    start()
    pickAndContinue(pdf('Race-info-packet.pdf'))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    back()
    calls[0].answer(ok({ status: 'not_a_plan', title: 'Race info packet', weeks: [] }))
    expect((await screen.findByText('We couldn’t read Race-info-packet.pdf.')).closest('[data-testid="import-progress"]')).toBeTruthy()
    clickContinue()
    answerQuestions()
    expect(screen.getByTestId('plan-import-error').textContent).toContain("We couldn't find a plan in that file")
    expect(calls).toHaveLength(1)
  })

  it('a busy reader can be tried again with the same file, by asking', async () => {
    const { onComplete } = start()
    pickAndContinue()
    answerQuestions()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(busy())
    const err = await screen.findByTestId('plan-import-error')
    expect(err.textContent).toContain("This didn't count toward today's uploads.")
    fireEvent.click(within(err).getByText('Try again'))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].body).toEqual(calls[0].body)
    calls[1].answer(ok())
    fireEvent.click(await screen.findByText('Use this plan'))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('a file refused on the phone costs nothing and is explained the same way', async () => {
    start()
    pickAndContinue(new File(['not a pdf'], 'Plan.pdf', { type: 'application/pdf' }))
    answerQuestions()
    expect((await screen.findByTestId('plan-import-error')).textContent).toContain("This didn't count toward today's uploads.")
    expect(calls).toHaveLength(0)
  })

  it('Cancel while reading stops the read and goes back to the upload', async () => {
    start()
    pickAndContinue()
    answerQuestions()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    fireEvent.click(within(screen.getByTestId('plan-import-reading')).getByText('Cancel'))
    expect(calls[0].signal?.aborted).toBe(true)
    expect(heading()).toBe('Upload your plan')
    // The pick is still there: Continue reads it again.
    clickContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(2))
  })

  it('Upload a different file goes back to the upload, and keeps the plan read until another is chosen', async () => {
    const opened = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { onComplete } = start()
    pickAndContinue()
    answerQuestions()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(ok())
    fireEvent.click(await screen.findByText('Upload a different file'))
    expect(heading()).toBe('Upload your plan')
    expect(opened).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
    // The chooser was closed with nothing picked: the plan already read is
    // still there, and costs nothing more (experience, profile, wearable).
    clickContinue(); clickContinue(); clickContinue(); clickContinue()
    expect(await screen.findByText('Check your plan')).toBeTruthy()
    expect(calls).toHaveLength(1)
    opened.mockRestore()
  })

  it('closing onboarding mid-read sends nothing more', async () => {
    const { unmount } = render(<Onboarding athleteId="mike" onComplete={vi.fn()} loadingDurationMs={0} />)
    pickAndContinue()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    unmount()
    expect(calls[0].signal?.aborted).toBe(true)
  })
})

describe('the owner redoing onboarding with their own plan', () => {
  const previousConfig = {
    raceType: 'hyrox', raceName: 'HYROX Chicago', raceDate: '2026-11-14',
    experienceLevel: 'advanced', trainingDaysPerWeek: 6, wearable: 'apple_watch',
    athleteName: 'Mike', age: 47, sex: 'male', maxHR: 181, ftpWatts: 250,
    hyroxDivision: 'pro', equipmentAccess: ['gym', 'track'], strengthDaysPerWeek: 2,
    injuryStatus: 'current', injuryArea: 'knee', injuryTimeframe: '2-4_weeks', injuryNote: 'Patellar tendon',
    testedLthrBpm: 168, detailLevel: 'simple', longRunDay: 'Saturday', scheduleConstraintsNote: 'Kids on Tuesdays',
    raceDistance: 'marathon', selectedMethodId: 'higdon', planStartDate: '2026-09-07',
    goalMode: 'season', additionalRaces: [{ name: 'Fall Half', date: '2026-10-25', priority: 'B' }],
    completedAt: '2026-09-01T00:00:00.000Z', valuePropsSeenAt: '2026-09-01T00:00:00.000Z',
  } as OnboardingConfig

  it('asks only for the upload and the wearable, and keeps who they are', async () => {
    const { onComplete } = start({ previousConfig })
    fireEvent.click(screen.getByText('I already have a plan'))
    clickContinue()
    choose(pdf())
    clickContinue()
    expect(heading()).toMatch(/wearable/i)
    clickContinue() // the wearable is prefilled
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].answer(ok())
    fireEvent.click(await screen.findByText('Use this plan'))

    const cfg = onComplete.mock.calls[0][0]
    expect(cfg).toMatchObject({
      athleteName: 'Mike', age: 47, sex: 'male', maxHR: 181, ftpWatts: 250, experienceLevel: 'advanced',
      wearable: 'apple_watch', equipmentAccess: ['gym', 'track'], strengthDaysPerWeek: 2,
      trainingDaysPerWeek: 6, hyroxDivision: 'pro', raceType: 'road',
      // Who they are doesn't change with the plan they follow, as an upload
      // from Settings keeps it too.
      injuryStatus: 'current', injuryArea: 'knee', injuryTimeframe: '2-4_weeks', injuryNote: 'Patellar tendon',
      testedLthrBpm: 168, detailLevel: 'simple', longRunDay: 'Saturday', scheduleConstraintsNote: 'Kids on Tuesdays',
    })
    for (const field of ['raceDistance', 'selectedMethodId', 'planStartDate'] as const) {
      expect(cfg[field], field).toBeUndefined()
    }
    // The old plan's race and season are not the uploaded plan's.
    expect(cfg.raceName).toBe('')
    expect(cfg.goalMode).toBeUndefined()
    expect(cfg.additionalRaces).toBeUndefined()
    expect(cfg.valuePropsSeenAt).toBeUndefined()
    expect(events('onboarding_completed')).toEqual([{ steps: 4, redo: true, goalMode: 'import' }])
  })
})
