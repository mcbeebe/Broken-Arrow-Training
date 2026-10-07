/**
 * Initiative 003 PR 4c: the free weekly mileage planner page, driven the way
 * a visitor would. The numbers themselves are mileageMath's (and so the app's
 * generator's; see mileageMath.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MileagePlanner } from '../../tools/MileagePlanner'
import { mileagePlan } from '../../tools/mileageMath'

function setup() {
  const user = userEvent.setup()
  const { container } = render(<MileagePlanner />)
  const race = screen.getByLabelText('Race') as HTMLSelectElement
  const current = screen.getByLabelText('Miles you run a week now') as HTMLInputElement
  const weeks = screen.getByLabelText('Weeks until your race') as HTMLInputElement
  const bars = () => [...container.querySelectorAll<HTMLElement>('[data-week]')]
  const rows = () => [...container.querySelectorAll<HTMLElement>('[data-week-row]')]
  const result = () => container.querySelector('[data-mileage-result]')
  const ceiling = () => container.querySelector('[data-mileage-ceiling]')
  return { user, container, race, current, weeks, bars, rows, result, ceiling }
}

const set = async (user: ReturnType<typeof userEvent.setup>, input: HTMLInputElement, value: string) => {
  await user.clear(input)
  await user.type(input, value)
}

describe('MileagePlanner', () => {
  it('shows the default plan: start, peak and its week, longest run, one bar a week', () => {
    const { bars, result } = setup()
    const plan = mileagePlan('half_marathon', 20, 16)!
    expect(result()).toHaveTextContent(`Start at${plan.startMi} mia week`)
    expect(result()).toHaveTextContent(`Peak at${plan.peakMi} miin week ${plan.peakWeek}`)
    expect(result()).toHaveTextContent(`Longest run${plan.longestRunMi} mi`)
    expect(bars()).toHaveLength(plan.weeks.length)
    expect(bars().filter(b => b.dataset.easier).map(b => Number(b.dataset.week))).toEqual(plan.weeks.filter(w => w.easier).map(w => w.week))
  })

  it('bars are drawn to scale: the peak week fills the plot, the rest in proportion', () => {
    const { bars } = setup()
    const plan = mileagePlan('half_marathon', 20, 16)!
    const heights = bars().map(b => parseInt(b.style.height, 10))
    expect(heights[plan.peakWeek - 1]).toBe(160)
    plan.weeks.forEach((w, i) => expect(heights[i], `week ${w.week}`).toBe(Math.max(2, Math.round((w.miles / plan.peakMi) * 160))))
  })

  it('every week is also in a table, so the numbers and the easier weeks don’t depend on the chart or on colour', () => {
    const { rows } = setup()
    const plan = mileagePlan('half_marathon', 20, 16)!
    expect(rows()).toHaveLength(plan.weeks.length)
    plan.weeks.forEach((w, i) => {
      expect(rows()[i]).toHaveTextContent(`${w.miles}${w.easier ? ' (easier)' : ''}`)
      expect(rows()[i]).toHaveTextContent(w.longRunMi ? `${w.longRunMi} mi` : '—')
    })
  })

  it('follows every input, decimals included', async () => {
    const { user, race, current, weeks, bars, result } = setup()
    await user.selectOptions(race, 'marathon')
    await set(user, current, '30.5')
    await set(user, weeks, '18')
    const plan = mileagePlan('marathon', 30.5, 18)!
    expect(bars()).toHaveLength(plan.weeks.length)
    expect(result()).toHaveTextContent(`Peak at${plan.peakMi} mi`)
  })

  it('says so when the plan tops out below what you run now', async () => {
    const { user, current, ceiling } = setup()
    expect(ceiling()).toBeNull()
    await set(user, current, '120')
    const plan = mileagePlan('half_marathon', 120, 16)!
    expect(plan.peakMi).toBeLessThan(120)
    expect(ceiling()).toHaveTextContent(`this plan tops out at ${plan.peakMi} mi a week, below what you run now`)
  })

  it('offers the four road distances', () => {
    const { race } = setup()
    expect([...race.options].map(o => o.textContent)).toEqual(['5K', '10K', 'Half marathon', 'Marathon'])
  })

  it('asks again instead of drawing nonsense, in a status line that was there all along', async () => {
    const { user, weeks, result } = setup()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    await set(user, weeks, '40')
    expect(result()).toBeNull()
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Enter 5 to 200 miles a week and 4 to 24 weeks.')
  })

  it('states who the plan is for', () => {
    const { result } = setup()
    expect(result()).toHaveTextContent('an intermediate runner on 5 days a week with no recent race time')
  })

  it('the decorative chart is hidden from screen readers; the table carries the numbers', () => {
    const { container } = setup()
    expect(container.querySelector('[data-week]')!.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(within(container).getByRole('table')).toBeInTheDocument()
  })

  it('ends in the full-plan link tagged as this tool', () => {
    setup()
    expect(screen.getByRole('link', { name: /Get the full plan/ }).getAttribute('href')).toContain('?from=tool-mileage#join')
  })
})
