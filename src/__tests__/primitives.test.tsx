import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  MetricCard,
  InsightNote,
  ChartWithInsight,
  FilterChipRow,
  UndoToast,
  rangeBandStyle,
  rangeBandLegendEntry,
} from '../components/primitives'

describe('<MetricCard>', () => {
  it('renders label, value, suffix, subtitle, and context', () => {
    render(
      <MetricCard
        label="Total Distance"
        value="99.7"
        valueSuffix="mi"
        subtitle="Three weeks of steady build."
        context="Feb 23 – Today"
      />
    )
    expect(screen.getByText('Total Distance')).toBeInTheDocument()
    expect(screen.getByText('99.7')).toBeInTheDocument()
    expect(screen.getByText('mi')).toBeInTheDocument()
    expect(screen.getByText('Three weeks of steady build.')).toBeInTheDocument()
    expect(screen.getByText('Feb 23 – Today')).toBeInTheDocument()
  })

  it('shows an upward delta with positive semantics by default', () => {
    render(
      <MetricCard
        label="Weekly Volume"
        value="32.4 mi"
        delta={{ value: '14%', direction: 'up' }}
      />
    )
    const chip = screen.getByLabelText(/change up 14%/i)
    expect(chip).toBeInTheDocument()
    expect(chip.className).toMatch(/emerald/)
  })

  it('flips delta semantics when invertGoodness is set (down is good)', () => {
    render(
      <MetricCard
        label="Finish Time"
        value="4:08"
        delta={{ value: '22 min', direction: 'down', invertGoodness: true }}
      />
    )
    const chip = screen.getByLabelText(/change down 22 min/i)
    expect(chip.className).toMatch(/emerald/)
  })

  it('renders a flat delta with neutral styling', () => {
    render(
      <MetricCard
        label="Long Run"
        value="14 mi"
        delta={{ value: '0%', direction: 'flat' }}
      />
    )
    const chip = screen.getByLabelText(/change flat 0%/i)
    expect(chip.className).toMatch(/slate/)
  })

  it('renders as a button and fires onClick when provided', () => {
    const onClick = vi.fn()
    render(<MetricCard label="x" value="1" onClick={onClick} />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('<InsightNote>', () => {
  it('renders default "Athlete Intelligence" label and body', () => {
    render(<InsightNote>You're trending up.</InsightNote>)
    expect(screen.getByText(/athlete intelligence/i)).toBeInTheDocument()
    expect(screen.getByText("You're trending up.")).toBeInTheDocument()
  })

  it('renders a custom label and fires the inline action', () => {
    const onClick = vi.fn()
    render(
      <InsightNote
        label="Coach read"
        action={{ label: 'Tell me more →', onClick }}
      >
        Strong tempo effort.
      </InsightNote>
    )
    expect(screen.getByText('Coach read')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tell me more →' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('<ChartWithInsight>', () => {
  it('renders title, headline value, chart slot, and insight', () => {
    render(
      <ChartWithInsight
        title="Total Distance"
        headlineValue="99.7 mi"
        subtitle="Past 12 weeks"
        insight="You logged 122% more than last year."
      >
        <div data-testid="chart-slot">[chart]</div>
      </ChartWithInsight>
    )
    expect(screen.getByText('Total Distance')).toBeInTheDocument()
    expect(screen.getByText('99.7 mi')).toBeInTheDocument()
    expect(screen.getByText('Past 12 weeks')).toBeInTheDocument()
    expect(screen.getByTestId('chart-slot')).toBeInTheDocument()
    expect(screen.getByText(/122% more than last year/)).toBeInTheDocument()
  })

  it('omits the insight block when no insight is provided', () => {
    render(
      <ChartWithInsight title="Total Distance">
        <div>chart</div>
      </ChartWithInsight>
    )
    expect(screen.queryByText(/athlete intelligence/i)).not.toBeInTheDocument()
  })

  it('renders a headerAction slot for filter chips/compare toggles', () => {
    render(
      <ChartWithInsight
        title="Total Distance"
        headerAction={<button>Compare</button>}
      >
        <div>chart</div>
      </ChartWithInsight>
    )
    expect(screen.getByRole('button', { name: 'Compare' })).toBeInTheDocument()
  })
})

describe('<FilterChipRow>', () => {
  const options = [
    { value: 'all', label: 'All Run' },
    { value: 'run', label: 'Run' },
    { value: 'bike', label: 'Bike' },
  ] as const

  it('renders all options and marks the active one', () => {
    render(
      <FilterChipRow
        ariaLabel="Sport"
        options={options as unknown as { value: string; label: string }[]}
        value="run"
        onChange={() => {}}
      />
    )
    expect(screen.getByRole('radiogroup', { name: 'Sport' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Run' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'All Run' })).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange with the selected value', () => {
    const onChange = vi.fn()
    render(
      <FilterChipRow
        ariaLabel="Sport"
        options={options as unknown as { value: string; label: string }[]}
        value="run"
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Bike' }))
    expect(onChange).toHaveBeenCalledWith('bike')
  })

  it('disables individual options', () => {
    render(
      <FilterChipRow
        ariaLabel="Sport"
        options={[{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }]}
        value="b"
        onChange={() => {}}
      />
    )
    expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled()
  })
})

describe('<UndoToast>', () => {
  it('renders the message and Undo button', () => {
    render(<UndoToast message="Moved Tuesday to Wednesday" onUndo={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('Moved Tuesday to Wednesday')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('fires onUndo then onDismiss when Undo is clicked', () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()
    render(<UndoToast message="x" onUndo={onUndo} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('fires onDismiss when the close × is clicked', () => {
    const onDismiss = vi.fn()
    render(<UndoToast message="x" onUndo={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<UndoToast message="x" onUndo={() => {}} onDismiss={onDismiss} durationMs={1000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})

describe('rangeBandStyle', () => {
  it('returns the suggested band style by default', () => {
    const s = rangeBandStyle()
    expect(s.stroke).toBe('#7C3AED')
    expect(s.strokeDasharray).toBe('4 4')
    expect(s.fillOpacity).toBeGreaterThan(0)
  })

  it('returns distinct safe and risky variants', () => {
    expect(rangeBandStyle('safe').stroke).not.toBe(rangeBandStyle('risky').stroke)
  })

  it('exposes a legend entry with matching color', () => {
    const e = rangeBandLegendEntry('safe', 'In range')
    expect(e.value).toBe('In range')
    expect(e.color).toBe(rangeBandStyle('safe').stroke)
  })
})
