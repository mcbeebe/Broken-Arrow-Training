import { isoFromLocalDate } from './planDates'
import type { ReadinessScore } from '../types'

/**
 * Whether the newest readiness score is from today or yesterday. The
 * readiness history is the last seven *records*, not the last seven days:
 * a watch unsynced for twelve days still yields a full week of bars, all
 * stale. Today shows the trend only while it is current.
 *
 * @param weekScores readiness scores, oldest first
 * @param today      ISO date to treat as today
 */
export function readinessIsCurrent(weekScores: ReadinessScore[], today: string): boolean {
  const newest = weekScores[weekScores.length - 1]
  if (!newest) return false
  const yesterday = new Date(`${today}T12:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  return newest.date >= isoFromLocalDate(yesterday)
}
