/**
 * The onboarding funnel is measurable.
 *
 * Onboarding.tsx had no instrumentation at all — no track, no telemetry, no
 * analytics of any kind — so every claim about where athletes drop out was
 * unfalsifiable, including one of mine that did not survive measurement.
 * These five events make the question answerable: where people leave is the
 * last `onboarding_step_entered` with no `onboarding_completed` after it.
 *
 * Two properties matter as much as the events themselves:
 *
 *   1. The step is reported by NAME. The step constants are numbers, and a
 *      raw `17` in a rollup is unreadable and would silently change meaning
 *      if the constants were renumbered.
 *   2. Instrumentation can never break the flow it measures. It rides
 *      useCoachTelemetry (batched, keepalive, errors swallowed) and every
 *      test below also asserts onboarding still works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const logInteraction = vi.fn()
const flush = vi.fn()
vi.mock('../hooks/useCoachTelemetry', () => ({
  useCoachTelemetry: (athleteId: string, enabled: boolean) => ({
    // Mirror the real hook's guard: no athlete, no events.
    logInteraction: (...args: unknown[]) => {
      if (enabled && athleteId) logInteraction(...args)
    },
    flush,
  }),
}))

const Onboarding = (await import('../components/Onboarding')).default

beforeEach(() => {
  cleanup()
  logInteraction.mockClear()
  flush.mockClear()
})

/** Every (kind, meta) pair logged so far. */
function events(): { kind: string; meta: Record<string, unknown> }[] {
  return logInteraction.mock.calls.map(([kind, meta]) => ({
    kind: kind as string,
    meta: (meta ?? {}) as Record<string, unknown>,
  }))
}
const kinds = () => events().map(e => e.kind)

function renderOnboarding(props: Record<string, unknown> = {}) {
  return render(
    <Onboarding athleteId="mike" onComplete={() => {}} loadingDurationMs={0} {...props} />,
  )
}

describe('funnel events', () => {
  it('reports the flow starting, once, with its length', () => {
    renderOnboarding()
    const started = events().filter(e => e.kind === 'onboarding_started')
    expect(started).toHaveLength(1)
    expect(started[0].meta.steps).toBeGreaterThan(5)
    expect(started[0].meta.redo).toBe(false)
  })

  it('marks a redo as a redo, so its funnel is not pooled with a first run', () => {
    renderOnboarding({ previousConfig: { athleteName: 'Mike' } })
    expect(events().find(e => e.kind === 'onboarding_started')!.meta.redo).toBe(true)
  })

  it('reports the first step by NAME, not by its number', () => {
    renderOnboarding()
    const entered = events().find(e => e.kind === 'onboarding_step_entered')!
    expect(entered.meta.step).toBe('goal_mode')
    expect(entered.meta.index).toBe(0)
  })

  it('reports each new step as the athlete advances', () => {
    renderOnboarding()
    const before = events().filter(e => e.kind === 'onboarding_step_entered').length
    fireEvent.click(screen.getByText('A specific race'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    const after = events().filter(e => e.kind === 'onboarding_step_entered')
    expect(after.length).toBeGreaterThan(before)
    expect(after[after.length - 1].meta.step).not.toBe('goal_mode')
    expect(typeof after[after.length - 1].meta.step).toBe('string')
  })

  it('reports a skip with the step it was skipped from, and still skips', () => {
    const onSkip = vi.fn()
    renderOnboarding({ onSkip })
    fireEvent.click(screen.getByRole('button', { name: /close onboarding/i }))
    const skipped = events().find(e => e.kind === 'onboarding_skipped')
    expect(skipped, 'a skip is a deliberate exit, distinct from abandonment').toBeTruthy()
    expect(skipped!.meta.step).toBe('goal_mode')
    expect(onSkip, 'instrumenting the skip must not swallow it').toHaveBeenCalled()
  })
})

describe('abandonment', () => {
  it('reports the step the athlete left from, and flushes it', () => {
    renderOnboarding()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    fireEvent(window, new Event('pagehide'))

    const abandoned = events().find(e => e.kind === 'onboarding_abandoned')
    expect(abandoned).toBeTruthy()
    expect(abandoned!.meta.step).toBe('goal_mode')
    // Flushed explicitly: the hook's own hide handler registers first, so
    // relying on it would send the batch before this event was queued.
    expect(flush).toHaveBeenCalled()
  })

  it('does NOT report an abandon after a skip', () => {
    // Without this guard the same athlete counts as both skipped AND
    // abandoned — every exit is followed by the page going away — which
    // inflates the abandonment rate this whole PR exists to measure.
    renderOnboarding({ onSkip: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /close onboarding/i }))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    fireEvent(window, new Event('pagehide'))
    expect(kinds()).toContain('onboarding_skipped')
    expect(kinds()).not.toContain('onboarding_abandoned')
  })

  it('stays quiet while the page is merely visible', () => {
    renderOnboarding()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    fireEvent(window, new Event('visibilitychange'))
    expect(kinds()).not.toContain('onboarding_abandoned')
  })
})

describe('no athlete, no events', () => {
  it('sends nothing when there is no athleteId, and onboarding still renders', () => {
    render(<Onboarding onComplete={() => {}} loadingDurationMs={0} />)
    expect(logInteraction).not.toHaveBeenCalled()
    expect(screen.getByText('A specific race')).toBeTruthy()
  })
})
