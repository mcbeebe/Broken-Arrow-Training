import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { usePlanPick } from '../../hooks/usePlanPick'
import PlanPickFields from '../../components/PlanPickFields'
import { UPLOAD_LIMITS } from '../../utils/planImport/uploadLimits'

/**
 * Initiative 004, PR 7: the picker the Settings sheet and onboarding share.
 * What it would send is what the athlete sees picked, and a new pick tells
 * its owner, so a plan read from the last pick is never shown for this one.
 */

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Harness({ onNewPick }: { onNewPick: () => void }) {
  const pick = usePlanPick(onNewPick)
  const input = pick.input && ('file' in pick.input ? { file: pick.input.file.name, hint: pick.input.hint } : pick.input)
  return (
    <>
      {pick.inputs}
      <PlanPickFields pick={pick} />
      <output data-testid="input">{JSON.stringify(input)}</output>
    </>
  )
}

function setup() {
  const onNewPick = vi.fn()
  render(<Harness onNewPick={onNewPick} />)
  return { onNewPick }
}

const input = () => JSON.parse(screen.getByTestId('input').textContent!)
const choose = (name: string, testId = 'plan-file-input') =>
  fireEvent.change(screen.getByTestId(testId), { target: { files: [new File(['%PDF-1.7'], name, { type: 'application/pdf' })] } })

describe('usePlanPick', () => {
  it('a chosen file is the pick, with the note, and says the last read no longer applies', () => {
    const { onNewPick } = setup()
    expect(input()).toBeNull()
    choose('Plan.pdf')
    expect(onNewPick).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText(/Anything we should know/), { target: { value: 'Intermediate column' } })
    expect(input()).toEqual({ file: 'Plan.pdf', hint: 'Intermediate column' })
    choose('Other.pdf')
    expect(onNewPick).toHaveBeenCalledTimes(2)
    expect(input().file).toBe('Other.pdf')
  })

  it('a photo is a pick like any file', () => {
    const { onNewPick } = setup()
    choose('IMG_0412.jpg', 'plan-camera-input')
    expect(onNewPick).toHaveBeenCalledTimes(1)
    expect(input().file).toBe('IMG_0412.jpg')
  })

  it('pasting drops the file, and blank text is no pick', () => {
    const { onNewPick } = setup()
    choose('Plan.pdf')
    fireEvent.click(screen.getByText('Paste text'))
    expect(onNewPick).toHaveBeenCalledTimes(2)
    expect(input()).toBeNull()
    fireEvent.change(screen.getByLabelText('Paste your plan'), { target: { value: '  \n\t ' } })
    expect(input()).toBeNull()
    fireEvent.change(screen.getByLabelText('Paste your plan'), { target: { value: 'Week 1\nTue easy 4' } })
    expect(input()).toEqual({ text: 'Week 1\nTue easy 4', hint: '' })
    // Back to a file: the one chosen before pasting is gone.
    fireEvent.click(screen.getByText('Upload a file instead'))
    expect(input()).toBeNull()
    expect(screen.queryByTestId('plan-file-chosen')).toBeNull()
    expect(screen.getByText('Choose a file')).toBeTruthy()
  })

  it('choosing a file while pasting goes back to the file', () => {
    setup()
    fireEvent.click(screen.getByText('Paste text'))
    fireEvent.change(screen.getByLabelText('Paste your plan'), { target: { value: 'Week 1' } })
    choose('Plan.pdf')
    expect(screen.queryByLabelText('Paste your plan')).toBeNull()
    expect(screen.getByTestId('plan-file-chosen').textContent).toContain('Plan.pdf')
    expect(input().file).toBe('Plan.pdf')
  })

  it('the camera says the last read no longer applies before it opens', () => {
    const order: string[] = []
    const onNewPick = vi.fn(() => { order.push('new pick') })
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      order.push(`open ${this.dataset.testid}`)
    })
    render(<Harness onNewPick={onNewPick} />)
    fireEvent.click(screen.getByText('Take a photo'))
    expect(order).toEqual(['new pick', 'open plan-camera-input'])
    fireEvent.click(screen.getByText('Choose a file'))
    // Opening the chooser changes nothing until a file is chosen.
    expect(order).toEqual(['new pick', 'open plan-camera-input', 'open plan-file-input'])
  })

  it('the note is held to what the reader takes', () => {
    setup()
    expect((screen.getByLabelText(/Anything we should know/) as HTMLInputElement).maxLength).toBe(UPLOAD_LIMITS.maxHintChars)
  })
})
