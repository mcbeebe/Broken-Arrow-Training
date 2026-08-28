/**
 * N17 — manual erg override in the benchmark sheet: monitor-format m:ss
 * entry, stored verbatim (never derived), flagged as athlete truth.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import StrengthBenchmarkSheet from '../components/StrengthBenchmarkSheet'
import type { StrengthCapacity } from '../engines/strength/benchmark'

afterEach(cleanup)

describe('StrengthBenchmarkSheet — erg manual entry', () => {
  it('accepts m:ss, stores both erg numbers verbatim, and flags them manual', () => {
    const onSave = vi.fn<(c: StrengthCapacity) => void>()
    render(
      <StrengthBenchmarkSheet kind="hyrox" todayIso="2026-08-28" onSave={onSave} onClose={vi.fn()} />,
    )
    // The field case: the erg monitor read 3:31 for 1 km and 1:42 /500m.
    // Both stored exactly as entered — no derivation between them.
    fireEvent.change(document.getElementById('bench-erg_1k')!, { target: { value: '3:31' } })
    fireEvent.change(document.getElementById('bench-erg_500')!, { target: { value: '1:42' } })
    fireEvent.click(screen.getByText('Save benchmark'))
    const saved = onSave.mock.calls[0][0]
    expect(saved.erg1kSec).toBe(211)
    expect(saved.erg500Sec).toBe(102)
    expect(saved.ergManual).toBe(true)
  })

  it('raw seconds still work, and non-erg-only saves are not flagged manual', () => {
    const onSave = vi.fn<(c: StrengthCapacity) => void>()
    render(
      <StrengthBenchmarkSheet kind="hyrox" todayIso="2026-08-28" onSave={onSave} onClose={vi.fn()} />,
    )
    fireEvent.change(document.getElementById('bench-erg_500')!, { target: { value: '102' } })
    fireEvent.click(screen.getByText('Save benchmark'))
    expect(onSave.mock.calls[0][0].erg500Sec).toBe(102)
    expect(onSave.mock.calls[0][0].ergManual).toBe(true)

    cleanup()
    const onSave2 = vi.fn<(c: StrengthCapacity) => void>()
    render(
      <StrengthBenchmarkSheet kind="hyrox" todayIso="2026-08-28" onSave={onSave2} onClose={vi.fn()} />,
    )
    fireEvent.change(document.getElementById('bench-push_ups')!, { target: { value: '30' } })
    fireEvent.click(screen.getByText('Save benchmark'))
    expect(onSave2.mock.calls[0][0].ergManual).toBeUndefined()
  })
})
