/**
 * Initiative 003: the landing page's structural accessibility (design-spec.md
 * § Accessibility). Contrast is fixed by tokens.json and checked there.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { LandingPage } from '../../landing/LandingPage'

let root: HTMLElement

beforeEach(() => {
  root = render(<LandingPage />).container
})

describe('landing page accessibility', () => {
  it('has exactly one h1', () => {
    expect(root.querySelectorAll('h1')).toHaveLength(1)
  })

  it('never skips a heading level', () => {
    let previous = 1
    for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = Number(h.tagName[1])
      expect(level - previous, `${h.tagName} “${h.textContent}”`).toBeLessThanOrEqual(1)
      previous = level
    }
  })

  it('has the landmarks: header, main nav, main, footer', () => {
    expect(root.querySelector('header')).not.toBeNull()
    expect(root.querySelector('nav[aria-label="Main"]')).not.toBeNull()
    expect(root.querySelectorAll('main')).toHaveLength(1)
    expect(root.querySelector('footer')).not.toBeNull()
  })

  it('puts the skip link first, pointing at main', () => {
    const first = root.querySelector('a, button, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])')!
    expect(first.tagName).toBe('A')
    expect(first.getAttribute('href')).toBe('#main')
    expect(root.querySelector('main')!.id).toBe('main')
  })

  it('labels every visible input', () => {
    const inputs = [...root.querySelectorAll('input, textarea, select')]
      .filter(el => !el.closest('[aria-hidden="true"]'))
    expect(inputs.length).toBeGreaterThan(0)
    for (const el of inputs) {
      const id = el.getAttribute('id')
      const labelled = (id && root.querySelector(`label[for="${id}"]`)) || el.getAttribute('aria-label') || el.closest('label')
      expect(labelled, el.outerHTML).toBeTruthy()
    }
  })

  it('gives every button an accessible name', () => {
    for (const b of root.querySelectorAll('button')) {
      const name = (b.textContent ?? '').trim() || b.getAttribute('aria-label')
      expect(name, b.outerHTML).toBeTruthy()
    }
  })

  it('gives every toggle group a name', () => {
    for (const g of root.querySelectorAll('[role="group"]')) {
      expect(g.getAttribute('aria-label') || g.getAttribute('aria-labelledby'), g.outerHTML.slice(0, 120)).toBeTruthy()
      const labelledby = g.getAttribute('aria-labelledby')
      if (labelledby) expect(root.querySelector(`#${labelledby}`)).not.toBeNull()
    }
  })

  it('marks every toggle with aria-pressed', () => {
    for (const g of root.querySelectorAll('[role="group"]')) {
      for (const b of g.querySelectorAll('button')) expect(b.hasAttribute('aria-pressed'), b.outerHTML).toBe(true)
    }
  })

  it('keeps the demo chat input and mic out of reach (disabled, aria-disabled)', () => {
    const input = root.querySelector<HTMLInputElement>('#coach-ask')!
    const mic = root.querySelector<HTMLButtonElement>('button[aria-label="Talk to your coach"]')!
    for (const el of [input, mic]) {
      expect(el.disabled).toBe(true)
      expect(el.getAttribute('aria-disabled')).toBe('true')
    }
  })

  it('hides decorative SVGs from assistive tech', () => {
    for (const svg of root.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('describes the chart in words', () => {
    const chart = root.querySelector('[role="img"]')!
    expect(chart.getAttribute('aria-label')?.length).toBeGreaterThan(40)
  })

  it('announces the adjusted workout politely', () => {
    expect(root.querySelector('[aria-live="polite"]')).not.toBeNull()
  })

  it('has unique ids', () => {
    const ids = [...root.querySelectorAll('[id]')].map(el => el.id)
    expect(ids.length).toBe(new Set(ids).size)
  })
})
