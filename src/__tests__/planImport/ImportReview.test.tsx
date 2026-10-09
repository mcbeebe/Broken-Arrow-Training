import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import ImportReview from '../../components/ImportReview'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { normalizeExtraction, type NormalizedImport } from '../../utils/planImport/normalize'

/**
 * Initiative 004, PR 5: "Check your plan". Nothing is saved until "Use this
 * plan", and what it previews is what the app will show.
 */

afterEach(cleanup)

const TODAY = '2026-10-14' // a Wednesday

const base = {
  raceType: 'road', raceName: 'Spring Marathon', raceDate: '2027-04-18', raceDistance: 'marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
  athleteName: 'Mike', age: 42, maxHR: 181, completedAt: '2026-09-01T00:00:00.000Z',
  valuePropsSeenAt: '2026-09-01', connectStepSeenAt: '2026-09-01',
} as OnboardingConfig

function reviewOf(extra: Record<string, unknown> = {}, weeks = 6): NormalizedImport {
  const r = normalizeExtraction({
    extraction: {
      status: 'ok', title: 'Club 10K block', sport: 'road', units: 'mi',
      weeks: Array.from({ length: weeks }, (_, i) => ({
        focus: i === 0 ? 'Base' : undefined,
        s: [
          { d: 'tue', t: 'run', w: 'Easy run', dist: 4 },
          { d: 'thu', t: 'quality', w: 'Tempo', x: '3 mi at tempo', dist: 6 },
          { d: 'sun', t: 'long', w: 'Long run', dist: 8 + i },
        ],
      })),
      ...extra,
    },
    warnings: [],
    source: { name: 'Club-10K.pdf', kind: 'pdf' },
    importedAt: '2026-10-14T12:00:00.000Z',
  })
  if (!r.ok) throw new Error(r.reason)
  return r.value
}

const renderReview = (result = reviewOf(), onUse = vi.fn()) =>
  render(<ImportReview result={result} sourceName="Club-10K.pdf" base={base} todayIso={TODAY}
    importsLeft={3} onUse={onUse} onUploadAnother={vi.fn()} />)

describe('the summary', () => {
  it('counts weeks, sessions and the peak week from the plan', () => {
    renderReview()
    expect(screen.getByTestId('import-tile-weeks').textContent).toContain('6')
    expect(screen.getByTestId('import-tile-sessions').textContent).toContain('18')
    expect(screen.getByTestId('import-tile-peak').textContent).toContain('23 mi')
    expect(screen.getByText(/We read it from/).textContent).toContain('Club-10K.pdf')
    expect(screen.getByTestId('import-left').textContent).toBe('3 uploads left today')
  })
})

describe('the week preview', () => {
  it('shows week 1 open, dated from the start, with the app\'s own day rows', () => {
    renderReview()
    const week1 = screen.getByTestId('import-week-1')
    expect(week1.getAttribute('aria-expanded')).toBe('true')
    expect(week1.textContent).toContain('Base')
    expect(screen.getByText('Tue 10/13')).toBeTruthy()
    expect(screen.getByText('Easy run · 4 mi')).toBeTruthy()
    expect(screen.getByText('Long run · 8 mi')).toBeTruthy()
    expect(screen.getAllByText('Rest').length).toBeGreaterThan(0)
  })

  it('opens the rest on demand', () => {
    renderReview()
    expect(screen.queryByTestId('import-week-4')).toBeNull()
    fireEvent.click(screen.getByText('Show all 6 weeks'))
    fireEvent.click(screen.getByTestId('import-week-6'))
    expect(screen.getByText('Long run · 13 mi')).toBeTruthy()
  })
})

