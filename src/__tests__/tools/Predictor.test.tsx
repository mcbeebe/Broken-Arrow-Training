/**
 * The free vert-adjusted finish predictor page, driven the way a visitor
 * would. Field bug (2026-10-08, live site): a half typed as "1:35" showed
 * "VDOT 17300.5" and 1:44:00 in every card. Expected numbers are pinned
 * literals, not recomputed with the code under test.
 */
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Predictor } from '../../tools/Predictor'

const ASK = 'Enter both distances in miles and your finish time as h:mm:ss, like 1:35:00.'
const OUT_OF_RANGE =
  'That’s outside what this calculator covers: race paces from 4:00 to 25:00 a mile, up to world-record level. Check that the distances are in miles and the time is h:mm:ss.'

function setup() {
  const user = userEvent.setup()
  const { container } = render(<Predictor />)
  const [recentDist, targetDist] = screen.getAllByLabelText('Distance (miles)') as HTMLInputElement[]
  const time = screen.getByLabelText('Finish time (h:mm:ss)') as HTMLInputElement
  const climb = screen.getByLabelText('Total climb (feet)') as HTMLInputElement
  const set = async (input: HTMLInputElement, value: string) => {
    await user.clear(input)
    if (value) await user.type(input, value)
  }
  const status = () => screen.getByRole('status')
  return { container, recentDist, targetDist, time, climb, set, status }
}

describe('Predictor', () => {
  it('the reported case: a 13.1 mi race typed as 1:35, predicting 26 mi with 100 ft of climb', async () => {
    const { container, recentDist, targetDist, time, climb, set } = setup()
    await set(recentDist, '13.1')
    await set(time, '1:35')
    await set(targetDist, '26')
    await set(climb, '100')
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:35:00.')
    expect(container).toHaveTextContent('Current fitness: VDOT 47.8 → flat 26 mi ≈ 3:16:08')
    expect(container).toHaveTextContent('Realistic3:16:08')
    expect(container).not.toHaveTextContent('17300')
    expect(container).not.toHaveTextContent('1:44:00')
  })

  it('keeps a 5K time as minutes and seconds, decimal seconds included', async () => {
    const { container, recentDist, time, set } = setup()
    await set(recentDist, '3.1')
    await set(time, '19:30.4')
    expect(container).toHaveTextContent('Reading your race as 3.1 mi in 19:30.')
  })

  it('takes digits without colons (a phone keypad has none) and a trailing colon mid-typing', async () => {
    const { container, time, set } = setup()
    await set(time, '13500')
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:35:00.')
    await set(time, '1:35:')
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:35:00.')
  })

  it('shows the distances as numbers, not as typed', () => {
    const { container, recentDist, targetDist } = setup()
    // Set directly: typing key by key, jsdom drops the leading zero itself.
    fireEvent.change(recentDist, { target: { value: '013.10' } })
    fireEvent.change(targetDist, { target: { value: '018' } })
    expect(recentDist.value).toBe('013.10')
    expect(container).toHaveTextContent('Reading your race as 13.1 mi')
    expect(container).toHaveTextContent('flat 18 mi ≈')
  })

  it('asks again, in a status line that was there all along, when a field is empty or unreadable', async () => {
    const { container, time, targetDist, climb, set, status } = setup()
    const line = status()
    expect(line.textContent).toBe('')
    await set(time, 'fast')
    expect(status()).toBe(line)
    expect(line).toHaveTextContent(ASK)
    await set(time, '1:45:00')
    expect(line.textContent).toBe('')
    for (const field of [targetDist, climb]) {
      await set(field, '')
      expect(line).toHaveTextContent(ASK)
      expect(container).not.toHaveTextContent('NaN')
      expect(container).not.toHaveTextContent('Realistic')
      await set(field, field === climb ? '5000' : '18')
    }
  })

  it('says when the numbers are outside the model, instead of an answer pinned at its limits', async () => {
    const { container, recentDist, time, set, status } = setup()
    await set(recentDist, '3.1')
    await set(time, '1:20:00')
    expect(status()).toHaveTextContent(OUT_OF_RANGE)
    expect(container).not.toHaveTextContent('Realistic')
    await set(recentDist, '21.1')
    await set(time, '1:35:00')
    expect(status()).toHaveTextContent(OUT_OF_RANGE)
  })

  it('opens on its default example without a prompt', () => {
    const { container, status } = setup()
    expect(status().textContent).toBe('')
    expect(container).toHaveTextContent('Reading your race as 13.1 mi in 1:45:00.')
  })
})
