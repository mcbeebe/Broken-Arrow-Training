/**
 * Initiative 003 PR 4c: the free weekly mileage planner page, driven the way
 * a visitor would. The numbers themselves are mileagePlan's (toolMath.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MileagePlanner } from '../../tools/MileagePlanner'
import { mileagePlan } from '../../tools/toolMath'

function setup() {
  const user = userEvent.setup()
  const { container } = render(<MileagePlanner />)
  const race = screen.getByLabelText('Race') as HTMLSelectElement
  const current = screen.getByLabelText('Miles you run a week now') as HTMLInputElement
  const weeks = screen.getByLabelText('Weeks until your race') as HTMLInputElement
  const bars = () => [...container.querySelectorAll<HTMLElement>('[data-week]')]
  const result = () => container.querySelector('[data-mileage-result]')
  return { user, container, race, current, weeks, bars, result }
}

describe('MileagePlanner', () => {
  it('shows the default plan: start, peak and its week, longest run, one bar a week', () => {
    const { bars, result } = setup()
    const plan = mileagePlan('half_marathon', 20, 16)!
    expect(result()).toHaveTextContent(`Start at${plan.startMi} mia week`)
    expect(result()).toHaveTextContent(`Peak at${plan.peakMi} miin week ${plan.peakWeek}`)
    expect(result()).toHaveTextContent(`Longest run${plan.longestRunMi} mi`)
    expect(bars()).toHaveLength(16)
    expect(bars().filter(b => b.dataset.easier).map(b => Number(b.dataset.week))).toEqual(plan.weeks.filter(w => w.easier).map(w => w.week))
  })

  it('bars are drawn to scale: the peak week fills the plot, the rest in proportion', () => {
    const { bars } = setup()
    const plan = mileagePlan('half_marathon', 20, 16)!
    const heights = bars().map(b => parseInt(b.style.height, 10))
    expect(heights[plan.peakWeek - 1]).toBe(160)
    plan.weeks.forEach((w, i) => expect(heights[i], `week ${w.week}`).toBe(Math.max(2, Math.round((w.miles / plan.peakMi) * 160))))
  })

  it('follows every input', async () => {
    const { user, race, current, weeks, bars, result } = setup()
    await user.selectOptions(race, 'marathon')
    await user.clear(current)
    await user.type(current, '30')
    await user.clear(weeks)
    await user.type(weeks, '18')
    const plan = mileagePlan('marathon', 30, 18)!
    expect(bars()).toHaveLength(18)
    expect(result()).toHaveTextContent(`Peak at${plan.peakMi} mi`)
  })

  it('offers the four road distances', () => {
    const { race } = setup()
    expect([...race.options].map(o => o.textContent)).toEqual(['5K', '10K', 'Half marathon', 'Marathon'])
  })

  it('says what it needs instead of drawing nonsense', async () => {
    const { user, weeks, result } = setup()
    await user.clear(weeks)
    await user.type(weeks, '40')
    expect(result()).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Enter 1 to 200 miles a week and 4 to 24 weeks.')
  })

  it('describes the chart for screen readers', () => {
    const plan = mileagePlan('half_marathon', 20, 16)!
    expect(screen.queryByRole('img')).toBeNull()
    setup()
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain(`a peak of ${plan.peakMi} in week ${plan.peakWeek}`)
  })

  it('ends in the full-plan link tagged as this tool', () => {
    setup()
    expect(screen.getByRole('link', { name: /Get the full plan/ }).getAttribute('href')).toContain('?from=tool-mileage#join')
  })
})
