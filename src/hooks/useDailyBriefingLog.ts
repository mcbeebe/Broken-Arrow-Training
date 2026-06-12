import { useEffect, useState } from 'react'
import type { CoachInsight } from '../types'
import { localDateStr } from '../utils/format'

/**
 * Records each day's coach briefings so they don't vanish when the
 * dayPeriod() boundary flips.
 *
 * The live insight card (CoachInsightCard on the Coach tab) only ever
 * shows the CURRENT period's read. Without this log, the morning briefing
 * is replaced the moment the clock crosses into the evening window and is
 * unrecoverable — exactly the "where did my morning briefing go?" report.
 *
 * We keep a per-athlete, per-local-date log keyed by period. It self-clears
 * at midnight: yesterday's storage key is simply never read again. The
 * current period stays the live, interactive card; the earlier periods are
 * surfaced as read-only "earlier today" cards so the athlete can scroll
 * back to them.
 */

export type BriefingPeriod = 'morning' | 'evening'

export interface BriefingLogEntry {
  period: BriefingPeriod
  generatedAt: number
  text: string
  tip?: string
}

const LS_PREFIX = 'ba_coach_briefing_log_v1:'

const PERIOD_ORDER: Record<BriefingPeriod, number> = {
  morning: 0,
  evening: 1,
}

/** Map a timestamp to its briefing period. The boundaries match dayPeriod() in
 *  useCoachInsight: morning from `morningHour` until `eveningHour`, evening
 *  otherwise — so a logged read lands in the same bucket it was generated for. */
export function periodForTs(ts: number, morningHour: number = 7, eveningHour: number = 18): BriefingPeriod {
  const h = new Date(ts).getHours()
  if (h >= eveningHour) return 'evening'
  if (h >= morningHour) return 'morning'
  return 'evening'
}

function lsKey(athleteId: string, date: string): string {
  return `${LS_PREFIX}${athleteId}:${date}`
}

/** Upsert a briefing into the log by period. A regenerate within the same
 *  period replaces the prior read; other periods are untouched. Result is
 *  ordered morning → evening. Pure (exported for tests). */
export function mergeBriefing(
  existing: BriefingLogEntry[],
  entry: BriefingLogEntry,
): BriefingLogEntry[] {
  const next = existing.filter(e => e.period !== entry.period)
  next.push(entry)
  next.sort((a, b) => PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period])
  return next
}

/** The briefings from earlier today — those whose period precedes the live
 *  insight's period. When there's no live insight, return the whole log so
 *  nothing is hidden. Pure (exported for tests). */
export function priorBriefings(
  log: BriefingLogEntry[],
  currentInsight: CoachInsight | null,
  morningHour: number = 7,
  eveningHour: number = 18,
): BriefingLogEntry[] {
  if (!currentInsight?.generatedAt) return log
  const rank = PERIOD_ORDER[periodForTs(currentInsight.generatedAt, morningHour, eveningHour)]
  return log.filter(e => PERIOD_ORDER[e.period] < rank)
}

function read(athleteId: string, date: string): BriefingLogEntry[] {
  try {
    const raw = localStorage.getItem(lsKey(athleteId, date))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useDailyBriefingLog(
  athleteId: string,
  insight: CoachInsight | null,
  morningHour: number = 7,
  eveningHour: number = 18,
): BriefingLogEntry[] {
  const today = localDateStr()
  const [log, setLog] = useState<BriefingLogEntry[]>(() => read(athleteId, today))

  // Re-read when the athlete or local date changes (e.g. the date flips at
  // midnight while the app stays open).
  useEffect(() => {
    setLog(read(athleteId, today))
  }, [athleteId, today])

  // Record the current insight into today's log, keyed by its period.
  useEffect(() => {
    if (!insight || insight.silent || !insight.text || !insight.generatedAt) return
    const entry: BriefingLogEntry = {
      period: periodForTs(insight.generatedAt, morningHour, eveningHour),
      generatedAt: insight.generatedAt,
      text: insight.text,
      tip: insight.tip,
    }
    setLog(prev => {
      // Skip if we already logged this exact read (same period, same-or-newer
      // generatedAt) so we don't write/re-render on every snapshot churn.
      const existing = prev.find(e => e.period === entry.period)
      if (existing && existing.generatedAt >= entry.generatedAt) return prev
      const next = mergeBriefing(prev, entry)
      try {
        localStorage.setItem(lsKey(athleteId, today), JSON.stringify(next))
      } catch {
        /* ignore quota */
      }
      return next
    })
  }, [athleteId, today, insight])

  return log
}
