/**
 * Initiative 003: the landing page renders every section in its default state,
 * and every in-page link lands on an anchor the root guard keeps on the
 * landing page. (A link to an anchor the guard doesn't know would forward a
 * reload of that URL to the app, because the app keeps the athlete id in the
 * hash.)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, within } from '@testing-library/react'
import { LandingPage } from '../../landing/LandingPage'
import { LANDING_ANCHORS } from '../../landing/legacyEntry'
import { SECTION_IDS, SPORTS, MORNING, PLAN, MAKE, COACH, HERO } from '../../landing/content'

let root: HTMLElement

beforeEach(() => {
  root = render(<LandingPage />).container
})

describe('sections', () => {
  it.each(SECTION_IDS)('renders #%s', id => {
    expect(root.querySelector(`#${id}`)).not.toBeNull()
  })

  it('has the skip-link target', () => {
    expect(root.querySelector('#main')).not.toBeNull()
  })

  it('every in-page link target is a landing anchor and exists on the page', () => {
    const hrefs = [...root.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')!)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(LANDING_ANCHORS.has(href), `${href} is not in LANDING_ANCHORS`).toBe(true)
      expect(root.querySelector(href), `${href} has no target`).not.toBeNull()
    }
  })

  it('every rendered id that a link targets is a landing anchor', () => {
    const targeted = new Set([...root.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')!.slice(1)))
    for (const el of root.querySelectorAll('[id]')) {
      if (targeted.has(el.id)) expect(LANDING_ANCHORS.has(`#${el.id}`)).toBe(true)
    }
  })

  it('links off the page only to /app/, the tools and the legal pages', () => {
    const external = [...root.querySelectorAll('a[href]')].map(a => a.getAttribute('href')!).filter(h => !h.startsWith('#'))
    for (const href of external) {
      expect(href, href).toMatch(/^\/(app\/|tools\/(fueling|predictor|heat)\.html|privacy\.html|terms\.html)$/)
    }
  })
})

describe('the default state (PR 4 wires the interactions)', () => {
  it('opens on the Running tab', () => {
    const tabs = within(root.querySelector('[role="group"][aria-labelledby="morning-tabs"]') as HTMLElement)
    expect(tabs.getByRole('button', { name: SPORTS[0].tab })).toHaveAttribute('aria-pressed', 'true')
    for (const s of SPORTS.slice(1)) expect(tabs.getByRole('button', { name: s.tab })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the Running example in the card', () => {
    const run = SPORTS.find(s => s.id === 'run')!
    const live = root.querySelector('[aria-live="polite"]')!
    expect(live).toHaveTextContent(run.planned)
    expect(live).toHaveTextContent(run.adjusted)
    expect(live).toHaveTextContent(run.why)
    expect(root.textContent).toContain(run.who)
  })

  it('shows the three metrics and the readiness ring', () => {
    for (const m of MORNING.metrics) expect(root.textContent).toContain(m.note)
    expect(root.textContent).toContain(MORNING.readiness.title)
  })

  it('shows the Racing chart with 16 bars and today at week 9', () => {
    const chart = root.querySelector('[role="img"]')!
    expect(chart.getAttribute('aria-label')).toBe(PLAN.chartLabel.race)
    expect(chart.querySelectorAll('[data-bar]')).toHaveLength(16)
    expect(chart.querySelector('[data-bar="today"]')).toBe(chart.querySelectorAll('[data-bar]')[PLAN.todayIndex])
    expect(root.textContent).toContain(PLAN.intro.race)
    for (const label of PLAN.phases.race) expect(root.textContent).toContain(label)
    expect(root.textContent).toContain(SPORTS[0].chartCaption)
  })

  it('scales bars as design-spec.md says: round(v / 88 * 200)', () => {
    const bars = [...root.querySelectorAll<HTMLElement>('[data-bar="week"]')]
    const expected = PLAN.bars.race.filter((_, i) => i !== PLAN.todayIndex).map(v => `${Math.round((v / PLAN.max) * PLAN.plot)}px`)
    expect(bars.map(b => b.style.height)).toEqual(expected)
  })

  it('names the coach Mira with Warm and Direct on', () => {
    expect(root.textContent).toContain(`${COACH.headerPrefix}Warm, Direct.`)
    const group = root.querySelector('[aria-labelledby="coach-traits"]')!
    const pressed = [...group.querySelectorAll('button[aria-pressed="true"]')].map(b => b.textContent)
    expect(pressed).toEqual(['Warm', 'Direct'])
    expect(root.querySelector<HTMLInputElement>('#coach-name')!.value).toBe(MAKE.defaultName)
    expect(root.querySelector<HTMLInputElement>('#coach-ask')!.placeholder).toBe(`Ask ${MAKE.defaultName} anything`)
  })

  it('shows the hero and the invite form', () => {
    expect(root.querySelector('h1')).toHaveTextContent(HERO.title)
    expect(root.querySelector('#join form')).not.toBeNull()
  })
})
