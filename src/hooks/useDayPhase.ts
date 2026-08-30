/**
 * The current half of the ritual, kept honest against the clock.
 *
 * `dayPhase` is a pure function of "now", which means a component that calls
 * it during render only learns the truth at the moment React happens to
 * re-render. That is not good enough for this page: Today is the surface an
 * athlete leaves open on a bedside table overnight and picks up in the
 * morning. A phone that resumes a still-mounted app hands back whatever half
 * was on screen when it was put down — last night's close, at breakfast.
 *
 * So the phase is state, and three things refresh it: the top of every hour,
 * the app becoming visible again, and the window itself changing under us.
 * The setter compares before it writes, so an hour that changes nothing
 * costs no render.
 */
import { useEffect, useState } from 'react'
import { dayPhase, type DayPhase, type PhaseWindow } from '../utils/dayPhase'

/**
 * Milliseconds from `now` to the top of the next hour. Never zero, so a
 * self-rescheduling timer always advances rather than spinning.
 */
export function msUntilNextHour(now: Date): number {
  const into = now.getMinutes() * 60_000 + now.getSeconds() * 1_000 + now.getMilliseconds()
  return 3_600_000 - into
}

export function useDayPhase(phaseWindow: PhaseWindow): DayPhase {
  const [phase, setPhase] = useState<DayPhase>(() => dayPhase(new Date(), phaseWindow))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = () => {
      const next = dayPhase(new Date(), phaseWindow)
      setPhase(prev => (prev === next ? prev : next))
    }

    const schedule = () => {
      timer = setTimeout(() => {
        sync()
        schedule()
      }, msUntilNextHour(new Date()))
    }

    // The window may have changed since the last render; re-read before arming.
    sync()
    schedule()

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)

    return () => {
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
  }, [phaseWindow])

  return phase
}
