/**
 * P5 — the briefing moves one tap behind the readiness bubble.
 *
 * TodayBriefing was always-on, competing with the verdict for the top of
 * the page. It is depth, and depth belongs behind a door — but a door the
 * athlete can always find, on the number they are already looking at.
 */
import { describe, it, expect } from 'vitest'

const src = (g: Record<string, unknown>) => Object.values(g)[0] as string
const SUMMARY = src(import.meta.glob('../components/Summary.tsx', { query: '?raw', import: 'default', eager: true }))
const APP = src(import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }))

describe('the briefing', () => {
  it('renders inside a dialog rather than inline on the page', () => {
    expect(SUMMARY).toMatch(/data-testid="readiness-sheet"/)
    expect(SUMMARY).toMatch(/aria-modal="true"/)
  })

  it('is mounted exactly once — no leftover inline copy', () => {
    expect((SUMMARY.match(/<TodayBriefing/g) ?? []).length).toBe(1)
  })

  it('opens from the bubble, not by jumping to another tab', () => {
    expect(APP).toMatch(/onOpenReadiness=\{openReadiness\}/)
    expect(APP).not.toMatch(/onOpenReadiness=\{\(\) => setView\('progress'\)\}/)
  })
})

describe('what stays on the page', () => {
  it('keeps the explanation of why there is no verdict yet', () => {
    // Not depth to go and find — this IS the answer when it applies.
    expect(SUMMARY).toMatch(/Syncing your watch/)
  })

  it('names both sources in the connect prompt', () => {
    expect(SUMMARY).toMatch(/Garmin or Apple/)
    expect(SUMMARY).not.toMatch(/Connect Garmin in Settings/)
  })
})
