/**
 * The free vert-adjusted finish predictor page, driven the way a visitor
 * would. Field bug (2026-10-08, live site): a half typed as "1:35" showed
 * "VDOT 17300.5" and 1:44:00 in every card. The numbers themselves are
 * toolMath's (see toolMath.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Predictor } from '../../tools/Predictor'
import { finishScenarios, formatHms } from '../../tools/toolMath'

function setup() {
  const user = userEvent.setup()
  const { container } = render(<Predictor />)
  const [recentDist, targetDist] = screen.getAllByLabelText('Distance (miles)') as HTMLInputElement[]
  const time = screen.getByLabelText('Finish time (h:mm:ss)') as HTMLInputElement
  const climb = screen.getByLabelText('Total climb (feet)') as HTMLInputElement
  const set = async (input: HTMLInputElement, value: string) => {
    await user.clear(input)
    await user.type(input, value)
  }
  return { container, recentDist, targetDist, time, climb, set }
}

describe('Predictor', () => {
  it('the reported case: a 13.1 mi race typed as 1:35, predicting 26 mi with 100 ft of climb', async () => {
    const { container, recentDist, targetDist, time, climb, set } = setup()
    await set(recentDist, '13.1')
    await set(time, '1:35')
    await set(targetDist, '26')
    await set(climb, '100')
    const s = finishScenarios(13.1, 95 * 60, 26, 100)!
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:35:00.')
    expect(container).toHaveTextContent(`VDOT ${s.vdot}`)
    expect(container).not.toHaveTextContent('VDOT 17300')
    expect(container).toHaveTextContent(`Realistic${formatHms(s.realisticSeconds)}`)
    expect(container).not.toHaveTextContent('1:44:00')
  })

  it('keeps a 5K time as minutes and seconds', async () => {
    const { container, recentDist, time, set } = setup()
    await set(recentDist, '3.1')
    await set(time, '19:30')
    expect(container).toHaveTextContent('Reading your race as 3.1 mi in 19:30.')
  })

  it('takes digits without colons, as the app does (a phone keypad has no colon)', async () => {
    const { container, time, set } = setup()
    await set(time, '13500')
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:35:00.')
  })

  it('asks again instead of showing nonsense, in a status line that was there all along', async () => {
    const { container, time, set } = setup()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    await set(time, 'fast')
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Enter both distances in miles and your finish time as h:mm:ss, like 1:35:00.')
    expect(container).not.toHaveTextContent('Realistic')
  })

  it('opens on its default example without a prompt', () => {
    const { container } = setup()
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:45:00.')
  })
})
