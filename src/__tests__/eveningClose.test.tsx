/**
 * P8 — the Evening Close, and the promise that the morning stays clear.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import EveningCloseCard from '../components/EveningCloseCard'
import type { PlannedDay, ActualWorkout } from '../types'

afterEach(cleanup)

const day = (over: Partial<PlannedDay> = {}): PlannedDay => ({
  day: 'Fri', type: 'quality', workout: 'Tempo — 4×5min @ AnT',
  detail: '', zone: 'Z4', route: '', time: '50 min', ...over,
})
const trained = (): PlannedDay => day({ actual: { type: 'run', durationMinutes: 50 } as unknown as ActualWorkout })
const props = {
  tomorrow: day({ workout: 'Long run', time: '90 min' }),
  notesWaiting: 0, closed: false, lightsOut: '9:40pm',
  onOpenNotes: vi.fn(), onOpenTomorrow: vi.fn(), onClose: vi.fn(),
}

describe('the day\'s receipt', () => {
  it('resolves a trained day', () => {
    render(<EveningCloseCard {...props} today={trained()} />)
    expect(screen.getByTestId('evening-headline').textContent).toBe('Today is resolved.')
  })

  it('counts a planned rest day as resolved, not as nothing', () => {
    render(<EveningCloseCard {...props} today={day({ type: 'rest', workout: 'Rest' })} />)
    expect(screen.getByTestId('evening-headline').textContent).toBe('Rest day — resolved.')
    expect(screen.getByTestId('evening-close').textContent).toContain('That counts')
  })

  it('says an unlogged day is open, and never calls it missed or failed', () => {
    render(<EveningCloseCard {...props} today={day()} />)
    const text = screen.getByTestId('evening-close').textContent ?? ''
    expect(screen.getByTestId('evening-headline').textContent).toBe('Today is still open.')
    expect(text.toLowerCase()).not.toContain('missed')
    expect(text.toLowerCase()).not.toContain('failed')
  })
})

describe('the coach\'s notes', () => {
  it('appear here, counted, with the singular right', () => {
    const { rerender } = render(<EveningCloseCard {...props} today={trained()} notesWaiting={1} />)
    expect(screen.getByTestId('evening-notes').textContent).toContain('Coach noted 1 thing ')
    rerender(<EveningCloseCard {...props} today={trained()} notesWaiting={3} />)
    expect(screen.getByTestId('evening-notes').textContent).toContain('Coach noted 3 things')
  })

  it('are absent entirely when nothing is waiting', () => {
    render(<EveningCloseCard {...props} today={trained()} notesWaiting={0} />)
    expect(screen.queryByTestId('evening-notes')).toBeNull()
  })
})

describe('tomorrow, staged', () => {
  it('shows the ticket and the lights-out target', () => {
    render(<EveningCloseCard {...props} today={trained()} />)
    const t = screen.getByTestId('evening-tomorrow').textContent ?? ''
    expect(t).toContain('Long run')
    expect(t).toContain('90 min')
    expect(t).toContain('9:40pm')
  })

  it('omits the lights-out line rather than inventing a time', () => {
    render(<EveningCloseCard {...props} today={trained()} lightsOut={null} />)
    expect(screen.getByTestId('evening-tomorrow').textContent).not.toContain('Lights out')
  })
})

describe('closing the day', () => {
  it('is a real commitment that shows it has been made', () => {
    const onClose = vi.fn()
    const { rerender } = render(<EveningCloseCard {...props} today={trained()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('close-the-day'))
    expect(onClose).toHaveBeenCalledOnce()
    rerender(<EveningCloseCard {...props} today={trained()} closed />)
    expect(screen.getByTestId('close-the-day').textContent).toContain('Day closed ✓')
    expect(screen.getByTestId('evening-close').getAttribute('data-closed')).toBe('yes')
  })
})
