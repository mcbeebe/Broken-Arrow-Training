import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import PlanImportSheet from '../../components/PlanImportSheet'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { PlanImportDeps } from '../../hooks/usePlanImport'

/**
 * Initiative 004, PR 5: the upload sheet, end to end with a real File through
 * a real file input. The network is the only thing faked.
 */

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const TODAY = '2026-10-14'
const base = {
  raceType: 'road', raceName: 'Spring Marathon', raceDate: '2027-04-18', raceDistance: 'marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
  athleteName: 'Mike', age: 42, completedAt: '2026-09-01T00:00:00.000Z',
} as OnboardingConfig

const EXTRACTION = {
  status: 'ok', title: 'Club 10K block', sport: 'road', units: 'mi',
  weeks: [
    { s: [{ d: 'tue', t: 'run', w: 'Easy run', dist: 4 }, { d: 'sun', t: 'long', w: 'Long run', dist: 8 }] },
    { s: [{ d: 'tue', t: 'run', w: 'Easy run', dist: 4 }, { d: 'sun', t: 'long', w: 'Long run', dist: 9 }] },
  ],
}
const ok = (extraction: unknown = EXTRACTION) =>
  new Response(JSON.stringify({ extraction, warnings: [], usage: { input: 1, output: 1 }, importsLeft: 4 }), { status: 200 })

const pdfFile = (name = 'Coach-Riley-Plan.pdf') => new File(['%PDF-1.7\nplan'], name, { type: 'application/pdf' })

function setup(fetchImpl: PlanImportDeps['fetchImpl'], onUse: (cfg: OnboardingConfig) => boolean = () => true) {
  const onClose = vi.fn()
  const use = vi.fn(onUse)
  const deps: PlanImportDeps = {
    fetchImpl, base: 'https://api.example.test', headers: { Authorization: 'Bearer t' },
    resize: async () => ({ base64: 'SlBFRw==', mediaType: 'image/jpeg', bytes: 4 }),
  }
  const view = render(<PlanImportSheet base={base} onUse={use} onClose={onClose} todayIso={TODAY} deps={deps} />)
  return { ...view, onClose, onUse: use }
}

const choose = (file: File, testId = 'plan-file-input') =>
  fireEvent.change(screen.getByTestId(testId), { target: { files: [file] } })

describe('a PDF, from pick to plan', () => {
  it('reads once, shows the review, and saves what the athlete approves', async () => {
    let answer: (r: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>(r => { answer = r }))
    const { onUse } = setup(fetchImpl as unknown as typeof fetch)

    expect((screen.getByText('Read my plan') as HTMLButtonElement).disabled).toBe(true)
    choose(pdfFile())
    expect(screen.getByTestId('plan-file-chosen').textContent).toContain('Coach-Riley-Plan.pdf')
    fireEvent.change(screen.getByLabelText(/Anything we should know/), { target: { value: 'Intermediate column' } })
    fireEvent.click(screen.getByText('Read my plan'))

    expect((await screen.findByTestId('plan-import-reading')).textContent).toContain('Reading Coach-Riley-Plan.pdf')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent).toMatchObject({ kind: 'pdf', hint: 'Intermediate column' })
    expect(atob(sent.data)).toBe('%PDF-1.7\nplan')
    // D10: the file's name never leaves the browser.
    expect(JSON.stringify(sent)).not.toContain('Coach-Riley')

    answer(ok())
    expect(await screen.findByText('Check your plan')).toBeTruthy()
    expect(screen.getByTestId('import-left').textContent).toBe('4 uploads left today')
    fireEvent.click(screen.getByText('Use this plan'))
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(onUse.mock.calls[0][0]).toMatchObject({ importedPlan: { title: 'Club 10K block' }, planStartPinnedIso: '2026-10-12' })
    expect(onUse.mock.calls[0][0].importedPlan?.source.name).toBe('Coach-Riley-Plan.pdf')
  })

  it('cancelling a read goes back to the picker, file still chosen, nothing saved', async () => {
    let seen: AbortSignal | undefined
    const fetchImpl = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      seen = init?.signal ?? undefined
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const { onUse } = setup(fetchImpl as unknown as typeof fetch)
    choose(pdfFile())
    fireEvent.click(screen.getByText('Read my plan'))
    await screen.findByTestId('plan-import-reading')
    fireEvent.click(screen.getByText('Cancel'))
    expect(await screen.findByTestId('plan-import-pick')).toBeTruthy()
    expect(seen?.aborted).toBe(true)
    expect(screen.getByTestId('plan-file-chosen')).toBeTruthy()
    expect(onUse).not.toHaveBeenCalled()
  })
})

