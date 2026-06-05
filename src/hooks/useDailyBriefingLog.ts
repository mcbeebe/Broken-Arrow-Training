import { useEffect, useState } from 'react'
import type { CoachInsight } from '../types'
import { localDateStr } from '../utils/format'

/**
 * Records each day's coach briefings so they don't vanish when the
 * dayPeriod() boundary flips.
 *
 * The live insight card (CoachInsightCard on the Coach tab) only ever
 * shows the CURRENT period's read. Without this log, the morning briefing
 * is replaced the moment the clock crosses 1 PM (afternoon) and is
 * unrecoverable — exactly the "where did my morning briefing go?" report.
 *
 * We keep a per-athlete, per-local-date log keyed by period. It self-clears
 * at midnight: yesterday's storage key is simply never read again. The
 * current period stays the live, interactive card; the earlier periods are
 * surfaced as read-only "earlier today" cards so the athlete can scroll
 * back to them.
 */

export type BriefingPeriod = 'morning' | 'afternoon' | 'evening'

export interface BriefingLogEntry {
  period: BriefingPeriod
  generatedAt: number
  text: string
  tip?: string
}

const LS_PREFIX = 'ba_coach_briefing_log_v1:'

const PERIOD_ORDER: Record<BriefingPeriod, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
}

/** Map a timestamp to its briefing period. Boundaries match dayPeriod() in
 *  useCoachInsight (morning 06:00–12:59, afternoon 13:00–19:59, evening
 *  20:00–05:59) so a logged read lands in the same bucket it was generated
 *  for. */
export function periodForTs(ts: number): BriefingPeriod {
  const h = new Date(ts).getHours()
  if (h < 6) return 'evening'
  if (h < 13) return 'morning'
  if (h < 20) return 'afternoon'
  return 'evening'
}

function lsKey(athleteId: string, date: string): string {
  return `${LS_PREFIX}${athleteId}:${date}`
}

/** Upsert a briefing into the log by period. A regenerate within the same
 *  period replaces the prior read; other periods are untouched. Result is
 *  ordered morning → afternoon → evening. Pure (exported for tests). */
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
): BriefingLogEntry[] {
  if (!currentInsight?.generatedAt) return log
  const rank = PERIOD_ORDER[periodForTs(currentInsight.generatedAt)]
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
      period: periodForTs(insight.generatedAt),
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