describe('when week 1 starts', () => {
  it('defaults to this week, and any date snaps to its Monday', () => {
    const onUse = vi.fn()
    renderReview(reviewOf(), onUse)
    expect((screen.getByLabelText('Week 1 begins') as HTMLInputElement).value).toBe('2026-10-12')
    fireEvent.change(screen.getByLabelText('Week 1 begins'), { target: { value: '2026-10-22' } })
    expect(screen.getByText('Tue 10/20')).toBeTruthy()
    fireEvent.click(screen.getByText('Use this plan'))
    expect(onUse.mock.calls[0][0].planStartPinnedIso).toBe('2026-10-19')
  })

  it('"I\'m already on week 3" makes this week week 3', () => {
    const onUse = vi.fn()
    renderReview(reviewOf(), onUse)
    fireEvent.click(screen.getByText('I’m already on week…'))
    fireEvent.change(screen.getByLabelText('This week is week'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Use this plan'))
    expect(onUse.mock.calls[0][0].planStartPinnedIso).toBe('2026-09-28')
  })

  it('uses the plan\'s printed start when there is one', () => {
    renderReview(reviewOf({ start_date: '2026-10-21' }))
    expect((screen.getByLabelText('Week 1 begins') as HTMLInputElement).value).toBe('2026-10-19')
  })

  it('can\'t be used with no date', () => {
    renderReview()
    fireEvent.change(screen.getByLabelText('Week 1 begins'), { target: { value: '' } })
    expect((screen.getByText('Use this plan') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the race', () => {
  it('found in the plan, placed in its week', () => {
    renderReview(reviewOf({ race: { name: 'Turkey Trot', date: '2026-11-22' } }))
    const race = screen.getByTestId('import-race')
    expect(within(race).getByText('Found in your plan')).toBeTruthy()
    expect(within(race).getByText('Turkey Trot')).toBeTruthy()
    // Counted back from the race: it closes the last week.
    expect(screen.getByTestId('import-race-when').textContent).toContain('week 6, the last week')
  })

  it('says when the race falls after the plan ends', () => {
    renderReview(reviewOf({ start_date: '2026-10-12', race: { name: 'Turkey Trot', date: '2026-12-20' } }))
    expect(screen.getByTestId('import-race-when').textContent).toContain('after your plan ends')
  })

  it('can be edited, and the edit is what gets saved', () => {
    const onUse = vi.fn()
    renderReview(reviewOf({ race: { name: 'Turkey Trot', date: '2026-11-22' } }), onUse)
    fireEvent.click(screen.getByText('Edit race'))
    fireEvent.change(screen.getByLabelText('Race name'), { target: { value: 'Jingle Bell 10K' } })
    fireEvent.click(screen.getByText('Done'))
    expect(screen.queryByText('Found in your plan')).toBeNull()
    fireEvent.click(screen.getByText('Use this plan'))
    expect(onUse.mock.calls[0][0]).toMatchObject({ raceName: 'Jingle Bell 10K', raceDate: '2026-11-22' })
  })

  it('a plan with no race says so, and offers to add one', () => {
    renderReview()
    expect(screen.getByText('No race in this plan.')).toBeTruthy()
    expect(screen.getByText('Add a race')).toBeTruthy()
  })
})

describe('things to check', () => {
  it('lists the reader\'s notes and the plan\'s versions', () => {
    renderReview(reviewOf({ notes: ['Week 6 Wednesday lists Hills and Tempo; we kept Hills.'], levels: ['Beginner', 'Intermediate'] }))
    const notes = screen.getByTestId('import-notes')
    expect(notes.textContent).toContain('2 things to check')
    expect(notes.textContent).toContain('we kept Hills')
    expect(notes.textContent).toContain('2 versions (Beginner, Intermediate)')
  })

  it('is absent when there is nothing to check', () => {
    renderReview()
    expect(screen.queryByTestId('import-notes')).toBeNull()
  })
})

describe('Use this plan', () => {
  it('hands over the config to save, built on the athlete\'s own', () => {
    const onUse = vi.fn()
    renderReview(reviewOf({ race: { name: 'Turkey Trot', date: '2026-11-22' } }), onUse)
    fireEvent.click(screen.getByText('Use this plan'))
    const cfg = onUse.mock.calls[0][0] as OnboardingConfig
    expect(cfg.importedPlan?.title).toBe('Club 10K block')
    expect(cfg.athleteName).toBe('Mike')
    expect(cfg.maxHR).toBe(181)
    expect(cfg.connectStepSeenAt).toBe('2026-09-01')
    expect(cfg).not.toHaveProperty('raceDistance')
  })
})