describe('while a file is being prepared', () => {
  it('the reading screen shows at once, before anything is sent, and Cancel still works', async () => {
    const fetchImpl = vi.fn()
    const deps: PlanImportDeps = {
      fetchImpl: fetchImpl as unknown as typeof fetch, base: 'https://api.example.test', headers: {},
      // A photo that takes its time to re-encode, as a big Word file does to unzip.
      resize: () => new Promise(() => {}),
    }
    render(<PlanImportSheet base={base} onUse={vi.fn(() => true)} onClose={vi.fn()} todayIso={TODAY} deps={deps} />)
    choose(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(15_500_000)], 'IMG_0412.jpg', { type: 'image/jpeg' }))
    fireEvent.click(screen.getByText('Read my plan'))
    expect(await screen.findByTestId('plan-import-reading')).toBeTruthy()
    expect(screen.getByText('Reading IMG_0412.jpg…')).toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cancel'))
    expect(await screen.findByTestId('plan-import-pick')).toBeTruthy()
    // Sizes in decimal units, as the limits are stated.
    expect(screen.getByTestId('plan-file-chosen').textContent).toContain('15.5 MB')
  })
})

describe('other ways in', () => {
  it('pasted text goes as text', async () => {
    const fetchImpl = vi.fn(async () => ok())
    setup(fetchImpl as unknown as typeof fetch)
    fireEvent.click(screen.getByText('Paste text'))
    fireEvent.change(screen.getByLabelText('Paste your plan'), { target: { value: 'Week 1\nTue easy 4' } })
    fireEvent.click(screen.getByText('Read my plan'))
    await screen.findByText('Check your plan')
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent).toEqual({ kind: 'text', text: 'Week 1\nTue easy 4' })
  })

  it('the camera input asks for the back camera, and a photo goes as an image', async () => {
    const fetchImpl = vi.fn(async () => ok())
    setup(fetchImpl as unknown as typeof fetch)
    expect(screen.getByTestId('plan-camera-input').getAttribute('capture')).toBe('environment')
    choose(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0412.jpg', { type: 'image/jpeg' }), 'plan-camera-input')
    fireEvent.click(screen.getByText('Read my plan'))
    await screen.findByText('Check your plan')
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent).toEqual({ kind: 'image', data: 'SlBFRw==', mediaType: 'image/jpeg' })
  })

  it('the picker offers Word and Excel files, and the older formats so it can ask for a re-save', () => {
    setup(vi.fn() as unknown as typeof fetch)
    expect(screen.getByTestId('plan-file-input').getAttribute('accept')).toMatch(/\.docx.*\.xlsx.*\.doc.*\.xls/)
  })
})

