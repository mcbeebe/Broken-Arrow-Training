import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

// jsdom has no scrollIntoView; WeeklyPlan calls it on the active week chip.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})
import type { TrainingWeek, PlannedDay } from '../../types'
import WeeklyPlan from '../../components/WeeklyPlan'
import { formatWeekMilesChip, formatWeekMilesHeader } from '../../utils/format'

/**
 * PR-2 — week-scoped race context + the volume formatter. Field bugs: an
 * 18-week two-race season rendered entirely under the anchor race's title
 * with no block context anywhere, and week volumes showed "~~7 mi".
 */

function day(label: string, over: Partial<PlannedDay> = {}): PlannedDay {
  return { day: label, type: 'run', workout: 'Easy', detail: '', zone: 'Z2', route: '', time: '45 min', ...over }
}

function week(num: number, over: Partial<TrainingWeek> = {}): TrainingWeek {
  return { num, dates: 'Nov 9–15', miles: 15, focus: 'Build', days: [day('Mon 11/9')], ...over }
}

describe('formatWeekMiles*', () => {
  it('header prefixes one tilde; chip carries the unit — both string-safe', () => {
    expect(formatWeekMilesHeader(20)).toBe('~20 mi')
    expect(formatWeekMilesHeader('~7')).toBe('~7 mi')   // legacy string: never "~~7 mi"
    expect(formatWeekMilesChip(11.9)).toBe('11.9 mi')
    expect(formatWeekMilesChip('~15')).toBe('15 mi')    // legacy chip gets its unit
    expect(formatWeekMilesChip('—')).toBe('—')          // unparseable passes through
  })
})

describe('week-scoped season race context', () => {
  const seasonRace = { name: 'Hyrox - Anaheim', dateIso: '2026-12-12', blockKind: 'BUILD' as const }

  it('a season week shows which race it builds toward; anchor weeks do not', () => {
    render(<WeeklyPlan weeks={[week(1, { seasonRace })]} />)
    expect(screen.getByText(/→ Hyrox - Anaheim · 12\/12 ·/)).toBeInTheDocument()
  })

  it('GUARD: anchor weeks render no race-context line and no season strip', () => {
    render(<WeeklyPlan weeks={[week(1), week(2)]} />)
    expect(screen.queryByText(/→ /)).toBeNull()
    expect(screen.queryByText(/Race plan/)).toBeNull() // strip needs >1 segment
  })

  it('multi-race seasons render the season strip with one chip per block segment', () => {
    const weeks = [
      week(1),
      week(2, { seasonRace: { ...seasonRace, blockKind: 'RECOVER' as const, name: 'Hyrox - Anaheim' } }),
      week(3, { seasonRace }),
      week(4, { seasonRace }),
    ]
    render(<WeeklyPlan weeks={weeks} />)
    expect(screen.getByText('Race plan')).toBeInTheDocument()
    expect(screen.getByText('Recover → Hyrox - Anaheim')).toBeInTheDocument()
    expect(screen.getByText('Build → Hyrox - Anaheim')).toBeInTheDocument()
  })

  it('chips render single-tilde volumes for legacy string weeks', () => {
    render(<WeeklyPlan weeks={[week(1, { miles: '~7' })]} />)
    expect(screen.getByText('7 mi')).toBeInTheDocument()
    expect(screen.getByText('~7 mi')).toBeInTheDocument() // header form
    expect(screen.queryByText(/~~/)).toBeNull()
  })
})
