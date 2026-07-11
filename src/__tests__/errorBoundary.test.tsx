import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'

/**
 * Field P0: a boot crash used to unmount the whole tree into a silent
 * white page — indistinguishable from a network failure, undebuggable
 * from a screenshot. The boundary must render the actual error so the
 * user's screenshot IS the diagnosis.
 */

function Bomb(): never {
  throw new Error('poisoned sync value')
}

beforeEach(() => {
  // React logs the caught error loudly; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><div>healthy app</div></ErrorBoundary>)
    expect(screen.getByText('healthy app')).toBeInTheDocument()
  })

  it('a crash shows the error message — never a blank screen', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByTestId('boot-error-detail').textContent).toContain('poisoned sync value')
  })

  it('offers a reload', () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, reload },
      writable: true,
    })
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    fireEvent.click(screen.getByText('Reload the app'))
    expect(reload).toHaveBeenCalled()
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })
})
