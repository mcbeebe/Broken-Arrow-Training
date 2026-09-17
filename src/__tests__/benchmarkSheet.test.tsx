/**
 * The Add-benchmark sheet: presets follow the plan, the parse echo tells the
 * athlete what was read, an implausible number cannot be saved, the saved
 * entry carries the protocol and the measured date, and "Something else"
 * needs a name. The preview text itself is the engines' (preview.test.ts).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import BenchmarkSheet from '../components/BenchmarkSheet'
import { getMethodById } from '../data/methods'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { Benchmark } from '../engines/benchmark/log'

afterEach(cleanup)

const config = {
  raceType: 'road', raceName: 'Half', raceDate: '2026-11-15', raceDistance: 'half_marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday', wearable: 'garmin',
  athleteName: 'Mike', age: 45, maxHR: 185, completedAt: '2026-05-20T10:00:00Z',
  fitnessAnchor: { type: 'race_5k', valueSeconds: 22 * 60 + 15, dateIso: '2026-05-02' },
} as unknown as OnboardingConfig

const log: Benchmark[] = [
  { id: 'seed_race_5k', kind: 'race_5k', value: 22 * 60 + 15, unit: 'seconds', dateIso: '2026-05-02', source: 'derived', at: 1 },
]

function mount(over: Partial<React.ComponentProps<typeof BenchmarkSheet>> = {}) {
  const saved: Omit<Benchmark, 'id' | 'at'>[] = []
  render(
    <BenchmarkSheet
      plan="road" todayIso="2026-09-17"
      preview={{ log, config, capacity: null, weeks: [], method: getMethodById('daniels') }}
      onSave={e => saved.push(e)} onClose={() => {}}
      {...over}
    />,
  )
  return saved
}

describe('BenchmarkSheet', () => {
  it('offers the presets the plan can use', () => {
    mount()
    expect(screen.getByRole('radio', { name: 'Half marathon' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'SkiErg 1K' })).toBeNull()
    cleanup()
    mount({ plan: 'hyrox' })
    expect(screen.getByRole('radio', { name: 'SkiErg 1K' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Wall balls, unbroken' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Wall balls, 100 for time' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Marathon' })).toBeNull()
  })

  it('echoes what it read and shows what changes before Save', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '2140' } })
    expect(screen.getByTestId('bm-echo').textContent).toContain('21:40')
    expect(screen.getByTestId('bm-preview').textContent).toMatch(/What this changes/)
    expect(screen.getByTestId('bm-preview').textContent).toMatch(/Easy:/)
  })

  it('refuses a number a 5K cannot be, and says so', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '2:10' } })
    expect(screen.getByTestId('bm-implausible').textContent).toMatch(/outside the range/)
    expect((screen.getByText('Save benchmark') as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves the kind, the value in seconds, the protocol and the measured date', () => {
    const saved = mount()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '21:40' } })
    fireEvent.change(screen.getByLabelText(/How did you test it/), { target: { value: 'parkrun, flat' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Last week' }))
    fireEvent.click(screen.getByText('Save benchmark'))
    expect(saved).toEqual([{ kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-09-10', source: 'manual', protocol: 'parkrun, flat' }])
  })

  it('"Something else" needs a name and takes the unit the athlete picks', () => {
    const saved = mount()
    fireEvent.click(screen.getByRole('radio', { name: 'Something else' }))
    fireEvent.change(screen.getByLabelText('Measured as'), { target: { value: 'reps' } })
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '120' } })
    expect((screen.getByText('Save benchmark') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('What is it?'), { target: { value: 'Push-ups in 2 min' } })
    fireEvent.click(screen.getByText('Save benchmark'))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ kind: 'other', label: 'Push-ups in 2 min', unit: 'reps', value: 120 })
  })

  it('opens on the preset it was asked for', () => {
    mount({ initialKind: 'lthr' })
    expect(screen.getByRole('radio', { name: 'Threshold HR' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('Bpm')).toBeTruthy()
  })
})
