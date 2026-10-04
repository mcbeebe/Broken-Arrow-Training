/**
 * The "recent training" lines of the Today briefing: what yesterday and the
 * two days before it are still doing to today's fatigue.
 *
 * Field bug (2026-10-04): a day's load total also carries soreness forward
 * from a hard session and adds soreness check-ins, so a rest day after a
 * strength session read as "Yesterday's workout (85 load) is factoring
 * into today's recovery." Only a day with a logged session is described,
 * by that session's own load.
 */
import { isoFromLocalDate } from './planDates'
import type { DailyTRIMP, TRIMPRecord } from '../types'

/** Sports whose muscle damage peaks 24–48 hours later. */
const DOMS_SPORTS = ['strength_lower', 'strength_full', 'hiking_steep']

const shiftIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return isoFromLocalDate(d)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sportName = (r: TRIMPRecord) => r.sportType.replace(/_/g, ' ')
const sessionLoad = (d: DailyTRIMP) => d.records.reduce((sum, r) => sum + r.adjustedTRIMP, 0)
const own = (r: TRIMPRecord) => Math.round(r.adjustedTRIMP)
const topRecord = (records: TRIMPRecord[]) => records.reduce((a, b) => (b.adjustedTRIMP > a.adjustedTRIMP ? b : a))

/**
 * Lines about the last three days' sessions, most recent first.
 *
 * @param dailyTrimp daily training load, any order
 * @param today      ISO date to treat as today
 */
export function recentLoadLines(dailyTrimp: DailyTRIMP[], today: string): string[] {
  // Calendar days, not `now − 24h`: a daylight-saving day is 23 or 25 hours.
  const session = (daysAgo: number) =>
    dailyTrimp.find(d => d.date === shiftIso(today, -daysAgo) && d.records.length > 0)
  const doms = (d: DailyTRIMP) => d.records.find(r => DOMS_SPORTS.includes(r.sportType))
  const lines: string[] = []

  // The day's sessions together decide whether it's worth a line; the line
  // names one session, so it quotes that session's own load.
  const yesterday = session(1)
  if (yesterday) {
    const load = sessionLoad(yesterday)
    const strength = doms(yesterday)
    const top = topRecord(yesterday.records)
    if (strength) {
      lines.push(`Yesterday's ${sportName(strength)} (${own(strength)} load) is causing delayed muscle soreness (DOMS) — this peaks today and tomorrow, adding to your fatigue.`)
    } else if (load > 150) {
      lines.push(`Yesterday's ${sportName(top)} was a heavy session (${own(top)} load) — that's adding to today's fatigue.`)
    } else if (load > 80) {
      lines.push(`Yesterday's ${sportName(top)} (${own(top)} load) is factoring into today's recovery.`)
    }
  }

  const dayBefore = session(2)
  if (dayBefore) {
    const strength = doms(dayBefore)
    const top = topRecord(dayBefore.records)
    if (strength) {
      lines.push(`${cap(sportName(strength))} from 2 days ago is still causing DOMS — muscle soreness typically peaks at 24-48 hours.`)
    } else if (sessionLoad(dayBefore) > 100) {
      lines.push(`${cap(sportName(top))} from 2 days ago (${own(top)} load) is still influencing your fatigue.`)
    }
  }

  const day3 = session(3)
  const day3Doms = day3 && doms(day3)
  if (day3 && day3Doms && sessionLoad(day3) > 80) {
    lines.push(`${cap(sportName(day3Doms))} from 3 days ago may still have residual DOMS effects.`)
  }

  return lines
}
