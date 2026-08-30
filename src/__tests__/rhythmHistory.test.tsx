/**
 * Rhythm history on Progress — the resolved-day record that replaces
 * compliance shame. Deliberately NOT a streak (the product avoids streaks;
 * a broken one re-creates the shame), just the count of days resolved.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RhythmDay } from '../utils/rhythm'
import RhythmHistory from '../components/RhythmHistory'

const d = (state: RhythmDay['state'], i: number): RhythmDay => ({
  iso: `2026-08-${String(i + 1).padStart(2, '0')}`, state, label: 'Mon',
})

describe('RhythmHistory', () => {
  const record = [
    ...Array.from({ length: 6 }, (_, i) => d('done', i)),
    d('open', 6),
    ...Array.from({ length: 5 }, (_, i) => d('done', i + 7)),
    d('today', 12),
  ]

  it('renders how many of the recent days are resolved', () => {
    render(<RhythmHistory rhythm={record} />)
    expect(screen.getByTestId('rhythm-history-summary').textContent).toContain('11 of your last 12 days resolved')
  })

  it('counts a rested day as resolved, and does not count today/future', () => {
    // 2 done + 1 rest resolved of 3 past days; today and future excluded.
    render(<RhythmHistory rhythm={[d('done', 0), d('rest', 1), d('done', 2), d('today', 3), d('future', 4)]} />)
    expect(screen.getByTestId('rhythm-history-summary').textContent).toContain('3 of your last 3 days resolved')
  })

  it('renders nothing when the plan carries no dated rhythm', () => {
    const { container } = render(<RhythmHistory rhythm={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('never says "missed" or "streak"', () => {
    render(<RhythmHistory rhythm={record} />)
    const txt = screen.getByTestId('rhythm-history').textContent?.toLowerCase() ?? ''
    expect(txt).not.toContain('missed')
    expect(txt).not.toContain('streak')
  })
})

describe('the wiring (source guard)', () => {
  const DASH = Object.values(import.meta.glob('../components/Dashboard.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
  it('mounts rhythm history on a 3-week window, below the hero', () => {
    expect(DASH).toMatch(/buildRhythm\(weeks, todayDateString\(\), 21\)/)
    expect(DASH.indexOf('<RhythmHistory')).toBeGreaterThan(DASH.indexOf('<HyroxProjectionCard'))
  })
})
