/**
 * The week-shape editor: tap a day, pick its role; counts and the engines'
 * own laws update live; an error is named and blocks; reset goes back to
 * the plan's own layout.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import WeekShapeEditor from '../components/WeekShapeEditor'
import type { WeekShape } from '../engines/planGenerator/weekShape'

afterEach(cleanup)

const base: WeekShape = { 1: 'rest', 2: 'quality', 3: 'run', 4: 'strength', 5: 'run', 6: 'long', 7: 'rest' }

describe('WeekShapeEditor', () => {
  it('shows the seven days with their roles and the counts', () => {
    render(<WeekShapeEditor value={base} onChange={() => {}} plan="road" />)
    expect(screen.getByTestId('shape-day-2').textContent).toContain('Quality')
    expect(screen.getByTestId('shape-day-6').textContent).toContain('Long')
    expect(screen.getByTestId('shape-summary').textContent).toBe('5 training days — 4 running · 1 strength · 2 rest')
    expect(screen.queryByTestId('shape-issues')).toBeNull()
  })

  it('tapping a day opens its role picker; picking a role reports the new shape', () => {
    const onChange = vi.fn()
    render(<WeekShapeEditor value={base} onChange={onChange} plan="road" />)
    fireEvent.click(screen.getByTestId('shape-day-3'))
    expect(screen.getByTestId('shape-role-picker').textContent).toContain('Wednesday is a…')
    fireEvent.click(screen.getByTestId('shape-role-cross'))
    expect(onChange).toHaveBeenCalledWith({ ...base, 3: 'cross' })
  })

  it('names an error in the engines\' own words and a warning in amber', () => {
    render(<WeekShapeEditor value={{ ...base, 1: 'run', 7: 'run' }} onChange={() => {}} plan="road" methodRunDays={{ min: 4, max: 6, name: 'Daniels' }} />)
    const issues = screen.getByTestId('shape-issues')
    expect(issues.textContent).toContain('Keep at least one full rest day')
    expect(issues.querySelector('[data-severity="error"]')).toBeTruthy()
    cleanup()
    // Fri quality straight into Sat long: allowed, but said.
    render(<WeekShapeEditor value={{ ...base, 5: 'quality' }} onChange={() => {}} plan="road" />)
    expect(screen.getByTestId('shape-issues').textContent).toContain('two hard days back to back')
    expect(screen.getByTestId('shape-issues').querySelector('[data-severity="error"]')).toBeNull()
  })

  it('offers a reset only when the value differs from the plan\'s own layout, and highlights changed days', () => {
    const onChange = vi.fn()
    const { rerender } = render(<WeekShapeEditor value={base} onChange={onChange} plan="road" defaultShape={base} />)
    expect(screen.queryByTestId('shape-reset')).toBeNull()
    rerender(<WeekShapeEditor value={{ ...base, 3: 'cross' }} onChange={onChange} plan="road" defaultShape={base} highlight={[3]} />)
    expect(screen.getByTestId('shape-day-3').textContent).toContain('changed')
    fireEvent.click(screen.getByTestId('shape-reset'))
    expect(onChange).toHaveBeenCalledWith(base)
  })

  it('uses the plan family\'s words — Hyrox says stations and intervals', () => {
    render(<WeekShapeEditor value={{ ...base, 3: 'cross' }} onChange={() => {}} plan="hyrox" />)
    expect(screen.getByTestId('shape-day-3').textContent).toContain('Stations')
    expect(screen.getByTestId('shape-day-2').textContent).toContain('Intervals')
  })
})
