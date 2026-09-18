import { useEffect, useState } from 'react'
import { checkInWindowAt, type CheckInWindow } from '../utils/checkInWindow'
import { msUntilNextHour } from './useDayPhase'

/**
 * Which check-in window is open right now, kept honest against the clock
 * the same way the day phase is: refreshed at the top of every hour and
 * when the app becomes visible again, so a phone picked up at 6:10 PM
 * offers the evening check-in without a reload.
 */
export function useCheckInWindow(eveningHour = 18): CheckInWindow | null {
  const [window_, setWindow] = useState<CheckInWindow | null>(() => checkInWindowAt(new Date(), eveningHour))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      const next = checkInWindowAt(new Date(), eveningHour)
      setWindow(prev => (prev === next ? prev : next))
    }
    const schedule = () => {
      timer = setTimeout(() => { sync(); schedule() }, msUntilNextHour(new Date()))
    }
    sync()
    schedule()
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [eveningHour])

  return window_
}
