import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Term from '../components/TermGlossary'
import { TERMS } from '../utils/terminology'

describe('terminology dictionary', () => {
  it('defines plain, tech and definition for every key', () => {
    for (const [key, entry] of Object.entries(TERMS)) {
      expect(entry.plain, `${key}.plain`).toBeTruthy()
      expect(entry.tech, `${key}.tech`).toBeTruthy()
      expect(entry.definition.length, `${key}.definition`).toBeGreaterThan(20)
    }
  })

  it('plain labels avoid the raw acronyms (sanity check)', () => {
    expect(TERMS.ctl.plain.toLowerCase()).not.toContain('ctl')
    expect(TERMS.atl.plain.toLowerCase()).not.toContain('atl')
    expect(TERMS.tsb.plain.toLowerCase()).not.toContain('tsb')
    expect(TERMS.acwr.plain.toLowerCase()).not.toContain('acwr')
  })
})

describe('<Term>', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the plain-English label by default', () => {
    render(<Term name="ctl" />)
    expect(screen.getByRole('button')).toHaveTextContent('Fitness')
  })

  it('renders the technical acronym when the per-athlete flag is set', () => {
    localStorage.setItem('ba_show_technical_terms_athlete-42', 'true')
    render(<Term name="ctl" athleteId="athlete-42" />)
    expect(screen.getByRole('button')).toHaveTextContent('CTL')
  })

  it('opens a popover with the definition on click and closes on Escape', () => {
    render(<Term name="acwr" />)
    const btn = screen.getByRole('button')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(btn)
    const tip = screen.getByRole('tooltip')
    expect(tip).toBeInTheDocument()
    expect(tip).toHaveTextContent(/load ramp/i)
    expect(tip).toHaveTextContent(/0\.8/) // hint includes the safe range
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('lets a caller override the visible label while preserving the popover', () => {
    render(<Term name="tsb">Recovery Balance</Term>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('Recovery Balance')
    fireEvent.click(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/fitness minus fatigue/i)
  })
})
