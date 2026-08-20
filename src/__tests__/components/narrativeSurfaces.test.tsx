/**
 * N2 surfaces the athlete actually touches: the "why today matters" card
 * on Home, and the Season sub-view under Plan. The narrative engines are
 * proven in narrativeSurfaces.test.ts; this covers the affordances.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TodayNarrativeCard from '../../components/TodayNarrativeCard'
import SeasonOverview from '../../components/SeasonOverview'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../data/methods'
import { TODAY, PERSONAS, buildConfig } from '../helpers/roadPersonas'

const carmen = PERSONAS.find(p => p.label.startsWith('Carmen'))!
const plan = generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), TODAY)

describe('TodayNarrativeCard (Home)', () => {
  // Take a quality day and the week that actually owns it — not every
  // week has one, and a mismatched pair renders nothing.
  const weekIdx = plan.weeks.findIndex(w => w.days.some(d => d.type === 'quality'))
  const day = plan.weeks[weekIdx].days.find(d => d.type === 'quality')!
  const weekNum = weekIdx + 1

  it('leads with the session role and keeps the rest one tap away', () => {
    render(
      <TodayNarrativeCard day={day} weeks={plan.weeks} currentWeekNum={weekNum} race={plan.race} />,
    )
    expect(screen.getByText(/key session/i)).toBeInTheDocument()
    // Collapsed by default — the home screen stays scannable.
    expect(screen.queryByText('This week')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /how this fits/i }))
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('The bigger arc')).toBeInTheDocument()
  })

  it('the season deep-link fires only when the parent offers one', () => {
    const onOpenSeason = vi.fn()
    const { rerender } = render(
      <TodayNarrativeCard day={day} weeks={plan.weeks} currentWeekNum={weekNum} race={plan.race} onOpenSeason={onOpenSeason} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /how this fits/i }))
    fireEvent.click(screen.getByRole('button', { name: /whole season/i }))
    expect(onOpenSeason).toHaveBeenCalledTimes(1)

    // Same card, no handler: still expanded (state survives the rerender),
    // but the link it cannot honour is simply absent.
    rerender(<TodayNarrativeCard day={day} weeks={plan.weeks} currentWeekNum={weekNum} race={plan.race} />)
    expect(screen.getByText('The bigger arc')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /whole season/i })).not.toBeInTheDocument()
  })

  it('renders nothing without a plan to talk about', () => {
    const { container } = render(<TodayNarrativeCard day={day} weeks={[]} currentWeekNum={1} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SeasonOverview (Plan → Season)', () => {
  it('shows every block with its job, and marks where you are', () => {
    render(<SeasonOverview plan={plan} />)
    for (const label of ['Base', 'Build', 'Taper', 'Race week']) {
      expect(screen.getAllByText(new RegExp(`^${label}$`)).length, label).toBeGreaterThan(0)
    }
    expect(screen.getByText(/Build the aerobic floor/i)).toBeInTheDocument()
    expect(screen.getByText(/Spend less, keep everything/i)).toBeInTheDocument()
  })

  it('names the race and the size of the commitment', () => {
    render(<SeasonOverview plan={plan} />)
    expect(screen.getByText(plan.race.name)).toBeInTheDocument()
    expect(screen.getByText(/miles/i)).toBeInTheDocument()
  })

  it('keeps the methodology deep-dive folded away, not gone', () => {
    render(<SeasonOverview plan={plan} />)
    expect(screen.getByText(/Why it's built this way/i)).toBeInTheDocument()
  })
})
