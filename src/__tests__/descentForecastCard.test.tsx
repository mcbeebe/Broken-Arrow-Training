import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DescentForecastCard from '../components/DescentForecastCard'
import { summariseDescent } from '../utils/descentSummary'
import type { CachedEccentric } from '../utils/runEccentric'

function ecc(overrides: Partial<CachedEccentric> = {}): CachedEccentric {
  return {
    averageScore: overrides.averageScore ?? 1.0,
    totalKmScore: overrides.totalKmScore ?? 0,
    buckets: {
      mild: overrides.buckets?.mild ?? 0,
      moderate: overrides.buckets?.moderate ?? 0,
      severe: overrides.buckets?.severe ?? 0,
    },
    hardAscentVerticalMeters: overrides.hardAscentVerticalMeters ?? 0,
    hardDescentVerticalMeters: overrides.hardDescentVerticalMeters ?? 0,
  }
}

describe('summariseDescent', () => {
  it('returns "none" for a null cache', () => {
    expect(summariseDescent(null).severity).toBe('none')
  })

  it('returns "none" for a flat run with no descent', () => {
    expect(summariseDescent(ecc({ averageScore: 1.0, buckets: { mild: 8000, moderate: 0, severe: 0 } })).severity).toBe('none')
  })

  it('returns "mild" when there is just a sprinkle of moderate descent', () => {
    const s = summariseDescent(ecc({ averageScore: 1.5, buckets: { mild: 5000, moderate: 400, severe: 0 } }))
    expect(s.severity).toBe('mild')
    expect(s.fireCount).toBe(1)
  })

  it('returns "moderate" when severe descent crosses 300m', () => {
    const s = summariseDescent(ecc({ averageScore: 1.9, buckets: { mild: 3000, moderate: 1000, severe: 400 } }))
    expect(s.severity).toBe('moderate')
    expect(s.fireCount).toBe(2)
  })

  it('returns 3-fire "severe" for a real descent block', () => {
    const s = summariseDescent(ecc({ averageScore: 2.4, buckets: { mild: 1000, moderate: 1200, severe: 900 } }))
    expect(s.severity).toBe('severe')
    expect(s.fireCount).toBe(3)
  })

  it('returns 4-fire "severe" for a brutal descent', () => {
    const s = summariseDescent(ecc({ averageScore: 3.2, buckets: { mild: 500, moderate: 800, severe: 2200 } }))
    expect(s.severity).toBe('severe')
    expect(s.fireCount).toBe(4)
    expect(s.headline).toMatch(/wreck/i)
  })

  it('never surfaces "AU", "1-5", or "1.0 scale" in customer copy', () => {
    const inputs = [
      ecc({ averageScore: 1.5, buckets: { mild: 5000, moderate: 400, severe: 0 } }),
      ecc({ averageScore: 1.9, buckets: { mild: 3000, moderate: 1000, severe: 400 } }),
      ecc({ averageScore: 2.4, buckets: { mild: 1000, moderate: 1200, severe: 900 } }),
      ecc({ averageScore: 3.2, buckets: { mild: 500, moderate: 800, severe: 2200 } }),
    ]
    for (const input of inputs) {
      const s = summariseDescent(input)
      for (const text of [s.headline, s.forecast]) {
        expect(text.toLowerCase()).not.toMatch(/\bau\b/)
        expect(text).not.toMatch(/1-5|1\.0 scale/i)
      }
    }
  })
})

describe('<DescentForecastCard>', () => {
  it('renders nothing when there is no meaningful descent', () => {
    const { container } = render(<DescentForecastCard eccentric={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders fire emojis equal to the severity tier', () => {
    render(<DescentForecastCard eccentric={ecc({ averageScore: 3.2, buckets: { mild: 0, moderate: 0, severe: 2200 } })} />)
    expect(screen.getByLabelText(/4 of 4 severity/i)).toBeInTheDocument()
    expect(screen.getByText(/quads tomorrow/i)).toBeInTheDocument()
  })

  it('renders a plain-English headline and forecast', () => {
    render(<DescentForecastCard eccentric={ecc({ averageScore: 2.4, buckets: { mild: 1000, moderate: 1200, severe: 900 } })} />)
    expect(screen.getByText(/big descent/i)).toBeInTheDocument()
    expect(screen.getByText(/24.{1,3}48h/i)).toBeInTheDocument()
  })
})
