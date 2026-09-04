import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ExtrasFitAssessment } from '../engines/planGenerator/extrasFit'
import { WeekBreakdown, HealthQuestion, OptionCard } from '../components/onboarding/views'

/**
 * The onboarding leaf views. WeekBreakdown is the one that carries a promise
 * to the athlete — that the days/week number they picked is a TOTAL, and that
 * strength and cross count against it rather than stacking on top. Saying that
 * here, before generation, is the whole point of the panel; saying it wrong is
 * worse than not saying it.
 */

const fit = (over: Partial<ExtrasFitAssessment> = {}): ExtrasFitAssessment => ({
  methodName: 'Daniels', minRunDays: 4, maxRunDays: 6,
  extrasRequested: 3, dayBudget: 5, runningDaysActual: 4,
  extrasThatFit: 1, overBudget: true, noneFit: false, daysForAll: 7,
  ...over,
})

describe('WeekBreakdown', () => {
  it('renders nothing until the athlete has picked a day count', () => {
    const { container } = render(
      <WeekBreakdown daysPerWeek={null} strengthDays={2} crossDays={1} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the naive split when everything fits', () => {
    render(<WeekBreakdown daysPerWeek={6} strengthDays={2} crossDays={1} />)
    // 6-day budget minus 3 extras = 3 running. The budget is a TOTAL.
    expect(screen.getByText(/3 running · 2 strength · 1 cross-training/)).toBeInTheDocument()
    expect(screen.queryByTestId('week-breakdown-overbudget')).toBeNull()
  })

  it('never shows a negative run count when the extras exceed the budget', () => {
    render(<WeekBreakdown daysPerWeek={3} strengthDays={3} crossDays={2} />)
    expect(screen.getByText(/0 running · 3 strength · 2 cross-training/)).toBeInTheDocument()
    expect(screen.getByText(/We'll trim them to fit/)).toBeInTheDocument()
  })

  it('6c: the method floor OVERRIDES the naive split when it is over budget', () => {
    // days − extras would say 2 running. The method needs 4, so the naive
    // arithmetic would under-report the running and over-promise the extras.
    render(<WeekBreakdown daysPerWeek={5} strengthDays={2} crossDays={1} fit={fit()} />)
    expect(screen.getByTestId('week-breakdown-overbudget')).toBeInTheDocument()
    expect(screen.getByText(/4 running · 1 of your 3 strength\/cross/)).toBeInTheDocument()
    expect(screen.getByText(/only 1 of your 3 strength\/cross day fits/)).toBeInTheDocument()
  })

  it('6c: says plainly when NONE of the extras fit', () => {
    render(
      <WeekBreakdown daysPerWeek={4} strengthDays={2} crossDays={1}
        fit={fit({ noneFit: true, extrasThatFit: 0, dayBudget: 4, runningDaysActual: 4 })} />,
    )
    expect(screen.getByText(/none of your strength or cross-training would be scheduled/)).toBeInTheDocument()
    // And it says why, rather than leaving the athlete to guess.
    expect(screen.getByText(/Running is what the race is scored on/)).toBeInTheDocument()
  })

  it('6c: always offers the three ways out', () => {
    render(<WeekBreakdown daysPerWeek={5} strengthDays={2} crossDays={1} fit={fit()} />)
    expect(screen.getByText(/train 7 days a week, ask for fewer strength\/cross days, or keep this plan/))
      .toBeInTheDocument()
  })

  it('uses the fit forecast\'s run count even when nothing is over budget', () => {
    // The naive arithmetic says 6 − 1 = 5 running. The method tops out at 4
    // running days, so the forecast is the one telling the truth — and the
    // athlete would otherwise be shown a run count the plan never produces.
    render(
      <WeekBreakdown daysPerWeek={6} strengthDays={1} crossDays={0}
        fit={fit({ overBudget: false, maxRunDays: 4, runningDaysActual: 4, extrasThatFit: 1, extrasRequested: 1 })} />,
    )
    expect(screen.getByText(/4 running · 1 strength · 0 cross-training/)).toBeInTheDocument()
    expect(screen.queryByText(/5 running/)).toBeNull()
  })
})

describe('HealthQuestion — an optional screen must stay un-answerable', () => {
  it('reports the answer the athlete picked', () => {
    const onChange = vi.fn()
    render(<HealthQuestion label="Any recent injury?" value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('clicking the selected answer clears it back to unanswered', () => {
    // The health screen is optional. Without this an athlete who taps "Yes"
    // by accident has no way back to "I did not answer".
    const onChange = vi.fn()
    render(<HealthQuestion label="Any recent injury?" value={true} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('exposes the selection to assistive tech', () => {
    render(<HealthQuestion label="Any recent injury?" value={false} onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('OptionCard', () => {
  it('fires the click handler', () => {
    const onClick = vi.fn()
    render(<OptionCard selected={false} onClick={onClick} title="A specific race" />)
    fireEvent.click(screen.getByText('A specific race'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders the description when there is one', () => {
    render(<OptionCard selected={false} onClick={vi.fn()} title="A season" desc="Several races" />)
    expect(screen.getByText('Several races')).toBeInTheDocument()
  })

  it('maps the named icons to glyphs and passes anything else through', () => {
    // The mapping is a silent lookup — an unmapped name renders as itself
    // rather than as nothing, so a typo shows up on screen instead of leaving
    // a blank square.
    const { rerender } = render(<OptionCard selected={false} onClick={vi.fn()} title="T" icon="mountain" />)
    expect(screen.getByText('🏔')).toBeInTheDocument()
    rerender(<OptionCard selected={false} onClick={vi.fn()} title="T" icon="🎯" />)
    expect(screen.getByText('🎯')).toBeInTheDocument()
  })
})
