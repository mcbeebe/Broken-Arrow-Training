import type { ActualWorkout, TrainingWeek } from '../types'
import { manualLogKey } from '../hooks/useManualLog'

/**
 * Cross-plan strength history — logged workouts must outlive the plan
 * they were logged against.
 *
 * A plan rebuild (onboarding redo) regenerates every week, so `weeks`
 * only carries the CURRENT plan's days. The manual-log store, however,
 * is ISO-keyed and survives rebuilds (the same property the Journal
 * leans on for orphaned reflections). This helper folds those orphaned
 * strength logs back into the history the progression/records layer
 * reads, as a synthetic "week 0" — so e1RM trends, PR detection, and
 * ghost weights all remember what the athlete lifted before the rebuild.
 *
 * Week 0 is a bucket, not a calendar week: sessions inside it still
 * carry their real dates (buildProgression sorts by date), it is
 * excluded from weekly-volume charts, and surfaces label it "previous
 * plan" instead of "Wk 0".
 */
export function weeksWithPriorLogs(
  weeks: TrainingWeek[],
  logs?: Record<string, ActualWorkout> | null,
): TrainingWeek[] {
  if (!logs) return weeks

  // Every key the current plan already represents — same consumption
  // rule as the Journal's orphan feed, plus the attached actuals' own
  // dates for safety.
  const consumed = new Set<string>()
  for (const week of weeks) {
    for (const day of week.days) {
      consumed.add(manualLogKey(day.day))
      consumed.add(day.day)
      const iso = day.actual?.startDate?.slice(0, 10)
      if (iso) consumed.add(iso)
    }
  }

  const orphans: { iso: string; day: TrainingWeek['days'][number] }[] = []
  for (const [key, actual] of Object.entries(logs)) {
    if (consumed.has(key)) continue
    // Only strength history matters here — runs and rides from an old
    // plan have their own record surfaces.
    if (!actual?.strengthLog?.length) continue
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : (actual.startDate || '').slice(0, 10)
    if (!iso || consumed.has(iso)) continue
    consumed.add(iso)
    const [, m, d] = iso.split('-')
    orphans.push({
      iso,
      day: {
        day: `${parseInt(m)}/${parseInt(d)}`,
        type: 'strength',
        workout: actual.name || 'Strength',
        detail: '',
        zone: '—',
        route: '',
        time: '—',
        actual,
      },
    })
  }
  if (orphans.length === 0) return weeks

  orphans.sort((a, b) => a.iso.localeCompare(b.iso))
  const priorWeek: TrainingWeek = {
    num: 0,
    dates: 'Previous plan',
    miles: 0,
    focus: 'Previous plan',
    days: orphans.map(o => o.day),
  }
  return [priorWeek, ...weeks]
}
