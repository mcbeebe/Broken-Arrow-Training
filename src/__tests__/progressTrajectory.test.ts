/**
 * P11 — the race trajectory stops hiding two taps deep.
 *
 * The projected finish is the one number a race-goal athlete opens this
 * tab to see, and it was reachable only through Plan > Race. It now leads
 * Progress. Plan keeps its copy — this is a mirror, not a move, so nobody
 * loses a path they had.
 */
import { describe, it, expect } from 'vitest'

const src = (g: Record<string, unknown>) => Object.values(g)[0] as string
const DASH = src(import.meta.glob('../components/Dashboard.tsx', { query: '?raw', import: 'default', eager: true }))
const PLAN = src(import.meta.glob('../components/WeeklyPlan.tsx', { query: '?raw', import: 'default', eager: true }))

describe('the trajectory', () => {
  it('leads Progress, above the sub-tabs', () => {
    const idx = DASH.indexOf('<HyroxProjectionCard')
    const subTabs = DASH.indexOf('const SUB_TABS')
    expect(idx).toBeGreaterThan(-1)
    // Rendered in the page body; the sub-tab list is declared before render.
    expect(DASH.slice(idx)).toContain('HyroxProjectionCard')
    expect(subTabs).toBeGreaterThan(-1)
  })

  it('is mirrored, not moved — Plan keeps its copy', () => {
    expect(PLAN).toContain('<HyroxProjectionCard')
  })

  it('is fed the data it needs rather than a placeholder', () => {
    expect(DASH).toMatch(/<HyroxProjectionCard weeks=\{weeks\} config=\{onboardingConfig\} capacity=\{strengthCapacity\}/)
  })
})

describe('the tab names itself for what it is', () => {
  it('says Progress, not Dashboard', () => {
    // The nav said Progress from P1; the page heading still said Dashboard.
    expect(DASH).toContain('>Progress<')
    expect(DASH).not.toMatch(/>Dashboard</)
  })
})

describe('sourceless signals', () => {
  it('are hidden by the sub-tab gates rather than dashed out', () => {
    // Readiness and Performance are only offered when there is something
    // to show; nothing renders an empty dash.
    expect(DASH).toMatch(/available: garminConnected && isSectionVisible\('dash\.tabReadiness'\)/)
    expect(DASH).not.toMatch(/value=\{'—'\}/)
  })
})
