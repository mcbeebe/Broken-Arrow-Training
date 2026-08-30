/**
 * CollapsibleSection — the fold-away Progress section: the header toggles
 * the body, and the choice is remembered per device.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CollapsibleSection from '../../components/primitives/CollapsibleSection'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('CollapsibleSection', () => {
  it('shows its body by default and folds it away on tap', () => {
    render(
      <CollapsibleSection title="Weekly Breakdown" storageKey="progress.wk">
        <p data-testid="body">rows</p>
      </CollapsibleSection>,
    )
    expect(screen.getByTestId('body')).toBeTruthy()
    fireEvent.click(screen.getByTestId('section-toggle-progress.wk'))
    expect(screen.queryByTestId('body')).toBeNull()
    // aria + data marker reflect the collapsed state
    expect(screen.getByTestId('section-toggle-progress.wk').getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByTestId('section-progress.wk').getAttribute('data-collapsed')).toBe('true')
  })

  it('remembers the fold across remounts (per device)', () => {
    const { unmount } = render(
      <CollapsibleSection title="Volume" storageKey="progress.vol">
        <p data-testid="body">chart</p>
      </CollapsibleSection>,
    )
    fireEvent.click(screen.getByTestId('section-toggle-progress.vol')) // collapse
    expect(localStorage.getItem('ba_collapsed_progress.vol')).toBe('1')
    unmount()
    render(
      <CollapsibleSection title="Volume" storageKey="progress.vol">
        <p data-testid="body">chart</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByTestId('body')).toBeNull() // starts collapsed from the stored choice
  })

  it('honours a defaultCollapsed until the athlete chooses otherwise', () => {
    render(
      <CollapsibleSection title="Debug" storageKey="progress.dbg" defaultCollapsed>
        <p data-testid="body">x</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByTestId('body')).toBeNull()
    fireEvent.click(screen.getByTestId('section-toggle-progress.dbg')) // expand
    expect(screen.getByTestId('body')).toBeTruthy()
    expect(localStorage.getItem('ba_collapsed_progress.dbg')).toBe('0') // explicit choice stored
  })
})
