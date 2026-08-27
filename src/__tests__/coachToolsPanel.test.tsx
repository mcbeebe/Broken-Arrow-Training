/**
 * N14 — Coach → Tools: every adaptive surface findable with its live
 * status, Level Up's permanent home, and the deep links.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CoachToolsPanel from '../components/CoachToolsPanel'

afterEach(cleanup)

function renderPanel(over: Partial<Parameters<typeof CoachToolsPanel>[0]> = {}) {
  const props = {
    autopilot: { baselineNights: 30, baselineTarget: 21, healthConnected: true, lastAction: null },
    mondayReviewLive: false,
    logCount: 0,
    onOpenLog: vi.fn(),
    levers: [],
    onAskCoach: vi.fn(),
    onOpenEngine: vi.fn(),
    ...over,
  }
  render(<CoachToolsPanel {...props} />)
  return props
}

describe('CoachToolsPanel', () => {
  it('shows the armed autopilot with its last action', () => {
    renderPanel({
      autopilot: {
        baselineNights: 30, baselineTarget: 21, healthConnected: true,
        lastAction: { title: 'Swapped intervals → easy run', atMs: 1, kind: 'reverted' },
      },
    })
    expect(screen.getByTestId('autopilot-armed')).toBeTruthy()
    expect(screen.getByText(/Swapped intervals/)).toBeTruthy()
    expect(screen.getByText(/you reverted it/)).toBeTruthy()
  })

  it('shows baseline progress while the gate is still closed', () => {
    renderPanel({ autopilot: { baselineNights: 14, baselineTarget: 21, healthConnected: true, lastAction: null } })
    expect(screen.getByTestId('autopilot-building').textContent).toContain('14 of 21 nights')
  })

  it('tells an unconnected athlete what arms the autopilot', () => {
    renderPanel({ autopilot: { baselineNights: 0, baselineTarget: 21, healthConnected: false, lastAction: null } })
    expect(screen.getByText(/Connect Garmin or Apple Health/)).toBeTruthy()
  })

  it('reflects a live Monday review and routes the log + engine buttons', () => {
    const props = renderPanel({ mondayReviewLive: true, logCount: 3 })
    expect(screen.getByText(/review is live/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('tools-open-log'))
    expect(props.onOpenLog).toHaveBeenCalled()
    expect(screen.getByTestId('tools-open-log').textContent).toContain('3 changes')
    fireEvent.click(screen.getByTestId('tools-open-engine'))
    expect(props.onOpenEngine).toHaveBeenCalled()
  })

  it('gives Level Up a permanent home — on-track state when no levers fire', () => {
    renderPanel()
    expect(screen.getByTestId('level-up-ontrack')).toBeTruthy()
  })

  it('orders the panel: Level Up first, Your Engine second, the log last', () => {
    renderPanel()
    const levelUp = screen.getByTestId('level-up-ontrack')
    const engine = screen.getByTestId('tools-open-engine')
    const log = screen.getByTestId('tools-open-log')
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(levelUp, engine)).toBe(true)
    expect(before(engine, log)).toBe(true)
  })
})