describe('when it doesn\'t become a plan', () => {
  it('a Word file that won\'t open says so, and sends nothing', async () => {
    const fetchImpl = vi.fn()
    setup(fetchImpl as unknown as typeof fetch)
    choose(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'Coach-block-2.docx'))
    fireEvent.click(screen.getByText('Read my plan'))
    expect((await screen.findByTestId('plan-import-error')).textContent).toContain("We couldn't open that file")
    expect(screen.getByText("This didn't count toward today's uploads.")).toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a Word plan is read in the browser and sent as its text', async () => {
    const fetchImpl = vi.fn(async () => ok())
    setup(fetchImpl as unknown as typeof fetch)
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    choose(new File([zipSync({ 'word/document.xml': strToU8(`<w:document ${W}><w:body><w:p><w:r><w:t>Tue easy 4</w:t></w:r></w:p></w:body></w:document>`) })], 'Club-plan.docx'))
    fireEvent.click(screen.getByText('Read my plan'))
    await screen.findByText('Check your plan')
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent).toEqual({ kind: 'docx', text: 'Tue easy 4' })
  })

  it('a file that holds no plan says so, and that it used an upload', async () => {
    setup((async () => ok({ status: 'not_a_plan', title: 'Race info packet', weeks: [] })) as typeof fetch)
    choose(pdfFile('Race-info-packet.pdf'))
    fireEvent.click(screen.getByText('Read my plan'))
    const err = await screen.findByTestId('plan-import-error')
    expect(err.textContent).toContain("We couldn't find a plan in that file")
    expect(err.textContent).toContain('Race-info-packet.pdf')
    expect(err.textContent).toContain('Nothing has changed: your current plan is untouched.')
    expect(err.textContent).toContain("This counted as one of today's uploads.")
    expect(err.textContent).toContain('What usually works')
  })

  it('the daily cap names the limit', async () => {
    setup((async () => new Response(JSON.stringify({ error: 'import_limit', used: 5, limit: 5 }), { status: 429 })) as typeof fetch)
    choose(pdfFile())
    fireEvent.click(screen.getByText('Read my plan'))
    const err = await screen.findByTestId('plan-import-error')
    expect(err.textContent).toContain("That's today's uploads used")
    expect(err.textContent).toContain('You can upload 5 plans a day.')
  })

  it('a plan that can\'t be saved says so, and can be saved again without a second read', async () => {
    const fetchImpl = vi.fn(async () => ok())
    let full = true
    const { onUse } = setup(fetchImpl as unknown as typeof fetch, () => !full)
    choose(pdfFile())
    fireEvent.click(screen.getByText('Read my plan'))
    fireEvent.click(await screen.findByText('Use this plan'))
    expect((await screen.findByTestId('plan-import-save-failed')).textContent).toContain('We couldn’t save your plan')
    // Back to the review keeps the plan that was read.
    fireEvent.click(screen.getByText('Back to the review'))
    fireEvent.click(screen.getByText('Use this plan'))
    full = false
    fireEvent.click(await screen.findByText('Try saving again'))
    expect(onUse).toHaveBeenCalledTimes(3)
    expect(onUse.mock.calls[2][0]).toEqual(onUse.mock.calls[0][0])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('plan-import-save-failed')).toBeNull()
  })

  it('a paste over the limit is refused whole, never cut short and sent', async () => {
    const fetchImpl = vi.fn()
    setup(fetchImpl as unknown as typeof fetch)
    fireEvent.click(screen.getByText('Paste text'))
    const box = screen.getByLabelText('Paste your plan')
    expect(box.hasAttribute('maxlength')).toBe(false)
    fireEvent.change(box, { target: { value: 'x'.repeat(120_001) } })
    fireEvent.click(screen.getByText('Read my plan'))
    expect((await screen.findByTestId('plan-import-error')).textContent).toContain("That's more text than we can read at once")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('closing', () => {
  it('from the picker, the backdrop closes', () => {
    const { container, onClose } = setup(vi.fn() as unknown as typeof fetch)
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('over a plan being reviewed, it asks first', async () => {
    const { container, onClose } = setup((async () => ok()) as typeof fetch)
    choose(pdfFile())
    fireEvent.click(screen.getByText('Read my plan'))
    await screen.findByText('Check your plan')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(container.firstChild as HTMLElement)
    expect(confirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('Close'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
