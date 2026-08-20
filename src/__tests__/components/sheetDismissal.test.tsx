/**
 * Field bug: "the benchmarks screen got me stuck and I can't go back."
 *
 * Both new sheets diverged from the app's sheet idiom in two ways that
 * compound on a phone: no backdrop dismiss, and max-h-[92vh] — which on
 * iOS is TALLER than the visible viewport, so the sticky header carrying
 * the only close button scrolled out of reach with no way back.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StrengthBenchmarkSheet from '../../components/StrengthBenchmarkSheet'

function renderSheet(onClose = vi.fn()) {
  const { container } = render(
    <StrengthBenchmarkSheet kind="hyrox" todayIso="2026-08-20" onSave={vi.fn()} onClose={onClose} />,
  )
  return { container, onClose }
}

describe('the benchmark sheet can always be escaped', () => {
  it('tapping the backdrop closes it — the app-wide sheet idiom', () => {
    const { container, onClose } = renderSheet()
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tapping inside does NOT close it', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers a Cancel next to Save, so an exit is reachable at the bottom too', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the × in the header still closes it', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('is bounded by the VISIBLE viewport (dvh), not 92vh', () => {
    const { onClose } = renderSheet()
    const panel = screen.getByRole('dialog')
    expect(panel.className).toMatch(/max-h-\[85dvh\]/)
    // No plain-vh cap: on iOS 92vh exceeds what the athlete can see.
    expect(panel.className).not.toMatch(/\[\d+vh\]/)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saving is blocked until something is entered, then reports only what was filled', () => {
    const onSave = vi.fn()
    render(<StrengthBenchmarkSheet kind="general" todayIso="2026-08-20" onSave={onSave} onClose={vi.fn()} />)
    const save = screen.getByRole('button', { name: /save benchmark/i })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/push-ups/i), { target: { value: '28' } })
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith({ measuredAt: '2026-08-20', pushUps: 28 })
  })

  it('clamps a fat-fingered entry instead of prescribing from it', () => {
    const onSave = vi.fn()
    render(<StrengthBenchmarkSheet kind="general" todayIso="2026-08-20" onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/goblet squat/i), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: /save benchmark/i }))
    expect(onSave.mock.calls[0][0].gobletSquatLb).toBe(200)
  })
})
