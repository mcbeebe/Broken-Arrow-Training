import { describe, it, expect } from 'vitest'
import { isEveningPreviewWindow } from '../utils/coach'

// The Summary screen surfaces tomorrow's planned workout once it's evening
// (≥ 8 PM local). The gate is a pure function of the hour so we can assert it
// with injected Dates — no fake timers needed.
describe('isEveningPreviewWindow', () => {
  it('is false just before 8 PM', () => {
    expect(isEveningPreviewWindow(new Date(2026, 5, 7, 19, 59))).toBe(false)
  })

  it('is true at exactly 8 PM', () => {
    expect(isEveningPreviewWindow(new Date(2026, 5, 7, 20, 0))).toBe(true)
  })

  it('is true late in the evening', () => {
    expect(isEveningPreviewWindow(new Date(2026, 5, 7, 23, 30))).toBe(true)
  })

  it('is false in the morning', () => {
    expect(isEveningPreviewWindow(new Date(2026, 5, 7, 7, 0))).toBe(false)
  })

  it('is false in the early afternoon', () => {
    expect(isEveningPreviewWindow(new Date(2026, 5, 7, 14, 0))).toBe(false)
  })
})
